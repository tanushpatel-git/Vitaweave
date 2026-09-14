"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronRight,
  ClipboardList,
  History,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import { api, type PreConsultationDetail, type ScreeningAnswer, type ScreeningConversationEntry, type ScreeningFact } from "../../../../lib/api";

type Tab = "summary" | "details" | "conversation" | "history";

const SECTION_STYLES: Record<string, string> = {
  "New since last visit": "border-[#d9e6d1] bg-[#f3f8f0]",
  "Patient's own words": "border-[#e4dccb] bg-[#faf6ef]",
  "Important for the doctor": "border-[#e8e0f5] bg-[#f7f3fc]",
  "Previous visit review": "border-[#e6edf4] bg-[#f3f7fb]",
};

const SUMMARY_HEADINGS = [
  "Chief complaint",
  "Onset and duration",
  "Symptoms",
  "Severity",
  "Medications, home remedies or self care",
  "Additional context",
  "Previous visit review",
  "New since last visit",
  "Patient's own words",
  "Important for the doctor",
  "Clinical snapshot",
  "Disclaimer",
];

function parseSummary(narrative: string) {
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const rawLine of narrative.split("\n")) {
    const line = rawLine.trim();
    const match = SUMMARY_HEADINGS.find((h) => h.toLowerCase() === line.toLowerCase());
    if (match) {
      current = { heading: match, body: [] };
      sections.push(current);
      continue;
    }
    if (!line) continue;
    if (!current) {
      current = { heading: "", body: [] };
      sections.push(current);
    }
    current.body.push(line);
  }
  return sections.map((s) => ({ heading: s.heading, body: s.body.join(" ") }));
}

function answerText(value: ScreeningAnswer["value"]) {
  if (value === null || value === undefined || value === "") return "No response";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "No response";
  return String(value);
}

function formatTs(ts?: string | null) {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function CategoryPill({ category }: { category?: string }) {
  if (!category || category === "doctor") return null;
  const map: Record<string, string> = {
    department: "bg-sky-50 text-sky-700",
    general: "bg-slate-100 text-slate-600",
    ai_follow_up: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`rounded-full px-1.5 py-px font-mono text-[8px] font-semibold uppercase tracking-wide ${map[category] || "bg-[#f0f2f1] text-[#69736f]"}`}>
      {category.replace(/_/g, " ")}
    </span>
  );
}

function FactBadge({ fact }: { fact: ScreeningFact }) {
  const tone =
    fact.source === "doctor"
      ? "bg-[#eef2ff] text-indigo-700"
      : fact.status === "superseded"
        ? "bg-[#f1f2f1] text-[#a0a8a4]"
        : "bg-[#eef7f3] text-[#4c756c]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] ${tone}`}>
      {fact.source === "doctor" ? <Check size={9} /> : <Brain size={9} />}
      {fact.fact}: {String(fact.value)}
      <span className="opacity-70">· {fact.visit_id}</span>
      {fact.status === "superseded" && <span className="opacity-60">· superseded</span>}
    </span>
  );
}

function DeepScreeningView({ screening, appointmentId, patientName }: { screening: PreConsultationDetail; appointmentId: string; patientName: string }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [answers, setAnswers] = useState<ScreeningAnswer[]>(screening.answers || []);
  const [facts, setFacts] = useState<ScreeningFact[]>(screening.facts || []);

  const sections = screening.summary?.sections
    ? Object.entries(screening.summary.sections).filter(([, value]) => value && String(value).trim() && String(value).trim() !== "Not reported")
    : [];
  const conversation = (screening.conversation || []) as ScreeningConversationEntry[];
  const followUps = screening.follow_ups || [];
  const corrections = screening.corrections || [];

  const startEdit = (answer: ScreeningAnswer) => {
    setEditing(answer.question_id);
    setEditValue(answerText(answer.correction?.value ?? answer.value));
    setEditReason(answer.correction?.reason || "");
    setSaved("");
  };

  const saveCorrection = async (answer: ScreeningAnswer) => {
    if (!answerText) return;
    setSaving(true);
    setSaved("");
    try {
      let value: string | number | string[] = editValue.trim();
      if (answer.answer_type === "number" && value !== "") {
        const num = Number(value);
        if (!Number.isNaN(num)) value = num;
      }
      if (answer.answer_type === "multiple_select") {
        value = String(value).split(",").map((v) => v.trim()).filter(Boolean);
      }
      const res = await api.correctScreeningAnswer(appointmentId, {
        question_id: answer.question_id,
        new_value: value,
        reason: editReason.trim() || undefined,
      });
      const correctedAnswer = res.corrected;
      setAnswers((current) => current.map((a) => (a.question_id === correctedAnswer.question_id ? { ...a, ...correctedAnswer } : a)));
      setFacts((current) => [...current, {
        key: `symptom.${correctedAnswer.question_id}`,
        fact: answer.question_text,
        value: Array.isArray(value) ? value.join(", ") : String(value),
        question_id: correctedAnswer.question_id,
        source: "doctor",
        visit_id: screening.visit_number ? `V${String(screening.visit_number).padStart(3, "0")}` : "V---",
        recorded_at: new Date().toISOString(),
        status: "current",
        confidence: "high",
      }]);
      setSaved(answer.question_id);
      setEditing(null);
    } catch (err) {
      setSaved(`error:${err instanceof Error ? err.message : "Could not save"}`);
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "summary", label: "Summary", icon: <ClipboardList size={12} /> },
    { id: "details", label: "Details", icon: <Sparkles size={12} /> },
    { id: "conversation", label: "Conversation", icon: <MessageSquareText size={12} /> },
    { id: "history", label: "History", icon: <History size={12} /> },
  ];

  return (
    <div className="mt-2">
      {/* Deep flow tab bar */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#e4eae7] bg-[#fafbfa] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${tab === t.id ? "bg-[#17221f] text-white" : "text-[#71807a] hover:text-[#17221f]"}`}
          >
            {t.icon}
            {t.label}
            {t.id === "details" && answers.filter((a) => a.corrected).length > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 font-mono text-[8px] text-[#17221f]">{answers.filter((a) => a.corrected).length}</span>
            )}
          </button>
        ))}
        {screening.visit_number && (
          <span className="ml-auto rounded-full bg-[#f3f5f4] px-2 py-1 font-mono text-[9px] text-[#7b8581]">Visit {screening.visit_number}</span>
        )}
      </div>

      {tab === "summary" && (
        <div className="mt-2 rounded-xl border border-[#e8edeb] bg-white p-3">
          <SummaryView sections={sections} narrative={screening.summary?.narrative} />
        </div>
      )}

      {tab === "details" && (
        <div className="mt-2 space-y-2">
          {saved.startsWith("error:") && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] text-rose-700">{saved.slice(6)}</p>
          )}
          {answers.length === 0 && <p className="rounded-xl bg-[#f4f8f6] px-3 py-2 text-[10px] text-[#89958f]">No structured answers yet — the patient has not started the conversation.</p>}
          {answers.map((answer) => {
            const isEditing = editing === answer.question_id;
            const showValue = answer.correction?.value != null ? answer.correction.value : answer.value;
            return (
              <div key={answer.question_id} className="rounded-xl border border-[#e8edeb] bg-white p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold leading-4 text-[#35403c]">
                      {answer.question_text}
                      <span className="ms-1.5"><CategoryPill category={answer.category} /></span>
                      {answer.skipped && <span className="ms-1.5 rounded-full bg-[#f0f2f1] px-1.5 py-px font-mono text-[8px] text-[#89958f]">Skipped</span>}
                      {answer.not_known && <span className="ms-1.5 rounded-full bg-[#f0f2f1] px-1.5 py-px font-mono text-[8px] text-[#89958f]">Don&apos;t know</span>}
                    </p>
                    {!isEditing ? (
                      <div className="mt-1">
                        <p className="text-[11px] font-medium leading-4 text-[#17221f]">{answerText(showValue)}</p>
                        {answer.corrected && answer.correction && (
                          <div className="mt-1 rounded-md bg-indigo-50/60 px-2 py-1 text-[9px] leading-4 text-[#4f5bc4]">
                            <p className="flex items-center gap-1 font-semibold">
                              <Check size={9} /> Doctor corrected
                              <span className="text-indigo-400">AI: {answerText(answer.correction.original_value ?? answer.value_original ?? answer.value)}</span>
                            </p>
                            {answer.correction.by_name && <p>by {answer.correction.by_name} · {formatTs(answer.correction.at)}</p>}
                            {answer.correction.reason && <p>Reason: {answer.correction.reason}</p>}
                          </div>
                        )}
                        {!answer.corrected && answer.translated && answer.value_original != null && String(answer.value_original).trim() !== "" && (
                          <p className="mt-0.5 text-[9px] italic leading-3 text-[#a49a86]">&ldquo;{String(answer.value_original).slice(0, 140)}&rdquo;</p>
                        )}
                        {answer.detected && Object.keys(answer.detected).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Object.entries(answer.detected).map(([key, value]) => (
                              <span key={key} className="rounded-full bg-[#f3f7fb] px-1.5 py-px font-mono text-[8px] text-[#5b7794]">
                                {key.replace(/_/g, " ")}: {String(value)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1 space-y-1.5">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder="Corrected value"
                          className="h-8 w-full rounded-lg border border-[#dfe5e2] bg-white px-2 text-[11px] outline-none focus:border-[#8aaba0]"
                        />
                        <input
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className="h-8 w-full rounded-lg border border-[#dfe5e2] bg-white px-2 text-[11px] outline-none focus:border-[#8aaba0]"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => saveCorrection(answer)}
                            disabled={saving || !editValue.trim()}
                            className="flex h-7 items-center gap-1 rounded-lg bg-[#17221f] px-2.5 text-[10px] font-semibold text-white disabled:opacity-40"
                          >
                            {saving ? <LoaderCircle size={10} className="animate-spin" /> : <Check size={10} />} Save correction
                          </button>
                          <button onClick={() => setEditing(null)} className="flex h-7 items-center gap-1 rounded-lg border border-[#dfe5e2] px-2.5 text-[10px] text-[#7b8581]">
                            <X size={10} /> Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {!isEditing && !answer.skipped && !answer.not_known && (
                    <button
                      onClick={() => startEdit(answer)}
                      title="Correct this value (authoritative for the clinical record)"
                      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#dfe5e2] text-[#7b8581] transition hover:border-[#8aaba0] hover:text-[#35403c]"
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "conversation" && (
        <div className="mt-2">
          {conversation.length === 0 ? (
            <p className="rounded-xl bg-[#f4f8f6] px-3 py-2 text-[10px] text-[#89958f]">No conversation yet.</p>
          ) : (
            <div className="space-y-1.5">
              {conversation.map((entry, index) => {
                const isAI = entry.role === "ai";
                return (
                  <div key={index} className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[88%] rounded-xl px-3 py-2 text-[10px] leading-4 ${
                        isAI ? "rounded-tl-sm border border-[#e6ece9] bg-white text-[#35403c]" : "rounded-tr-sm bg-[#17221f] text-[#f4f7f6]"
                      }`}
                    >
                      <p>{entry.text || (isAI && entry.hi ? entry.hi : "")}</p>
                      {(entry.follow_up || entry.clarification || entry.correction) && (
                        <p className="mt-1 flex flex-wrap items-center gap-1">
                          {entry.follow_up && (
                            <span className="rounded-full bg-[#edf5f2] px-1.5 py-px font-mono text-[7px] uppercase tracking-wide text-[#648678]">
                              {entry.rule ? `Deep flow · ${String(entry.rule).replace(/_/g, " ")}` : "Follow-up"}
                            </span>
                          )}
                          {entry.clarification && <span className="rounded-full bg-amber-50 px-1.5 py-px font-mono text-[7px] uppercase tracking-wide text-amber-700">Clarification</span>}
                          {entry.correction && <span className="rounded-full bg-indigo-50 px-1.5 py-px font-mono text-[7px] uppercase tracking-wide text-indigo-600">Patient corrected</span>}
                          {entry.language && entry.language !== "en" && <span className="rounded-full bg-[#f0f2f1] px-1.5 py-px font-mono text-[7px] text-[#89958f]">{entry.language}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(followUps.length > 0 || (screening.plan || []).length > 0) && (
            <div className="mt-2 rounded-xl border border-[#e4eae7] bg-[#fafbfa] p-2.5">
              <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#71807a]"><Brain size={10} /> Conversation plan</p>
              <div className="mt-1.5 flex flex-col gap-1">
                {followUps.map((fu) => (
                  <div key={fu._id} className="flex items-start gap-1.5 text-[9px] text-[#55635d]">
                    <ChevronRight size={10} className="mt-0.5 shrink-0 text-[#9ca7a3]" />
                    <span>
                      <span className="me-1 rounded-full bg-emerald-50 px-1.5 py-px font-mono text-[7px] text-emerald-600">{fu._meta?.rule || "ai_follow_up"}</span>
                      {fu.text}
                    </span>
                  </div>
                ))}
                {(screening.plan || []).map((step, index) => (
                  <div key={`${step.question_id}-${index}`} className="flex items-start gap-1.5 text-[9px] text-[#a4aca8]">
                    <ChevronRight size={10} className="mt-0.5 shrink-0 text-[#cdd4d1]" />
                    <span>{step.question_text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="mt-2 space-y-2">
          {facts.length === 0 && corrections.length === 0 && (
            <p className="rounded-xl bg-[#f4f8f6] px-3 py-2 text-[10px] text-[#89958f]">No longitudinal facts recorded yet.</p>
          )}
          <div className="rounded-xl border border-[#e8edeb] bg-white p-2.5">
            <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#71807a]"><Brain size={10} /> Facts with provenance</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {facts.map((fact, index) => (
                <FactBadge key={`${fact.key}-${index}`} fact={fact} />
              ))}
              {facts.length === 0 && <span className="text-[9px] text-[#a4aca8]">No facts yet.</span>}
            </div>
          </div>
          {corrections.length > 0 && (
            <div className="rounded-xl border border-[#eef0ff] bg-[#fbfbff] p-2.5">
              <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#7c82d6]"><Check size={10} /> Doctor correction audit trail</p>
              <div className="mt-1.5 space-y-1">
                {corrections.map((correction, index) => (
                  <div key={index} className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] leading-4 text-[#35403c]">
                    <p className="font-semibold">{correction.question_text}</p>
                    <p className="text-[#89958f]">
                      AI: <span className="text-rose-500 line-through">{String(correction.ai_value)}</span>{" "}
                      → Doctor: <span className="font-semibold text-indigo-600">{String(correction.doctor_value)}</span>
                      {correction.reason && <span> · {correction.reason}</span>}
                    </p>
                    <p className="text-[9px] text-[#a4aca8]">{correction.by_name || "Doctor"} · {formatTs(correction.at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="flex items-center gap-1.5 text-[9px] leading-4 text-[#89958f]">
            <AlertTriangle size={10} className="text-amber-500" />
            Previous-visit information is historical, not current truth. Doctor corrections become the authoritative clinical record with the audit trail above.
          </p>
          <p className="text-[9px] leading-4 text-[#89958f]">Patient: {patientName}</p>
        </div>
      )}
    </div>
  );
}

function SummaryView({ sections, narrative }: { sections: Array<[string, string]>; narrative?: string | null }) {
  if (sections.length > 0) {
    const snapshotKey = sections.find(([key]) => key === "clinical_snapshot");
    const rest = sections.filter(([key]) => key !== "clinical_snapshot");
    return (
      <div>
        {snapshotKey && (
          <div className="rounded-lg bg-[#eaf6f0] px-3 py-2 text-[11px] leading-4 text-[#2f5246]">{snapshotKey[1]}</div>
        )}
        {rest.length > 0 && (
          <div className="mt-2 grid gap-1.5">
            {rest.map(([key, value]) => (
              <div key={key} className={`rounded-lg border px-2.5 py-1.5 ${SECTION_STYLES[SUMMARY_HEADINGS.find((h) => h.toLowerCase() === key.replace(/_/g, " ").toLowerCase()) as string] || "bg-[#f4f8f6]"}`}>
                <p className="text-[9px] font-bold uppercase tracking-[.08em] text-[#648678]">{key.replace(/_/g, " ")}</p>
                <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#35403c]">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (!narrative) return <p className="text-[10px] text-[#89958f]">Pre-consultation not completed yet.</p>;
  const parsed = parseSummary(narrative);
  return (
    <div className="mt-0.5 grid gap-1.5">
      {parsed.filter((s) => s.body.trim() !== "").map((section, index) => (
        <div key={index} className={`rounded-lg border px-2.5 py-1.5 ${SECTION_STYLES[section.heading] || "bg-[#f4f8f6]"}`}>
          {section.heading && <p className="text-[9px] font-bold uppercase tracking-[.08em] text-[#648678]">{section.heading}</p>}
          <p className={`mt-0.5 text-[11px] font-medium leading-4 ${section.heading === "Disclaimer" ? "text-[#a49a86]" : "text-[#35403c]"}`}>{section.body}</p>
        </div>
      ))}
    </div>
  );
}

export default function DeepScreeningSection({ screening, appointmentId, patientName }: { screening: PreConsultationDetail; appointmentId: string; patientName: string }) {
  if (!screening) return null;
  return <DeepScreeningView screening={screening} appointmentId={appointmentId} patientName={patientName} />;
}