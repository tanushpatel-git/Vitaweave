const { config } = require("../config");

const SUMMARY_TIMEOUT_MS = 25_000;

/**
 * Turns a patient's screening answers into a single consolidated clinical
 * summary (English) using the AI service. Called on every submission so the
 * stored summary always reflects the latest answers. Falls back to null when
 * the AI service is unavailable, in which case the doctor's view simply shows
 * the raw question/answer list.
 */
async function summarizeScreening(answers, department) {
  const safeAnswers = (answers || []).filter(
    (a) => a && typeof a.question === "string" && a.question.trim() !== "" && a.answer !== null && a.answer !== undefined && a.answer !== ""
  );
  if (!safeAnswers.length) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);
  try {
    const resp = await fetch(`${config.aiServiceUrl}/api/summarize-screening`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AI-Key": config.aiServiceApiKey },
      body: JSON.stringify({ answers: safeAnswers, department: department || "" }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const narrative = data && data.summary && typeof data.summary.narrative === "string" ? data.summary.narrative.trim() : "";
    return narrative ? { narrative } : null;
  } catch (e) {
    console.warn("Screening summarization service unavailable:", e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { summarizeScreening };