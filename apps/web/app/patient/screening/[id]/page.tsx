"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Check, LoaderCircle, Send } from "lucide-react";
import {
  api,
  type BilingualText,
  type PhrasedScreeningQuestion,
  type ScreeningConversationSummary,
} from "../../../../lib/api";
import ScreeningVoiceInput from "../ScreeningVoiceInput";

type ChatMessage = {
  id: string;
  role: "ai" | "patient";
  en?: string;
  hi?: string;
  text?: string;
  question_id?: string;
  kind: "greeting" | "question" | "clarification" | "completion" | "answer";
};

const SUMMARY_TITLES: Record<string, string> = {
  chief_complaint: "Chief complaint",
  onset_and_duration: "Onset and duration",
  symptoms: "Symptoms",
  severity: "Severity",
  current_treatment_and_self_care: "Medications, home remedies or self care",
  additional_context: "Additional context",
  previous_visit_review: "Previous visit review",
  new_since_last_visit: "New since last visit",
  patients_own_words: "Patient's own words",
  important_for_doctor: "Important for the doctor",
  clinical_snapshot: "Clinical snapshot",
  disclaimer: "Disclaimer",
};

function localize(b: { en?: string; hi?: string } | undefined | null, language: "en" | "hi") {
  if (!b) return "";
  return language === "hi" && b.hi && b.hi.trim() ? b.hi : b.en || "";
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `m${idCounter}`;
}

export default function Page() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const appointmentId = params.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">(() =>
    typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("hi") ? "hi" : "en"
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<PhrasedScreeningQuestion | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [draft, setDraft] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState(() =>
    typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("hi") ? "hi-IN" : "en-IN"
  );
  const [visitInfo, setVisitInfo] = useState<{ first_visit: boolean; number: number } | null>(null);
  const [previousVisit, setPreviousVisit] = useState<{ number: number; completed_at: string | null; summary: string | null } | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number }>({ answered: 0, total: 0 });
  const [summary, setSummary] = useState<ScreeningConversationSummary | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const pushMessages = (items: ChatMessage[]) => {
    setMessages((current) => [...current, ...items]);
  };

  const pushQuestion = (q: PhrasedScreeningQuestion | null, kind: "question" | "clarification" = "question") => {
    if (!q) return;
    const en = q.phrased?.en || q.text;
    const hi = q.phrased?.hi || q.text_hi || q.text;
    pushMessages([{ id: nextId(), role: "ai", kind, en, hi, question_id: q.id }]);
    setCurrentQuestion(kind === "clarification" ? currentQuestion : q);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, waiting]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.startScreeningConversation(appointmentId);
        if (!mounted) return;
        const session = res.session;
        setVisitInfo({ first_visit: session.visit.first_visit, number: session.visit.number });
        setPreviousVisit(session.previous_visit);
        setProgress({ answered: session.answered_count, total: session.total_questions });
        setSummary(session.summary);
        setFinished(session.status === "completed");

        const initial: ChatMessage[] = [{ id: nextId(), role: "ai", kind: "greeting", en: session.greeting.en, hi: session.greeting.hi }];
        if (session.next_question) {
          const q = session.next_question;
          initial.push({ id: nextId(), role: "ai", kind: "question", en: q.phrased?.en || q.text, hi: q.phrased?.hi || q.text_hi || q.text, question_id: q.id });
          setCurrentQuestion(q);
        } else {
          setCurrentQuestion(null);
        }
        pushMessages(initial);
      } catch (err: unknown) {
        if (mounted) setLoadError(err instanceof Error ? err.message : "Could not load your screening.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [appointmentId]);

  const currentPhrase = useMemo<BilingualText | null>(() => {
    if (!currentQuestion) return null;
    const q = currentQuestion;
    return { en: q.phrased?.en || q.text, hi: q.phrased?.hi || q.text_hi || q.text };
  }, [currentQuestion]);

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
    if (!text || waiting || !currentQuestion) return;
    setDraft("");
    setWaiting(true);
    setError("");
    pushMessages([{ id: nextId(), role: "patient", kind: "answer", text }]);
    try {
      const res = await api.sendScreeningMessage(appointmentId, { question_id: currentQuestion.id, answer: text });
      const turn = res.turn;
      setProgress({ answered: turn.answered_count ?? progress.answered, total: turn.total_questions ?? progress.total });
      if (turn.safety?.message) {
        pushMessages([{ id: nextId(), role: "ai", kind: "clarification", en: turn.safety.message.en, hi: turn.safety.message.hi }]);
      }
      if (turn.clarification) {
        pushMessages([{ id: nextId(), role: "ai", kind: "clarification", en: turn.clarification.en, hi: turn.clarification.hi, question_id: currentQuestion.id }]);
        return;
      }
      if (turn.next_question) {
        pushQuestion(turn.next_question, "question");
        return;
      }
      setCurrentQuestion(null);
      setFinished(true);
      if (turn.completion) {
        pushMessages([{ id: nextId(), role: "ai", kind: "completion", en: turn.completion.en, hi: turn.completion.hi }]);
      }
      if (res.summary) setSummary(res.summary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong sending your answer.");
    } finally {
      setWaiting(false);
    }
  };

  const sendChip = (value: string) => {
    if (!currentQuestion) return;
    void handleSend(value);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f5] px-6">
        <LoaderCircle size={22} className="animate-spin text-[#63857b]" />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f5] px-6 text-[#17221f]">
        <div className="max-w-md text-center">
          <p className="text-sm text-[#7b8581]">{loadError}</p>
          <button
            onClick={() => router.push("/patient/dashboard")}
            className="mt-4 text-xs font-medium text-[#17221f] underline decoration-[#c5ceca] underline-offset-4"
          >
            Back to dashboard
          </button>
        </div>
      </main>
    );
  }

  const pct = progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;
  const sections = summary?.sections
    ? Object.entries(summary.sections).filter(([, value]) => value && String(value).trim() && String(value).trim() !== "Not reported")
    : [];

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-[#17221f]">
      <div className="mx-auto max-w-[760px] px-5 py-6 sm:px-8">
        <button
          onClick={() => router.push("/patient/dashboard")}
          className="mb-5 flex items-center gap-2 text-[11px] text-[#7b8581] transition hover:text-[#17221f]"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </button>

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#9ca7a3]">Pre-consultation conversation</p>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.045em]">Talk to your screening assistant</h1>
            <p className="mt-2 text-sm text-[#7b8581]">
              {visitInfo && (
                <>
                  Visit {visitInfo.number}
                  {visitInfo.first_visit ? " · first visit" : " · follow-up"}
                  <span className="mx-2 text-[#d3dad7]">•</span>
                </>
              )}
              Answer by typing or speaking — Hindi or English, either is fine.
            </p>
          </div>
          <div className="flex h-11 items-center gap-1 rounded-2xl border border-[#e0e7e3] bg-white p-1 shadow-[0_8px_30px_rgba(20,30,25,0.04)]">
            {(["en", "hi"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang);
                  setVoiceLanguage(lang === "hi" ? "hi-IN" : "en-IN");
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${language === lang ? "bg-[#17221f] text-white" : "text-[#596862] hover:text-[#17221f]"}`}
              >
                {lang === "en" ? "English" : "हिन्दी"}
              </button>
            ))}
          </div>
        </div>

        {/* Progress */}
        {progress.total > 0 && !finished && (
          <div className="mt-5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e2e8e5]">
              <div
                className="h-full rounded-full bg-[#52786d] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9ca7a3]">
              {progress.answered}/{progress.total}
            </span>
          </div>
        )}

        {/* Previous visit context */}
        {previousVisit && !finished && (
          <div className="mt-5 rounded-2xl border border-[#e3e9e6] bg-[#fbfcfb] px-5 py-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9ca7a3]">From your last visit · v{previousVisit.number}</p>
            {previousVisit.summary && <p className="mt-2 text-xs leading-5 text-[#596862]">{previousVisit.summary.slice(0, 220)}{previousVisit.summary.length > 220 ? "…" : ""}</p>}
            <p className="mt-2 text-[10px] text-[#a4aca8]">Your assistant remembers this and will only ask what&apos;s new.</p>
          </div>
        )}

        {/* Chat */}
        <div className="mt-6 flex flex-col gap-4">
          {messages.map((message) => {
            const content = message.role === "patient" ? message.text : localize(message, language);
            const isAI = message.role === "ai";
            return (
              <div key={message.id} className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-[20px] px-5 py-3.5 text-sm leading-6 ${
                    isAI
                      ? "rounded-tl-lg border border-[#e0e7e3] bg-white text-[#2b3632] shadow-[0_8px_30px_rgba(20,30,25,0.04)]"
                      : "rounded-tr-lg bg-[#17221f] text-[#f4f7f6]"
                  }`}
                >
                  {content}
                  {message.kind === "question" && message.question_id && (
                    <span className="ms-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[#a4aca8]">{message.question_id.slice(-4)}</span>
                  )}
                </div>
              </div>
            );
          })}

          {waiting && (
            <div className="flex items-center gap-3 rounded-[20px] rounded-tl-lg border border-[#e0e7e3] bg-white px-5 py-3.5 shadow-[0_8px_30px_rgba(20,30,25,0.04)]">
              <LoaderCircle size={14} className="animate-spin text-[#7b8581]" />
              <span className="text-xs text-[#7b8581]">Thinking…</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Completed summary */}
        {finished && (
          <div className="mt-8 rounded-[22px] border border-[#e0e7e3] bg-white p-6 shadow-[0_18px_50px_rgba(20,30,25,0.06)]">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#edf5f2]">
                <Check size={18} className="text-[#52786d]" />
              </div>
              <div>
                <h2 className="text-lg font-medium tracking-[-0.03em]">You&apos;re all set</h2>
                <p className="text-xs text-[#71807a]">Your answers have been shared with the doctor.</p>
              </div>
            </div>

            {summary && (
              <div className="mt-6">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9ca7a3]">Conversation summary</p>
                <div className="mt-3 space-y-4">
                  {sections.length > 0 ? (
                    sections.map(([key, value]) => (
                      <div key={key}>
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7b8581]">{SUMMARY_TITLES[key] || key.replace(/_/g, " ")}</p>
                        <p className="mt-1 text-sm leading-6 text-[#2b3632]">{value}</p>
                      </div>
                    ))
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[#2b3632]">{summary.narrative}</p>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => router.push("/patient/dashboard")}
              className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#17221f] text-sm font-medium text-white"
            >
              Back to dashboard
            </button>
          </div>
        )}

        {/* Input */}
        {!finished && (
          <div className="mt-6">
            {error && <div className="mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-3 text-xs text-rose-600">{error}</div>}

            {currentQuestion && (currentQuestion.answer_type === "yes_no" || currentQuestion.answer_type === "multiple_choice") && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {currentQuestion.options.length
                  ? currentQuestion.options.map((option) => (
                      <button
                        key={option}
                        onClick={() => sendChip(option)}
                        disabled={waiting}
                        className="h-10 rounded-xl border border-[#dfe5e2] bg-white px-4 text-xs font-medium text-[#35403c] transition hover:border-[#8aaba0] disabled:opacity-50"
                      >
                        {option}
                      </button>
                    ))
                  : (["Yes", "No"] as const).map((option) => (
                      <button
                        key={option}
                        onClick={() => sendChip(option)}
                        disabled={waiting}
                        className="h-10 rounded-xl border border-[#dfe5e2] bg-white px-6 text-xs font-medium text-[#35403c] transition hover:border-[#8aaba0] disabled:opacity-50"
                      >
                        {language === "hi" ? (option === "Yes" ? "हाँ" : "नहीं") : option}
                      </button>
                    ))}
              </div>
            )}

            {currentQuestion && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => sendChip("I don't know")}
                  disabled={waiting}
                  className="rounded-xl border border-dashed border-[#cbd4d0] bg-white px-3 py-1.5 text-[11px] text-[#7b8581] transition hover:border-[#8aaba0] hover:text-[#35403c] disabled:opacity-50"
                >
                  {language === "hi" ? "पता नहीं" : "I don't know"} ·
                </button>
                <button
                  onClick={() => sendChip("Skip")}
                  disabled={waiting}
                  className="rounded-xl border border-dashed border-[#cbd4d0] bg-white px-3 py-1.5 text-[11px] text-[#7b8581] transition hover:border-[#8aaba0] hover:text-[#35403c] disabled:opacity-50"
                >
                  {language === "hi" ? "छोड़ें" : "Skip this"} ·
                </button>
                {currentQuestion.rule && (
                  <span className="rounded-full bg-[#edf5f2] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#648678]">
                    Deep flow · {currentQuestion.rule.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            )}

            {currentQuestion && currentQuestion.answer_type === "multiple_select" && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {currentQuestion.options.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      const parts = draft ? draft.split(", ").filter(Boolean) : [];
                      const next = parts.includes(option) ? parts.filter((o) => o !== option) : [...parts, option];
                      setDraft(next.join(", "));
                    }}
                    className={`h-10 rounded-xl border px-4 text-xs font-medium transition ${
                      draft.split(", ").includes(option)
                        ? "border-[#17221f] bg-[#17221f] text-white"
                        : "border-[#dfe5e2] bg-white text-[#35403c] hover:border-[#8aaba0]"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-[22px] border border-[#e0e7e3] bg-white p-3 shadow-[0_18px_50px_rgba(20,30,25,0.07)]">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                placeholder={
                  currentQuestion
                    ? `Answer for: ${localize(currentPhrase, language)} — type in Hindi or English`
                    : "Please wait…"
                }
                className="w-full resize-none rounded-2xl bg-[#f9faf9] p-3 text-sm outline-none transition placeholder:text-[#a4aca8] focus:bg-white"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <ScreeningVoiceInput
                  appointmentId={appointmentId}
                  language={voiceLanguage}
                  onTranscript={(text) => setDraft((current) => (current ? `${current} ${text}`.trim() : text))}
                />
                <div className="flex items-center gap-2">
                  <select
                    value={voiceLanguage}
                    onChange={(e) => setVoiceLanguage(e.target.value)}
                    className="h-9 rounded-lg border border-[#dfe5e2] bg-white px-2 text-[10px] text-[#35403c] outline-none"
                    title="Answer language"
                  >
                    <option value="hi-IN">हिन्दी (Hindi)</option>
                    <option value="en-IN">English</option>
                    <option value="ta-IN">தமிழ் (Tamil)</option>
                    <option value="te-IN">తెలుగు (Telugu)</option>
                    <option value="mr-IN">मराठी (Marathi)</option>
                    <option value="bn-IN">বাংলা (Bengali)</option>
                  </select>
                  <button
                    onClick={() => handleSend()}
                    disabled={waiting || !draft.trim() || !currentQuestion}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#17221f] text-white transition disabled:opacity-40"
                    aria-label="Send answer"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-[#a4aca8]">
              Tip: type or speak in Hindi (or any language). Your doctor will only see the English translation.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
