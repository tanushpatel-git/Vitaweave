"""
Conversational pre-consultation screening engine.

Three capabilities, all serving the Express screening orchestrator:

1. /api/screening/understand-answer
   Normalize a free-text (typed or transcribed) patient answer, detect its
   language, extract lightweight structured fields, and decide whether a
   clarification question is needed.

2. /api/screening/phrase-question
   Turn a questionnaire question into a natural, bilingual, conversational
   prompt - including previous-visit context when the same question was
   answered before.

3. /api/screening/comprehensive-summary
   Produce the doctor-facing English summary for the whole conversation,
   including previous-visit review and "new since last visit".

This engine never diagnoses, never prescribes, and never invents medical
facts; it only documents and structures what the patient reports.
"""
import json
import re

from fastapi import APIRouter, Depends

from ...llm.provider import get_provider
from ..deps import verify_ai_key

router = APIRouter()

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")

# Deterministic headline detection so recurrence/improvement are never lost if
# the model omits them. These are the same bounded rules the Express planner
# applies; the LLM only ever refines them.
RECURRENCE_RE = re.compile(
    r"(?:phir\s*se|fir\s*se|phirse|firse|phir|dobara|dubara|wapas|vaapas|"
    r"again|recurr|return|\bfir\b|फिर|दोबारा|दुबारा|वापस|लौट)",
    re.IGNORECASE,
)
RESOLVED_RE = re.compile(
    r"(?:complete|fully|bilkul|poora|theek ho gay|resolve|no more|achha ho|"
    r"ठीक हो गया|पूरा ठीक)",
    re.IGNORECASE,
)
RETURNED_RE = re.compile(
    r"(?:return|again|phir|dobara|wapas|फिर|दोबारा|वापस|लौट)", re.IGNORECASE
)
DURATION_RE = re.compile(r"(\d+)\s*(?:din|day|saal|week|month|سال|से)", re.IGNORECASE)


def _detect_extras(answer_text: str) -> dict:
    """Merge deterministic recurrence/improvement/duration signals."""
    extras = {}
    if RECURRENCE_RE.search(answer_text):
        extras["recurrence"] = "true"
    if RESOLVED_RE.search(answer_text):
        extras["improvement"] = "Resolved / fully improved"
    elif RETURNED_RE.search(answer_text):
        extras["improvement"] = "Improved then returned"
    elif re.search(r"(?:nahi|no|didn't|not)", answer_text, re.IGNORECASE):
        extras["improvement"] = "No improvement reported"
    match = DURATION_RE.search(answer_text)
    if match:
        extras["duration"] = f"{match.group(1)} day(s)"
    return extras


def _merge_structured(structured: dict, answer_text: str) -> dict:
    if not isinstance(structured, dict):
        structured = {}
    for key, value in _detect_extras(answer_text).items():
        if not structured.get(key):
            structured[key] = value
    return structured

NO_ANSWERS_YET = (
    "\nImportant: you must not answer the patient's question yourself, make "
    "any diagnosis or treatment recommendation, or give any medical advice. "
    "You only gather and structure the patient's answers."
)

UNDERSTAND_SYSTEM = (
    "You are a multilingual medical screening interviewer. A patient answers "
    "a screening question- verbally or typed- in any language (Hindi, "
    "English, or Hinglish). Your job is to record their answer.\n\n"
    "Rules:\n"
    "- Return ONLY a JSON object, no markdown fences, no commentary.\n"
    "- 'normalized': the answer cleaned up and written in clear professional "
    "  English. For yes_no questions use exactly 'Yes' or 'No'. For number "
    "  questions return just the number. For date questions use YYYY-MM-DD "
    "  when a date is recognizable. For choice questions pick the closest "
    "  option from 'options' if provided (verbatim), otherwise keep the "
    "  free text.\n"
    "- 'language': detect the language of the patient's raw answer and use "
    "  one of: 'en' (English), 'hi' (Hindi), 'hinglish' (mixed), or 'other'."
    "\n"
    "- 'structured': a JSON sub-object with ONLY these keys, each a string, "
    "  empty string when not mentioned: summary (one concise English line), "
    "  symptom (the key symptom word, e.g. 'abdominal pain'), "
    "  duration, severity, location, medication, notes, "
    "  recurrence ('true'/'false': is this symptom reported as a RETURN/"
    "  recurrence of a previous problem, e.g. 'phir se', 'again', 'dobara'), "
    "  improvement (patient's own words on how a previous treatment went - "
    "  e.g. 'resolved', '70% better', 'no change'), "
    "  returned_since (how long the problem has been back, e.g. '3 days').\n"
    "- 'needs_clarification': true only when the answer is empty, is "
    "  ambiguous/hard to understand, contradicts the question (e.g. a number "
    "  question answered with text), or is too short for a required question."
    "\n"
    "- 'clarification_question': when needs_clarification is true, a short "
    "  polite re-ask. Give it as a sub-object with keys 'en' and 'hi'.\n"
    "- Never diagnose, never prescribe, never refuse based on medical "
    "  content. If the patient says something unrelated, summarize it plainly."
)

PHRASE_SYSTEM = (
    "You are a warm, professional medical screening assistant who talks to "
    "patients in a friendly, respectful tone. The system has selected the "
    "next screening question. Phrase it naturally as a spoken conversation, "
    "not as a form label.\n\n"
    "Return ONLY a JSON object with keys 'en' and 'hi' (both strings), no "
    "markdown fences. If a 'previous_answer' is provided, gently reference it "
    "so the patient does not feel they are repeating themselves and can "
    "correct or confirm it. If the question has options for choice answers, "
    "mention the available options naturally in the phrasing.\n"
    "Never give medical advice, never diagnose. Keep it short (1-2 sentences "
    "per language)."
)

SUMMARY_SYSTEM = (
    "You are a medical documentation assistant for doctors. You receive the "
    "patient's structured pre-consultation answers from a conversation, plus "
    "the previous visit's summary when one exists.\n\n"
    "Produce ONE consolidated clinical summary in English as a JSON object "
    "with exactly these keys (each a string, use 'Not reported' when "
    "missing):\n"
    "- chief_complaint\n"
    "- onset_and_duration\n"
    "- symptoms\n"
    "- severity\n"
    "- current_treatment_and_self_care\n"
    "- additional_context\n"
    "- previous_visit_review\n"
    "- new_since_last_visit\n"
    "- patients_own_words\n"
    "- important_for_doctor\n"
    "- clinical_snapshot\n"
    "- disclaimer: 'This summary was generated by AI from the patient's own "
    "answers. It is for reference only and is not a diagnosis.'\n\n"
    "Rules:\n"
    "- Base everything ONLY on the supplied answers. Never invent symptoms, "
    "  tests, diagnoses, or medication doses.\n"
    "- previous_visit_review: summarize what was reported last visit "
    "  (or 'Not reported' when no previous visit summary is given).\n"
    "- new_since_last_visit: list only items from this visit that differ "
    "  from or add to the previous visit. Mark clearly 'not reported' when "
    "  nothing new is mentioned or there is no previous visit.\n"
    "- patients_own_words: 1-2 short verbatim quotes. Keep the patient's "
    "  original words (Hindi/Hinglish allowed) and add a brief English gloss "
    "  in brackets.\n"
    "- important_for_doctor: key observations, reported symptoms, any "
    "  contradictions or follow-ups the doctor may wish to probe.\n"
    "- Return ONLY valid JSON, no markdown fences, no preamble."
)


@router.post("/screening/understand-answer")
async def understand_answer(
    body: dict,
    _req=Depends(verify_ai_key),
):
    question_text = str(body.get("question_text") or "").strip()
    answer_text = str(body.get("answer") or "").strip()
    answer_type = str(body.get("answer_type") or "text").strip()
    options = body.get("options") or []

    if not answer_text:
        return {
            "normalized": "",
            "language": None,
            "structured": {},
            "needs_clarification": True,
            "clarification_question": {
                "en": "I couldn't hear that clearly. Could you tell me again, please?",
                "hi": "मुझे यह स्पष्ट नहीं सुनाई दिया। क्या आप एक बार फिर से बता सकते हैं?",
            },
        }

    if answer_type in ("yes_no",):
        lowered = answer_text.lower()
        if any(word in lowered for word in ("yes", "yep", "haan", "han", "hmm", "ha", "ho", "hai")):
            return {"normalized": "Yes", "language": "hi" if DEVANAGARI_RE.search(answer_text) else "en",
                    "structured": {}, "needs_clarification": False, "clarification_question": None}
        if any(word in lowered for word in ("no", "nahi", "nhi", "nah", "na")):
            return {"normalized": "No", "language": "hi" if DEVANAGARI_RE.search(answer_text) else "en",
                    "structured": {}, "needs_clarification": False, "clarification_question": None}

    if answer_type == "number":
        numbers = re.findall(r"-?\d+(?:\.\d+)?", answer_text)
        if numbers:
            return {"normalized": numbers[0], "language": "hi" if DEVANAGARI_RE.search(answer_text) else "en",
                    "structured": {}, "needs_clarification": False, "clarification_question": None}
        # Hindi number words (एक to दस) -> digits 1-10
        default_dict = {
            "शून्य": "0", "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पाँच": "5", "पांच": "5",
            "छह": "6", "छः": "6", "सात": "7", "आठ": "8", "नौ": "9", "दस": "10",
        }
        lowered = answer_text.strip().lower()
        if lowered in default_dict:
            return {"normalized": default_dict[lowered], "language": "hi",
                    "structured": {}, "needs_clarification": False, "clarification_question": None}
        return {
            "normalized": "", "language": None, "structured": {},
            "needs_clarification": True,
            "clarification_question": {
                "en": "Could you give me that as a number from 1 to 10?",
                "hi": "क्या आप इसे 1 से 10 तक की संख्या में बता सकते हैं?",
            },
        }

    option_map = {str(o).strip().lower(): str(o) for o in (options or [])}
    if answer_type in ("multiple_choice", "multiple_select") and option_map:
        best = option_map.get(answer_text.strip().lower())
        if best:
            normalized = best if answer_type == "multiple_choice" else [best]
            return {"normalized": normalized, "language": "hi" if DEVANAGARI_RE.search(answer_text) else "en",
                    "structured": {}, "needs_clarification": False, "clarification_question": None}

    language_hint = "hi" if DEVANAGARI_RE.search(answer_text) else None

    provider = get_provider()
    user_message = (
        f"Question: {question_text}\n"
        f"Answer type: {answer_type}\n"
        f"Options (if any): {', '.join(str(o) for o in options) or 'none'}\n"
        f"Patient's raw answer:\n{answer_text}"
    )
    if language_hint:
        user_message += f"\n\n(Note: answer appears to contain Devanagari text.)"

    try:
        raw = provider.chat(
            messages=[
                {"role": "system", "content": UNDERSTAND_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            temperature=0.0,
            max_tokens=400,
        )
    except Exception:  # pragma: no cover - provider/network errors
        return {
            "normalized": answer_text, "language": language_hint or "en",
            "structured": {"summary": answer_text},
            "needs_clarification": False, "clarification_question": None,
        }

    try:
        cleaned = (raw or "").strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
    except Exception:
        parsed = {}

    normalized = str(parsed.get("normalized") or answer_text or "").strip()
    language = str(parsed.get("language") or language_hint or "en").strip()
    structured = _merge_structured(parsed.get("structured"), answer_text)
    needs = bool(parsed.get("needs_clarification"))
    clar = parsed.get("clarification_question")
    if not isinstance(clar, dict):
        clar = None

    return {
        "normalized": normalized,
        "language": language,
        "structured": structured,
        "needs_clarification": needs,
        "clarification_question": clar,
    }


@router.post("/screening/phrase-question")
async def phrase_question(
    body: dict,
    _req=Depends(verify_ai_key),
):
    question_text = str(body.get("question_text") or "").strip()
    question_text_hi = str(body.get("question_text_hi") or "").strip()
    options = body.get("options") or []
    previous_answer = body.get("previous_answer")
    visit_context = str(body.get("visit_context") or "first_visit").strip()

    if not question_text:
        return {"en": "", "hi": ""}

    provider = get_provider()
    user_message = (
        f"Visit context: {visit_context}\n"
        f"Question (en): {question_text}\n"
        f"Question (hi, may be empty): {question_text_hi or 'not provided'}\n"
        f"Options: {', '.join(str(o) for o in options) or 'none'}\n"
        f"Previous answer (may be empty): {str(previous_answer) if previous_answer else 'none'}"
    )

    try:
        raw = provider.chat(
            messages=[
                {"role": "system", "content": PHRASE_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            temperature=0.4,
            max_tokens=300,
        )
    except Exception:  # pragma: no cover - provider/network errors
        en = question_text
        hi = question_text_hi or question_text
        return {"en": en, "hi": hi}

    cleaned = (raw or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
        en = str(parsed.get("en") or "").strip() or question_text
        hi = str(parsed.get("hi") or "").strip()
        if not hi and question_text_hi:
            hi = question_text_hi
        return {"en": en, "hi": hi or question_text}
    except Exception:
        return {"en": question_text, "hi": question_text_hi or question_text}


@router.post("/screening/comprehensive-summary")
async def comprehensive_summary(
    body: dict,
    _req=Depends(verify_ai_key),
):
    answers = body.get("answers")
    previous_summary = body.get("previous_summary")
    department = str(body.get("department") or "").strip()
    patient_name = str(body.get("patient_name") or "").strip()
    visit_number = int(body.get("visit_number") or 1)

    if not isinstance(answers, list) or not answers:
        return {"summary": None, "error": "no answers to summarize"}

    rendered = []
    original_quotes = []
    for item in answers:
        question = str(item.get("question") or "").strip()
        value = item.get("answer")
        if value is None:
            continue
        val = ", ".join(str(x) for x in value) if isinstance(value, list) else str(value)
        if question and val.strip():
            rendered.append(f"- {question}: {val.strip()}")
        orig = item.get("value_original")
        orig_s = str(orig).strip() if orig is not None else ""
        if orig_s and orig_s != val.strip():
            original_quotes.append(f"{orig_s}" + (f" ({val.strip()})" if val.strip() else ""))

    if not rendered:
        return {"summary": None, "error": "no answerable content"}

    user_message = (
        f"Patient: {patient_name or 'Patient'}\n"
        f"Department: {department or 'General consultation'}\n"
        f"Visit number: {visit_number}\n\n"
        "Patient's answers this visit:\n" + "\n".join(rendered)
    )
    if previous_summary:
        user_message += (
            "\n\nPrevious visit summary (for comparison):\n"
            f"{str(previous_summary)}"
        )
    else:
        user_message += "\n\nNo previous visit summary exists."

    provider = get_provider()
    try:
        raw = provider.chat(
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            temperature=0.1,
            max_tokens=1100,
        )
    except Exception:  # pragma: no cover - provider/network errors
        return {"summary": None, "error": "summary generation failed"}

    cleaned = (raw or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        sections = json.loads(cleaned)
    except Exception:
        return {"summary": None, "error": "summary parse failed"}

    if not isinstance(sections, dict):
        return {"summary": None, "error": "summary parse failed"}

    def _stringify(value) -> str:
        if isinstance(value, list):
            parts = []
            for item in value:
                if isinstance(item, dict):
                    text = str(item.get("text") or item.get("quote") or "").strip()
                    gloss = str(item.get("english_gloss") or item.get("gloss") or "").strip()
                    parts.append(f"{text}" + (f" ({gloss})" if gloss else ""))
                else:
                    parts.append(str(item))
            return ". ".join(p for p in parts if p).strip()
        return str(value or "").strip()

    sections = {key: _stringify(value) for key, value in sections.items()}
    if original_quotes:
        sections["patients_own_words"] = " ".join(original_quotes)

    section_titles = {
        "chief_complaint": "Chief complaint",
        "onset_and_duration": "Onset and duration",
        "symptoms": "Symptoms",
        "severity": "Severity",
        "current_treatment_and_self_care": "Medications, home remedies or self care",
        "additional_context": "Additional context",
        "previous_visit_review": "Previous visit review",
        "new_since_last_visit": "New since last visit",
        "patients_own_words": "Patient's own words",
        "important_for_doctor": "Important for the doctor",
        "clinical_snapshot": "Clinical snapshot",
        "disclaimer": "Disclaimer",
    }

    narrative_lines = []
    for key, title in section_titles.items():
        content = str(sections.get(key) or "").strip()
        if not content:
            continue
        narrative_lines.append(f"{title}\n{content}")
    narrative = "\n\n".join(narrative_lines)

    return {"summary": {"narrative": narrative, "sections": sections}, "source": "comprehensive"}