/**
 * Deep Patient Flow conversation engine.
 *
 * A deterministic orchestrator sits between the patient and the LLM:
 * - what to ask next and when a follow-up is warranted is decided in code,
 * - the LLM is only ever used to *phrase* a question naturally and to
 *   *normalize/understand* a free-text answer.
 *
 * Deep Patient Flow adds, on top of the previous linear Q→A router:
 *  1. Dynamic follow-up planning  — after an answer, the planner checks a
 *     small, clinically-bounded rule set (recurrence of a previously treated
 *     symptom) and may ask a synthetic "ai_follow_up" question before the
 *     next doctor question. The AI never invents medical questioning on its
 *     own; every follow-up is defined here in code.
 *  2. Repeat-visit intelligence  — the planner references what happened last
 *     visit ("as you were treated for X last time...") and avoids duplicates.
 *  3. Fact provenance             — every captured fact gets
 *     { key, value, source, visit, recorded_at, status, confidence }.
 *  4. Patient meta-commands       — "skip", "I don't know", corrections.
 *  5. Conversation memory         — already-answered questions are never
 *     re-asked; a re-answer replaces and flags the prior value.
 *  6. Doctor correction           — the doctor's override becomes the
 *     authoritative value while the audit trail keeps the AI/patient origin.
 */
const { PreConsultation } = require("../models/schemas");
const { config } = require("../config");

const CONVO_TIMEOUT_MS = 25_000;

const DEVANAGARI = /[\u0900-\u097F]/;

// ----- Recurrence / meta-command keyword rules (deterministic, bounded) -----

const RECURRENCE_PATTERN =
  /(?:phir\s*se|fir\s*se|phirse|firse|phir|dobara|dubara|wapas|vaapas|again|recurr|return|\bfir\b|फिर|दोबारा|दुबारा|वापस|लौट)/i;

const SKIP_PATTERN =
  /^(?:skip|skip\s+(?:this|it|question)|next\s+question|aage\s+badho|chhod|chhor|chhodo|chhoro|छोड़|छोड़ो|आगे\s+बढ़ो)/i;

const DONT_KNOW_PATTERN =
  /(?:don['’]?t\s+know|dont\s+know|no\s+idea|nahi\s+(?:pata|maloom|pataa)|pata\s+nahi|pata\s+nhi|maloom\s+nahi|नहीं\s+पता|पता\s+नहीं|मालूम\s+नहीं)/i;

// A deliberately small, explicit safety screen. It prompts the patient to
// follow the clinic's urgent-care process; it never diagnoses or prescribes.
const SAFETY_RULES = [
  { code: "chest_pain", pattern: /(?:chest\s*(?:pain|pressure|tightness)|seene?\s*(?:me[ie]n\s*)?(?:dard|dabaav)|सीने\s*में\s*(?:दर्द|दबाव))/i },
  { code: "breathing_difficulty", pattern: /(?:difficulty\s*breath|short(?:ness)?\s*of\s*breath|cannot\s*breathe|saans\s*(?:lene\s*)?(?:mein\s*)?(?:takleef|nahi|kam)|सांस\s*(?:लेने\s*)?(?:में\s*)?(?:तकलीफ|नहीं))/i },
  { code: "severe_bleeding", pattern: /(?:severe\s*bleed|heavy\s*bleed|bleeding\s*(?:a\s*)?lot|bahut\s*(?:zyada\s*)?(?:khoon|bleeding)|बहुत\s*(?:ज़्यादा\s*)?(?:खून|ब्लीडिंग))/i },
  { code: "stroke_warning", pattern: /(?:face\s*(?:droop|numb)|speech\s*(?:slur|problem)|one\s*side\s*(?:weak|numb)|chehra\s*(?:tedha|sun)|bolne\s*mein\s*problem|ek\s*side\s*(?:kamzor|sun)|चेहरा\s*(?:टेढ़ा|सुन्न)|बोलने\s*में\s*दिक्कत|एक\s*तरफ\s*(?:कमज़ोर|सुन्न))/i },
  { code: "unconscious_or_seizure", pattern: /(?:unconscious|passed\s*out|faint(?:ed|ing)?|seizure|fit\s*(?:aaya|aya)|behosh|बेहोश|दौरा)/i },
];

function screenForUrgentSymptoms(rawAnswer) {
  const text = String(rawAnswer || "").trim();
  const flags = SAFETY_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.code);
  if (!flags.length) return null;
  return {
    level: "urgent_review",
    flags,
    source: "patient",
    message: {
      en: "Your response may need prompt medical attention. Please contact the clinic or local emergency service now according to the clinic's emergency process.",
      hi: "आपके उत्तर पर तुरंत चिकित्सा सहायता की जरूरत हो सकती है। कृपया क्लिनिक की आपातकालीन प्रक्रिया के अनुसार अभी क्लिनिक या स्थानीय आपातकालीन सेवा से संपर्क करें।",
    },
  };
}

function detectMetaCommand(rawAnswer) {
  const text = String(rawAnswer || "").trim();
  if (!text) return { type: "empty" };
  if (SKIP_PATTERN.test(text)) return { type: "skip" };
  if (DONT_KNOW_PATTERN.test(text)) return { type: "dont_know" };
  return { type: null };
}

function isRecurrence(currentRaw, structured) {
  const raw = String(currentRaw || "");
  const flags = structured && typeof structured === "object" ? structured : {};
  if (flags.recurrence === true || flags.recurrence === "true" || flags.recurrence === "yes") return true;
  return RECURRENCE_PATTERN.test(raw);
}

function firstTextValue(answers) {
  if (!answers || !answers.length) return null;
  const candidate =
    answers.find((a) => a.value && typeof a.value === "string" && a.value.trim() !== "" && !a.skipped && !a.not_known) ||
    answers.find((a) => a.value_original && typeof a.value_original === "string" && a.value_original.trim() !== "");
  if (candidate) return (candidate.value || candidate.value_original || "").toString().trim();
  return null;
}

function visitFactId(visitNumber) {
  const n = Number(visitNumber) || 1;
  return `V${String(n).padStart(3, "0")}`;
}

async function aiPost(path, payload, timeoutMs = CONVO_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${config.aiServiceUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AI-Key": config.aiServiceApiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.warn(`AI service ${path} failed:`, e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function questionKey(q) {
  return q && q._id ? String(q._id) : `q-${q.order}`;
}

function questionsForVisit(questions, firstVisit) {
  const visitType = firstVisit ? "first_visit" : "follow_up";
  return questions.filter((q) => {
    const t = q.visit_type || "all";
    if (t === "all") return true;
    return t === visitType;
  });
}

function pickNextQuestion({ questions, answeredIds, answerMap, firstVisit }) {
  const eligible = questionsForVisit(questions, firstVisit);
  const shown = [];
  const byId = new Map(eligible.map((q) => [questionKey(q), q]));
  for (const q of eligible) {
    if (!q.show_if_question) {
      shown.push(q);
      continue;
    }
    const value = answerMap.get(String(q.show_if_question));
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    if (values.some((v) => String(v) === String(q.show_if_value))) shown.push(q);
  }
  return shown.find((q) => !answeredIds.has(questionKey(q))) || null;
}

function totalForVisit(questions, firstVisit) {
  return questionsForVisit(questions, firstVisit).length;
}

function phraseFallback(q) {
  return { en: q.text, hi: q.text_hi || q.text };
}

async function phraseQuestion(q, previousAnswer, firstVisit) {
  const data = await aiPost("/api/screening/phrase-question", {
    question_text: q.text,
    question_text_hi: q.text_hi || "",
    answer_type: q.answer_type,
    options: q.options || [],
    previous_answer: previousAnswer ?? null,
    visit_context: firstVisit ? "first_visit" : "follow_up",
  });
  if (!data || !data.en) return phraseFallback(q);
  return { en: data.en, hi: data.hi || q.text_hi || q.text };
}

function understandFallback(rawAnswer) {
  const hint = DEVANAGARI.test(rawAnswer) ? "hi" : "en";
  return {
    normalized: String(rawAnswer).trim(),
    language: hint,
    structured: { summary: String(rawAnswer).trim() },
    needs_clarification: false,
    clarification_question: null,
  };
}

async function understandAnswer({ q, rawAnswer }) {
  const data = await aiPost("/api/screening/understand-answer", {
    question_text: q.text,
    question_text_hi: q.text_hi || "",
    answer_type: q.answer_type,
    options: q.options || [],
    answer: String(rawAnswer || ""),
  });
  if (!data) return understandFallback(rawAnswer);
  return data;
}

function answerRecord({ q, normalized, rawAnswer, language, structured, skipped, notKnown }) {
  return {
    question_id: questionKey(q),
    question_text: q.text,
    answer_type: q.answer_type,
    category: q.category || "doctor",
    value:
      skipped || notKnown
        ? String(rawAnswer).trim()
        : typeof normalized === "string" && normalized.trim()
          ? normalized.trim()
          : String(rawAnswer).trim(),
    value_original: String(rawAnswer).trim(),
    translated: language !== "en",
    language: language || "en",
    structured: structured || { summary: String(rawAnswer).trim() },
    skipped: Boolean(skipped),
    not_known: Boolean(notKnown),
    fact_status: "reported",
  };
}

function deterministicSummary(answers, department) {
  const lines = answers.map((a) => {
    const val = Array.isArray(a.value) ? a.value.join(", ") : a.value;
    return `${a.question_text}: ${val == null || val === "" ? "Not reported" : val}`;
  });
  const narrative = (
    `Chief complaint\n${answers[0] ? (Array.isArray(answers[0].value) ? answers[0].value.join(", ") : answers[0].value) || "Not reported" : "Not reported"}\n\n` +
    `Symptoms\n${lines.join("\n") || "Not reported"}\n\n` +
    `Clinical snapshot\nThis summary was built automatically from ${answers.length} answer${answers.length === 1 ? "" : "s"} because the AI assistant was unavailable.`
  );
  return { narrative, sections: null, deterministic: true };
}

async function finalizeSummary({ screening, appointment, patient, visitNumber, firstVisit, previous = null }) {
  const answers = (screening.answers || [])
    .filter((a) => !a.skipped && !a.not_known)
    .filter((a) => a.value !== null && a.value !== undefined && a.value !== "")
    .map((a) => ({
      question: a.question_text,
      answer: a.correction && a.correction.value != null ? a.correction.value : a.value,
      value_original: a.value_original ?? null,
      category: a.category || "doctor",
    }));
  const previousRaw = previous?.summary?.narrative || screening.previous_summary || null;

  const data = await aiPost("/api/screening/comprehensive-summary", {
    answers,
    previous_summary: previousRaw,
    department: appointment.department || (appointment.department_id ? String(appointment.department_id) : "") || "",
    patient_name: patient.user_id?.full_name || "Patient",
    visit_number: visitNumber,
  });

  const summary =
    data && data.summary && data.summary.narrative
      ? { narrative: data.summary.narrative, sections: data.summary.sections || null, source: "comprehensive" }
      : deterministicSummary(screening.answers || [], appointment.department);

  screening.summary = summary;
  screening.status = "completed";
  screening.completed_at = new Date();
  screening.visit_number = visitNumber;
  screening.draft = null;
  return summary;
}

async function loadVisitContext(patientId, excludeAppointmentId) {
  const prior = await PreConsultation.find({ patient_id: patientId, status: "completed" })
    .where("appointment_id").ne(excludeAppointmentId)
    .sort({ createdAt: -1 })
    .lean();
  const previous = prior[0] || null;
  return { firstVisit: prior.length === 0, visitNumber: prior.length + 1, previous };
}

async function getScreening(appointmentId) {
  return PreConsultation.findOne({ appointment_id: appointmentId });
}

// ----- Deep Patient Flow: fact provenance -----------------------------------

function upsertFacts(screening, record, visitNumber) {
  if (!record) return;
  const facts = screening.facts || [];
  const visitId = visitFactId(visitNumber);
  const now = new Date();

  const push = (key, fact, value) => {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value) && value.length === 0) return;
    const previous = facts.find((f) => f.key === key && f.status === "current");
    if (previous && String(previous.value) === String(value)) return;
    if (previous) previous.status = "superseded";
    facts.push({
      key,
      fact,
      value,
      question_id: record.question_id || null,
      source: record.corrected ? "doctor" : "patient",
      visit_id: visitId,
      recorded_at: now,
      status: "current",
      confidence: record.confidence || "auto",
    });
  };

  const structured = record.structured && typeof record.structured === "object" ? record.structured : {};
  const qText = String(record.question_text || "").toLowerCase();

  if (["text", "voice", "text_voice"].includes(record.answer_type)) {
    const label = /what|problem|समस्या|तकलीफ|kya/i.test(qText)
      ? "Chief complaint"
      : /kab|since|when|kitne|बुखार.*से|duration/i.test(qText)
        ? "Reported duration"
        : "Reported detail";
    if (!record.skipped && !record.not_known) {
      push(`symptom.${record.question_id}`, label, normalizeValue(record.value));
    }
  }

  if (structured.symptom) push("symptom.primary", "Primary symptom", structured.symptom);
  if (structured.duration) push("duration", "Duration", structured.duration);
  if (structured.severity) push("severity", "Severity", structured.severity);
  if (structured.location) push("location", "Location", structured.location);
  if (structured.medication) push("medication", "Medication / treatment", structured.medication);
  if (structured.recurrence) push("recurrence", "Symptom recurrence", structured.recurrence);
  if (structured.improvement != null && structured.improvement !== "") {
    push("previous_treatment_effect", "Effect of previous treatment", structured.improvement);
  } else if (record.detected && record.detected.previous_treatment_effect) {
    push("previous_treatment_effect", "Effect of previous treatment", record.detected.previous_treatment_effect);
  }
  if (record.detected && record.detected.returned_since) {
    push("returned_since", "Symptom returned since", record.detected.returned_since);
  }

  screening.facts = facts;
}

function normalizeValue(v) {
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

// ----- Deep Patient Flow: conversation planner (follow-ups) -----------------

function recurrenceFollowUp1(previousChief) {
  return {
    _id: "fu-recurrence-1",
    text: `Last visit you were treated for ${previousChief}. Did that treatment help, or has the problem returned?`,
    text_hi: `पिछली बार आपका ${previousChief} का इलाज हुआ था। क्या उस इलाज से आराम मिला था, या समस्या फिर से शुरू हो गई है?`,
    answer_type: "text_voice",
    required: false,
    options: [],
    category: "ai_follow_up",
    show_if_question: null,
    show_if_value: null,
    visit_type: "follow_up",
    order: 900,
    _meta: { rule: "recurrence", step: 1, source: "conversation_planner" },
  };
}

function recurrenceFollowUp2() {
  return {
    _id: "fu-recurrence-2",
    text: "I understand. When did the problem return — since when have you had it again?",
    text_hi: "समझ गया। समस्या फिर से कब शुरू हुई — फिर से कब से यह परेशानी है?",
    answer_type: "text_voice",
    required: false,
    options: [],
    category: "ai_follow_up",
    show_if_question: null,
    show_if_value: null,
    visit_type: "follow_up",
    order: 901,
    _meta: { rule: "recurrence", step: 2, source: "conversation_planner" },
  };
}

function previousChief(previous) {
  if (!previous) return null;
  return firstTextValue(previous.answers || []);
}

function followUpAlreadyAsked(screening, questionId) {
  return (screening.answers || []).some((a) => String(a.question_id) === questionId);
}

function existingFollowUp(screening, rule, step) {
  return (screening.follow_ups || []).find((f) => f._meta && f._meta.rule === rule && f._meta.step === step);
}

function pendingFollowUp(screening) {
  const asked = new Set((screening.answers || []).map((a) => String(a.question_id)));
  return (screening.follow_ups || []).find((f) => !asked.has(questionKey(f))) || null;
}

/**
 * Decide, entirely in code, whether a bounded follow-up is warranted after an
 * answer. Returns a list of follow-up questions to append (max one new one per
 * call). The LLM is never asked to invent a question.
 */
function planFollowUps({ screening, previous, justAnsweredQuestionId, rawAnswer, structured }) {
  if (!screening.follow_ups) screening.follow_ups = [];
  const existing = screening.follow_ups;
  const created = [];
  const fu1 = existingFollowUp(screening, "recurrence", 1);

  // Chain step 2 -> after the patient answered fu-recurrence-1, ask "since when?"
  if (String(justAnsweredQuestionId).startsWith("fu-recurrence-1") && !existingFollowUp(screening, "recurrence", 2)) {
    const fu2 = recurrenceFollowUp2();
    existing.push(fu2);
    created.push(fu2);
    screening.conversation_plan = planLog(screening, fu2);
    return created;
  }

  // Step 1 -> trigger when a text answer mentions the problem returning.
  if (!fu1 && previous && isRecurrence(rawAnswer, structured)) {
    const chief = previousChief(previous);
    if (chief && !followUpAlreadyAsked(screening, "fu-recurrence-1")) {
      const fu1q = recurrenceFollowUp1(chief);
      existing.push(fu1q);
      created.push(fu1q);
      screening.conversation_plan = planLog(screening, fu1q);
    }
  }
  return created;
}

function planLog(screening, fu) {
  const existing = Array.isArray(screening.conversation_plan) ? screening.conversation_plan : [];
  if (!existing.some((e) => e && e.question_id === questionKey(fu))) {
    existing.push({
      type: fu.category || "ai_follow_up",
      rule: fu._meta && fu._meta.rule,
      question_id: questionKey(fu),
      question_text: fu.text,
      created_at: new Date(),
    });
  }
  return existing;
}

async function recordConversationPlanStart(screening, questions, firstVisit) {
  const existing = Array.isArray(screening.conversation_plan) ? screening.conversation_plan : [];
  for (const q of questionsForVisit(questions, firstVisit)) {
    const key = questionKey(q);
    if (!existing.some((e) => e && e.question_id === key)) {
      existing.push({ type: q.category || "doctor", question_id: key, question_text: q.text, created_at: new Date() });
    }
  }
  screening.conversation_plan = existing;
  return existing;
}

// ----- Doctor correction (authoritative override with audit trail) ----------

async function correctAnswer({ screening, questionId, newValue, reason, user }) {
  const answers = screening.answers || [];
  const index = answers.findIndex((a) => String(a.question_id) === String(questionId));
  if (index < 0) throw Object.assign(new Error("No answer found for this screening"), { status: 404 });

  const answer = answers[index];
  const original = answer.correction && answer.correction.value != null ? answer.correction.value : answer.value;
  const normalizedNew = typeof newValue === "string" ? newValue.trim() : newValue;
  if (normalizedNew === "" || normalizedNew == null) throw Object.assign(new Error("A correction value is required"), { status: 400 });

  answer.value = normalizedNew;
  answer.corrected = true;
  answer.fact_status = "corrected";
  answer.correction = {
    value: normalizedNew,
    original_value: original,
    reason: reason || null,
    by_user_id: user.id,
    by_name: user.full_name || user.email || null,
    at: new Date(),
  };

  // Supersede patient-derived facts for this question; the doctor's fact wins.
  const facts = screening.facts || [];
  facts.forEach((f) => {
    if (f.question_id === String(questionId) && f.status === "current") f.status = "superseded";
  });
  const visitId = visitFactId(screening.visit_number || 1);
  facts.push({
    key: `symptom.${questionId}`,
    fact: answer.question_text || "Corrected detail",
    value: Array.isArray(normalizedNew) ? normalizedNew.join(", ") : String(normalizedNew),
    question_id: String(questionId),
    source: "doctor",
    visit_id: visitId,
    recorded_at: new Date(),
    status: "current",
    confidence: "high",
  });
  screening.facts = facts;

  screening.corrections = screening.corrections || [];
  screening.corrections.push({
    question_id: String(questionId),
    question_text: answer.question_text,
    ai_value: original,
    doctor_value: normalizedNew,
    reason: reason || null,
    by_user_id: user.id,
    by_name: user.full_name || user.email || null,
    at: new Date(),
  });

  await screening.save();
  return answer;
}

// ----- Conversation start ----------------------------------------------------

async function startConversation({ appointment, patient, questionnaire }) {
  const { firstVisit, visitNumber, previous } = await loadVisitContext(patient._id, appointment._id);
  const questions = (questionnaire.questions || []).slice().sort((a, b) => a.order - b.order);

  let screening = await getScreening(appointment._id);
  if (!screening) {
    screening = new PreConsultation({
      appointment_id: appointment._id,
      hospital_id: appointment.hospital_id,
      department_id: appointment.department_id,
      patient_id: patient._id,
      questionnaire_id: questionnaire._id,
      questionnaire_version: questionnaire.version,
      started_at: new Date(),
    });
    await screening.save();
  }

  await recordConversationPlanStart(screening, questions, firstVisit);

  const answers = screening.answers || [];
  const answerMap = new Map(answers.map((a) => [String(a.question_id), a.value]));
  const answeredIds = new Set(answers.map((a) => String(a.question_id)));
  const next = pickNextQuestion({ questions, answeredIds, answerMap, firstVisit });

  const previousAnswerOf = (q) => {
    if (!previous) return null;
    const entry = (previous.answers || []).find((a) => String(a.question_id) === questionKey(q));
    return (entry && (entry.value_original ?? entry.value)) || null;
  };

  const greeting = firstVisit
    ? {
        en: `Namaste! I'm the pre-consultation assistant. To help the doctor prepare for your visit, I'll ask you a few quick questions. You can type or speak in Hindi or English — whatever is easiest for you.`,
        hi: `नमस्ते! मैं प्री-कंसल्टेशन सहायक हूँ। आपके विज़िट से पहले डॉक्टर की मदद के लिए मैं आपसे कुछ सवाल पूछूँगा। आप हिंदी या अंग्रेज़ी में मुझसे बात कर सकते हैं — जो आपको आसान लगे।`,
      }
    : previous && previous.completed_at
      ? {
          en: `Namaste! Welcome back. I remember your last visit on ${new Date(previous.completed_at).toLocaleDateString("en-IN")}. Let me quickly check how you're doing now.`,
          hi: `नमस्ते! वापस आने का स्वागत है। मुझे आपकी पिछली विज़िट याद है (${new Date(previous.completed_at).toLocaleDateString("en-IN")})। चलिए देखते हैं कि अब आप कैसे हैं।`,
        }
      : {
          en: "Namaste! Welcome back. Let me quickly check how you are doing now.",
          hi: "नमस्ते! वापस आने का स्वागत है। चलिए देखते हैं कि अब आप कैसे हैं।",
        };

  let nextQuestion = null;
  if (next) {
    const phrased = await phraseQuestion(next, previousAnswerOf(next), firstVisit);
    nextQuestion = Object.assign({ id: questionKey(next) }, questionJson(next), { phrased });
    screening.conversation_log.push({
      role: "ai",
      question_id: questionKey(next),
      text: phrased.en,
      hi: phrased.hi,
      ts: new Date(),
    });
  } else if (screening.status !== "completed" && answers.length) {
    await finalizeSummary({ screening, appointment, patient, visitNumber, firstVisit, previous });
  }

  await screening.save();

  const total = totalForVisit(questions, firstVisit) + (screening.follow_ups || []).length;
  return {
    status: screening.status,
    visit: { first_visit: firstVisit, number: visitNumber, previous_number: previous?.visit_number || (firstVisit ? 0 : visitNumber - 1) },
    greeting,
    next_question: nextQuestion,
    answered_questions: answers.map((a) => a.question_id),
    total_questions: total,
    answered_count: answers.length,
    previous_visit:
      previous && previous.summary
        ? {
            number: previous.visit_number || visitNumber - 1,
            completed_at: previous.completed_at || previous.createdAt || null,
            summary: typeof previous.summary.narrative === "string" ? previous.summary.narrative.slice(0, 600) : null,
          }
        : null,
    summary: screening.status === "completed" ? screening.summary : null,
    facts: screening.facts || [],
    plan: screening.conversation_plan || [],
  };
}

async function handleMessage({ appointment, patient, questionnaire, questionId, rawAnswer, finalizeOnly }) {
  const questions = (questionnaire.questions || []).slice().sort((a, b) => a.order - b.order);
  const { firstVisit, visitNumber, previous } = await loadVisitContext(patient._id, appointment._id);

  let screening = await getScreening(appointment._id);
  if (!screening) {
    screening = new PreConsultation({
      appointment_id: appointment._id,
      hospital_id: appointment.hospital_id,
      department_id: appointment.department_id,
      patient_id: patient._id,
      questionnaire_id: questionnaire._id,
      questionnaire_version: questionnaire.version,
      started_at: new Date(),
    });
  }
  if (!screening.follow_ups) screening.follow_ups = [];
  if (!screening.facts) screening.facts = [];
  await recordConversationPlanStart(screening, questions, firstVisit);

  const q =
    questions.find((x) => questionKey(x) === questionId) ||
    (screening.follow_ups || []).find((x) => questionKey(x) === questionId);
  if (!q) throw Object.assign(new Error("Unknown question"), { status: 400 });

  if (finalizeOnly) {
    await finalizeSummary({ screening, appointment, patient, visitNumber, firstVisit, previous });
    await screening.save();
    return buildTurn({ screening, appointment, patient, questionnaire, firstVisit, visitNumber, q, done: true, summary: screening.summary });
  }

  const raw = String(rawAnswer || "").trim();
  const meta = detectMetaCommand(raw);
  const skipped = meta.type === "skip";
  const notKnown = meta.type === "dont_know";

  const ai = skipped || notKnown ? null : await understandAnswer({ q, rawAnswer });
  let needsClarification = Boolean(!skipped && !notKnown && ai && ai.needs_clarification);
  let clarification = needsClarification && ai && ai.clarification_question ? ai.clarification_question : null;

  const draft = screening.draft || {};
  if (needsClarification && String(draft.question_id || "") === questionId && (draft.attempts || 0) < 1) {
    screening.draft = { question_id: questionId, raw: String(draft.raw || ""), attempts: (draft.attempts || 0) + 1 };
    screening.conversation_log.push({ role: "ai", question_id: questionId, clarification: true, text: clarification?.en || "Could you repeat that, please?", hi: clarification?.hi || "", ts: new Date() });
    await screening.save();
    return buildTurn({ screening, appointment, patient, questionnaire, firstVisit, visitNumber, q, clarification, done: false, total: totalForVisit(questions, firstVisit) + (screening.follow_ups || []).length });
  }
  if (needsClarification) needsClarification = false;

  const normalized = ai?.normalized ?? raw;
  const language = ai?.language ?? (DEVANAGARI.test(raw) ? "hi" : "en");
  const structured = ai?.structured && typeof ai.structured === "object" ? ai.structured : { summary: raw };
  const detected = detectAnswerContext({ raw, structured, q, previous });
  const confidence = ai?.confidence || (raw.length < 3 ? "low" : "auto");

  const record = answerRecord({ q, normalized, rawAnswer: raw, language, structured, skipped, notKnown });
  record.detected = detected;
  record.confidence = confidence;
  const safety = skipped || notKnown ? null : screenForUrgentSymptoms(raw);
  if (safety) {
    screening.safety_events = screening.safety_events || [];
    screening.safety_events.push({ ...safety, question_id: questionId, original_text: raw, recorded_at: new Date() });
    screening.conversation_log.push({ role: "system", question_id: questionId, safety: true, text: safety.message.en, hi: safety.message.hi, flags: safety.flags, ts: new Date() });
  }

  screening.answers = screening.answers || [];
  const existingIndex = screening.answers.findIndex((a) => String(a.question_id) === questionId);
  if (existingIndex >= 0) {
    const priorValue = screening.answers[existingIndex].value;
    if (!skipped && !notKnown && String(priorValue) !== String(record.value)) {
      screening.answers[existingIndex].corrected = true;
      screening.answers[existingIndex].fact_status = "superseded";
      screening.conversation_log.push({
        role: "patient",
        question_id: questionId,
        correction: true,
        text: raw,
        language,
        previous_value: priorValue,
        ts: new Date(),
      });
    }
    screening.answers[existingIndex] = record;
  } else {
    screening.answers.push(record);
  }

  const orderMap = new Map(questions.map((x, i) => [questionKey(x), i]));
  screening.answers.sort((a, b) => {
    const ai = a.question_id.startsWith("fu-") ? 900 : orderMap.get(a.question_id) ?? 0;
    const bi = b.question_id.startsWith("fu-") ? 900 : orderMap.get(b.question_id) ?? 0;
    if (ai !== bi) return ai - bi;
    return String(a.question_id).localeCompare(String(b.question_id));
  });

  if (!skipped) {
    screening.conversation_log.push({ role: "patient", question_id: questionId, text: raw, language, follow_up: String(questionId).startsWith("fu-"), ts: new Date() });
  }
  screening.draft = null;

  upsertFacts(screening, record, visitNumber);

  // ---- Dynamic follow-up planning happens AFTER every answer ----
  const created = planFollowUps({ screening, previous, justAnsweredQuestionId: questionId, rawAnswer: raw, structured });

  const askNext = async () => {
    // 1. Prefer a pending (planned but unanswered) follow-up question.
    //    Conversation memory: fu questions are never re-created once answered.
    const pending = pendingFollowUp(screening);
    if (pending) {
      const phrased = await phraseQuestion(pending, null, firstVisit);
      const turn = Object.assign({ id: questionKey(pending) }, questionJson(pending), { phrased });
      screening.conversation_log.push({ role: "ai", question_id: questionKey(pending), follow_up: true, rule: pending._meta && pending._meta.rule, text: phrased.en, hi: phrased.hi, ts: new Date() });
      await screening.save();
      return buildTurn({ screening, appointment, patient, questionnaire, firstVisit, visitNumber, q, turn, done: false, safety, total: totalForVisit(questions, firstVisit) + (screening.follow_ups || []).length });
    }

    // 2. Otherwise the next doctor-defined question.
    const answers = screening.answers;
    const answerMap = new Map(answers.map((a) => [String(a.question_id), a.value]));
    const answeredIds = new Set(answers.map((a) => String(a.question_id)));
    const next = pickNextQuestion({ questions, answeredIds, answerMap, firstVisit });
    if (next) {
      const previousAnswer = previous ? (previous.answers || []).find((a) => String(a.question_id) === questionKey(next))?.value_original ?? (previous.answers || []).find((a) => String(a.question_id) === questionKey(next))?.value : null;
      const phrased = await phraseQuestion(next, previousAnswer, firstVisit);
      const turn = Object.assign({ id: questionKey(next) }, questionJson(next), { phrased });
      screening.conversation_log.push({ role: "ai", question_id: questionKey(next), text: phrased.en, hi: phrased.hi, ts: new Date() });
      await screening.save();
      return buildTurn({ screening, appointment, patient, questionnaire, firstVisit, visitNumber, q, turn, done: false, safety, total: totalForVisit(questions, firstVisit) + (screening.follow_ups || []).length });
    }

    // 3. Done -> finalize.
    await finalizeSummary({ screening, appointment, patient, visitNumber, firstVisit, previous });
    await screening.save();
    return buildTurn({ screening, appointment, patient, questionnaire, firstVisit, visitNumber, q, done: true, summary: screening.summary, safety });
  };

  return askNext();
}

/**
 * Lightweight deterministic context around an answer, used to enrich the fact
 * story without trusting the LLM. The LLM's structured fields are merged in
 * only where present; a doctor/HOD defines anything deeper.
 */
function detectAnswerContext({ raw, structured, q, previous }) {
  const context = {};
  const isFu1 = String(q._id || "").startsWith("fu-recurrence-1");
  if (isFu1) {
    const text = String(raw || "");
    const lower = text.toLowerCase();
    if (/(?:complete|fully|bilkul|poora|theek ho|resolve|no more|achha ho)/i.test(lower)) {
      context.previous_treatment_effect = "Resolved / effective";
    } else if (/(?:return|again|phir|dobara|wapas|फिर|दोबारा|वापस)/i.test(lower)) {
      context.previous_treatment_effect = "Partially / returned";
    } else if (/(?:nahi|no|didn'?t|not)/i.test(lower)) {
      context.previous_treatment_effect = "No improvement";
    } else {
      context.previous_treatment_effect = "Reported";
    }
  }
  const isFu2 = String(q._id || "").startsWith("fu-recurrence-2");
  if (isFu2) {
    context.returned_since = String(raw || "").trim();
  }
  // If the structured extraction (LLM) disagrees with the deterministic guess,
  // prefer the explicit structured signal when present and coherent.
  if (structured && typeof structured === "object") {
    if (structured.improvement) context.previous_treatment_effect = structured.improvement;
    if (structured.returned_since) context.returned_since = structured.returned_since;
  }
  void previous;
  return context;
}

function buildTurn({ screening, firstVisit, visitNumber, q, clarification, turn, done, summary, safety, total }) {
  const previous_question = q
    ? {
        question_id: questionKey(q),
        question_text: q.text,
        answer_type: q.answer_type,
        value: (screening.answers || []).find((a) => String(a.question_id) === questionKey(q))?.value ?? null,
        value_original: (screening.answers || []).find((a) => String(a.question_id) === questionKey(q))?.value_original ?? null,
        translated: Boolean((screening.answers || []).find((a) => String(a.question_id) === questionKey(q))?.translated),
        language: (screening.answers || []).find((a) => String(a.question_id) === questionKey(q))?.language ?? null,
        corrected: Boolean((screening.answers || []).find((a) => String(a.question_id) === questionKey(q))?.corrected),
      }
    : null;
  const completion =
    done && typeof summary === "object" && summary
      ? {
          en: "That's all my questions for today. Thank you! Your answers have been shared with the doctor.",
          hi: "आज के लिए मेरे सभी सवाल पूरे हो गए। धन्यवाद! आपके उत्तर डॉक्टर को भेज दिए गए हैं।",
        }
      : null;
  return {
    turn: {
      status: screening.status,
      visit: { first_visit: firstVisit, number: visitNumber },
      total_questions: total || 0,
      answered_count: (screening.answers || []).length,
      answered: previous_question,
      clarification,
      next_question: turn,
      done: Boolean(done),
      completion,
      safety: safety || null,
    },
    summary: summary || null,
  };
}

function questionJson(q) {
  return {
    text: q.text,
    text_hi: q.text_hi || null,
    answer_type: q.answer_type,
    category: q.category || "doctor",
    required: Boolean(q.required),
    options: q.options || [],
    show_if_question: q.show_if_question ? String(q.show_if_question) : null,
    show_if_value: q.show_if_value || null,
    order: q.order,
    visit_type: q.visit_type || "all",
    rule: q._meta && q._meta.rule ? q._meta.rule : null,
  };
}

module.exports = { startConversation, handleMessage, getScreening, correctAnswer, detectMetaCommand, screenForUrgentSymptoms, questionKey, questionJson, totalForVisit };
