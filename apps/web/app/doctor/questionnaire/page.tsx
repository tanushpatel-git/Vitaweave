"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  GripVertical,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../../lib/auth";
import { api, type QuestionnaireQuestion, type SaveQuestionnairePayload, type AnswerType } from "../../../lib/api";

const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  text: "Short text",
  number: "Number",
  date: "Date",
  yes_no: "Yes / No",
  multiple_choice: "Single choice",
  multiple_select: "Multiple select",
  voice: "Voice note",
  text_voice: "Text + voice",
};

function localId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function blankQuestion(): QuestionnaireQuestion {
  return {
    id: localId(),
    text: "",
    text_hi: "",
    answer_type: "text",
    required: false,
    options: [],
    show_if_question: null,
    show_if_value: null,
    visit_type: "all",
    order: 0,
  };
}

export default function Page() {
  const router = useRouter();
  const { user } = useAuth();
  const departmentId = user?.department_id;
  const canEdit = user?.role === "HOD";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [departmentName, setDepartmentName] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [languages, setLanguages] = useState<string[]>(["English", "Hindi"]);
  const [version, setVersion] = useState(0);
  const [questions, setQuestions] = useState<QuestionnaireQuestion[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveType, setSaveType] = useState<"success" | "error">("success");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!departmentId) return;
      try {
        const res = await api.getDepartmentQuestionnaire(departmentId);
        if (!mounted) return;
        const q = res.questionnaire;
        setTitle(q.title || "");
        setDescription(q.description || "");
        setIsActive(q.is_active);
        setLanguages(q.languages);
        setVersion(q.version);
        setQuestions(q.questions.length ? q.questions : [blankQuestion()]);
        try {
          const deps = await api.listMyDepartments();
          const own = deps.departments.find((d) => d.id === departmentId);
          if (mounted && own) setDepartmentName(own.name);
        } catch {
          // Department name is optional
        }
      } catch (err: unknown) {
        if (mounted) setLoadError(err instanceof Error ? err.message : "Could not load the questionnaire.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [departmentId]);

  const updateQuestion = (id: string, patch: Partial<QuestionnaireQuestion>) => {
    setQuestions((current) => current.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const addQuestion = () => {
    setQuestions((current) => [...current, { ...blankQuestion(), order: current.length }]);
  };

  const removeQuestion = (id: string) => {
    setQuestions((current) =>
      current
        .filter((q) => q.id !== id)
        .map((q) =>
          q.show_if_question === id
            ? { ...q, show_if_question: null, show_if_value: null }
            : q
        )
        .map((q, index) => ({ ...q, order: index }))
    );
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((q, i) => ({ ...q, order: i }));
    });
  };

  const addOption = (id: string) => {
    setQuestions((current) =>
      current.map((q) => (q.id === id ? { ...q, options: [...q.options, ""] } : q))
    );
  };

  const updateOption = (id: string, index: number, value: string) => {
    setQuestions((current) =>
      current.map((q) =>
        q.id === id ? { ...q, options: q.options.map((o, i) => (i === index ? value : o)) } : q
      )
    );
  };

  const removeOption = (id: string, index: number) => {
    setQuestions((current) =>
      current.map((q) => (q.id === id ? { ...q, options: q.options.filter((_, i) => i !== index) } : q))
    );
  };

  const toggleLanguage = (lang: string) => {
    setLanguages((current) =>
      current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang]
    );
  };

  const validate = (): string | null => {
    for (const q of questions) {
      if (!q.text.trim()) return "Every question needs a question text.";
      if (["multiple_choice", "multiple_select"].includes(q.answer_type) && q.options.filter((o) => o.trim()).length < 2) {
        return `"${q.text.trim()}" needs at least two options.`;
      }
      if (
        q.show_if_question &&
        !questions.some((other) => other.id === q.show_if_question)
      ) {
        return `"${q.text.trim()}" refers to a question that was removed.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      setSaveMessage(error);
      setSaveType("error");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    try {
      const payload: SaveQuestionnairePayload = {
        title: title.trim() || null,
        description: description.trim() || null,
        is_active: isActive,
        languages,
        questions: questions.map((q, index) => ({
          id: q.id.startsWith("local-") ? undefined : q.id,
          text: q.text.trim(),
          text_hi: q.text_hi?.trim() || null,
          answer_type: q.answer_type,
          required: q.required,
          options: q.options.map((o) => o.trim()).filter(Boolean),
          show_if_question: q.show_if_question,
          show_if_value: q.show_if_value,
          visit_type: q.visit_type || "all",
          order: index,
        })),
      };
      const res = await api.saveDepartmentQuestionnaire(departmentId!, payload);
      const saved = res.questionnaire;
      setTitle(saved.title || "");
      setDescription(saved.description || "");
      setIsActive(saved.is_active);
      setLanguages(saved.languages);
      setVersion(saved.version);
      setQuestions(saved.questions.length ? saved.questions : [blankQuestion()]);
      setSaveMessage("Questionnaire published successfully!");
      setSaveType("success");
    } catch (err: unknown) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to save the questionnaire.");
      setSaveType("error");
    } finally {
      setSaving(false);
    }
  };

  if (!departmentId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f5] px-6 text-[#17201d]">
        <div className="text-center">
          <p className="text-sm text-[#7b8581]">You are not linked to a department.</p>
          <button
            onClick={() => router.push("/doctor/dashboard")}
            className="mt-4 text-xs font-medium text-[#17201d] underline decoration-[#c5ceca] underline-offset-4"
          >
            Back to doctor workspace
          </button>
        </div>
      </main>
    );
  }

  if (!canEdit) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f5] px-6 text-[#17201d]">
        <div className="max-w-md text-center">
          <ClipboardList size={28} className="mx-auto mb-4 text-[#7b8581]" />
          <p className="text-sm text-[#7b8581]">
            Only the Head of Department can configure the department questionnaire.
          </p>
          <button
            onClick={() => router.push("/doctor/dashboard")}
            className="mt-4 text-xs font-medium text-[#17201d] underline decoration-[#c5ceca] underline-offset-4"
          >
            Back to doctor workspace
          </button>
        </div>
      </main>
    );
  }

  const conditionalSources = questions.filter((q) => !q.id.startsWith("local-"));

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-[#17201d]">
      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 lg:px-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <button
              onClick={() => router.push("/doctor/dashboard")}
              className="mb-5 flex items-center gap-2 text-[11px] text-[#7b8581] transition hover:text-[#17201d]"
            >
              <ArrowLeft size={14} />
              Back to doctor workspace
            </button>
            <h1 className="text-3xl font-medium tracking-[-0.045em]">
              Department Question Builder
            </h1>
            <p className="mt-2 text-sm text-[#7b8581]">
              {departmentName ? `${departmentName} — ` : ""}questions your patients are asked during the TLUX
              pre-consultation screening.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-[#e0e6e2] bg-white px-4 text-[11px] text-[#69736f] shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
              <span className="font-mono uppercase tracking-[0.14em]">Version</span>
              <span className="rounded-lg bg-[#edf3f1] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#4c756c]">
                {version || 0}
              </span>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex h-11 items-center gap-2 rounded-2xl bg-[#17201d] px-5 text-sm font-medium text-white shadow-[0_12px_30px_rgba(23,32,29,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#26332e] hover:shadow-[0_18px_40px_rgba(23,32,29,0.2)] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Save size={16} />
              {saving ? "Publishing..." : "Publish questionnaire"}
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-xs text-red-500">
            {loadError}
          </div>
        )}

        {saveMessage && (
          <div
            className={`mb-6 rounded-2xl border px-5 py-4 text-xs ${
              saveType === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                : "border-red-100 bg-red-50 text-red-500"
            }`}
          >
            {saveMessage}
          </div>
        )}

        {loading ? (
          <div className="rounded-[22px] border border-[#e0e6e2] bg-white p-7 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
            <p className="text-sm text-[#929b97]">Loading questionnaire...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Settings card */}
            <div className="rounded-[22px] border border-[#e0e6e2] bg-white p-7 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
              <p className="mb-5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                Questionnaire settings
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. General Medicine pre-consultation screening"
                    className="h-12 w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                  />
                </div>
                <div>
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Status
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsActive(!isActive)}
                      className={`relative h-7 w-12 rounded-full transition ${
                        isActive ? "bg-[#17201d]" : "bg-[#dfe5e2]"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                          isActive ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                    <span className={`text-xs ${isActive ? "text-[#4c756c]" : "text-[#929b97]"}`}>
                      {isActive ? "Active — patients are asked these questions" : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional note for the care team"
                    rows={2}
                    className="w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] p-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Languages
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {["English", "Hindi", "Tamil", "Marathi", "Telugu"].map((lang) => {
                      const on = languages.includes(lang);
                      return (
                        <button
                          key={lang}
                          onClick={() => toggleLanguage(lang)}
                          className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs transition ${
                            on
                              ? "border-[#c5d4ce] bg-[#eef4f1] text-[#4c756c]"
                              : "border-[#e0e6e2] bg-white text-[#929b97] hover:border-[#c5d4ce]"
                          }`}
                        >
                          {on && <Check size={12} />}
                          {lang}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                  Questions ({questions.length})
                </p>
                <button
                  onClick={addQuestion}
                  className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe5e2] bg-white px-4 text-xs font-medium text-[#35403c] transition hover:border-[#c5d4ce] hover:bg-[#f9faf9]"
                >
                  <Plus size={14} />
                  Add question
                </button>
              </div>

              {questions.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-[#d5ddd9] bg-white p-10 text-center">
                  <p className="text-sm text-[#929b97]">
                    No questions yet. Add the first question your patients will be asked.
                  </p>
                </div>
              )}

              {questions.map((question, index) => (
                <div
                  key={question.id}
                  className="rounded-[22px] border border-[#e0e6e2] bg-white p-6 shadow-[0_8px_30px_rgba(20,30,25,0.025)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-2 flex flex-col items-center gap-1">
                      <span className="font-mono text-[10px] text-[#a4aca8]">
                        {index + 1}
                      </span>
                      <button
                        onClick={() => moveQuestion(index, -1)}
                        disabled={index === 0}
                        className="p-0.5 text-[#b0b8b4] transition hover:text-[#17201d] disabled:opacity-30"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        onClick={() => moveQuestion(index, 1)}
                        disabled={index === questions.length - 1}
                        className="p-0.5 text-[#b0b8b4] transition hover:text-[#17201d] disabled:opacity-30"
                      >
                        <ChevronDown size={15} />
                      </button>
                      <GripVertical size={15} className="mt-1 text-[#d5ddd9]" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-4">
                      {/* Question text + type */}
                      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
                        <div>
                          <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                            Question
                          </label>
                          <input
                            type="text"
                            value={question.text}
                            onChange={(e) => updateQuestion(question.id, { text: e.target.value })}
                            placeholder="e.g. What problem are you experiencing?"
                            className="h-12 w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                          />
                        </div>
                        <div>
                          <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                            Answer type
                          </label>
                          <div className="relative">
                            <select
                              value={question.answer_type}
                              onChange={(e) =>
                                updateQuestion(question.id, { answer_type: e.target.value as AnswerType })
                              }
                              className="h-12 w-full appearance-none rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm text-[#35403c] outline-none transition focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                            >
                              {(Object.keys(ANSWER_TYPE_LABELS) as AnswerType[]).map((type) => (
                                <option key={type} value={type}>
                                  {ANSWER_TYPE_LABELS[type]}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              size={15}
                              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9aa49f]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Hindi translation */}
                      <div>
                        <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                          Question in हिन्दी (optional)
                        </label>
                        <input
                          type="text"
                          value={question.text_hi || ""}
                          onChange={(e) => updateQuestion(question.id, { text_hi: e.target.value })}
                          placeholder="e.g. आपको क्या समस्या हो रही है?"
                          className="h-12 w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                        />
                        <p className="mt-1.5 text-[10px] text-[#a4aca8]">
                          Patients who choose हिन्दी on the screening form will see this translation. Leave empty to fall back to the English question.
                        </p>
                      </div>

                      {/* Options editor */}
                      {["multiple_choice", "multiple_select"].includes(question.answer_type) && (
                        <div>
                          <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                            Options (at least two)
                          </label>
                          <div className="space-y-2">
                            {question.options.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => updateOption(question.id, optionIndex, e.target.value)}
                                  placeholder="Option text"
                                  className="h-11 w-full flex-1 rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                                />
                                <button
                                  onClick={() => removeOption(question.id, optionIndex)}
                                  disabled={question.options.length <= 1}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#dfe5e2] bg-white text-[#b0b8b4] transition hover:border-red-200 hover:bg-red-50 hover:text-red-400 disabled:opacity-30 disabled:pointer-events-none"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => addOption(question.id)}
                              className="flex items-center gap-1.5 text-xs font-medium text-[#4c756c] transition hover:text-[#17201d]"
                            >
                              <Plus size={13} />
                              Add option
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Conditional visibility */}
                      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
                        <div>
                          <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                            Show only if
                          </label>
                          <div className="relative">
                            <select
                              value={question.show_if_question || ""}
                              onChange={(e) =>
                                updateQuestion(question.id, {
                                  show_if_question: e.target.value || null,
                                  show_if_value: e.target.value ? question.show_if_value : null,
                                })
                              }
                              className="h-12 w-full appearance-none rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm text-[#35403c] outline-none transition focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                            >
                              <option value="">Always ask</option>
                              {conditionalSources
                                .filter((q) => q.id !== question.id && q.order < question.order)
                                .map((q) => (
                                  <option key={q.id} value={q.id}>
                                    {q.text.trim() || `Question ${q.order + 1}`}
                                  </option>
                                ))}
                            </select>
                            <ChevronDown
                              size={15}
                              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9aa49f]"
                            />
                          </div>
                          {conditionalSources.length === 0 && (
                            <p className="mt-1.5 text-[10px] text-[#a4aca8]">
                              Publish at least one earlier question to use it as a condition.
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                            Equals answer
                          </label>
                          <div className="relative">
                            <select
                              value={question.show_if_value || ""}
                              disabled={!question.show_if_question}
                              onChange={(e) =>
                                updateQuestion(question.id, { show_if_value: e.target.value || null })
                              }
                              className="h-12 w-full appearance-none rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm text-[#35403c] outline-none transition focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <option value="">Any answer</option>
                              {(() => {
                                const source = questions.find((q) => q.id === question.show_if_question);
                                if (source?.answer_type === "yes_no") {
                                  return (
                                    <>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </>
                                  );
                                }
                                if (source && (source.answer_type === "multiple_choice" || source.answer_type === "multiple_select")) {
                                  return source.options
                                    .filter((o) => o.trim())
                                    .map((o) => (
                                      <option key={o} value={o}>
                                        {o}
                                      </option>
                                    ));
                                }
                                return null;
                              })()}
                            </select>
                            <ChevronDown
                              size={15}
                              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9aa49f]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Required toggle */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateQuestion(question.id, { required: !question.required })}
                          className={`relative h-6 w-10 rounded-full transition ${
                            question.required ? "bg-[#17201d]" : "bg-[#dfe5e2]"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                              question.required ? "left-[18px]" : "left-0.5"
                            }`}
                          />
                        </button>
                        <span className={`text-xs ${question.required ? "text-[#35403c]" : "text-[#929b97]"}`}>
                          {question.required ? "Required answer" : "Optional"}
                        </span>
                      </div>

                      {/* Visit timing toggle */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">Ask on</span>
                        <div className="flex h-9 items-center gap-1 rounded-xl border border-[#e0e6e2] bg-[#f9faf9] p-1">
                          {([
                            { value: "all", label: "Every visit" },
                            { value: "first_visit", label: "First visit only" },
                            { value: "follow_up", label: "Follow-up only" },
                          ] as const).map(({ value, label }) => (
                            <button
                              key={value}
                              onClick={() => updateQuestion(question.id, { visit_type: value })}
                              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                                (question.visit_type || "all") === value
                                  ? "bg-white text-[#35403c] shadow-sm"
                                  : "text-[#97a19c] hover:text-[#35403c]"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <span className="text-[10px] text-[#a4aca8]">
                          {question.visit_type === "first_visit" ? "Asked only when a patient consults this department for the first time." : question.visit_type === "follow_up" ? "Asked only on return visits to this department." : "Asked on every visit."}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => removeQuestion(question.id)}
                      className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#dfe5e2] bg-white text-[#b0b8b4] transition hover:border-red-200 hover:bg-red-50 hover:text-red-400"
                      title="Delete question"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {questions.length > 0 && (
                <button
                  onClick={addQuestion}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d5ddd9] bg-white text-xs font-medium text-[#69736f] transition hover:border-[#aab5b0] hover:text-[#17201d]"
                >
                  <Plus size={15} />
                  Add question
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}