const { config } = require("../config");

const ASCII_RATIO_THRESHOLD = 0.95;
const TRANSLATE_TIMEOUT_MS = 10_000;

function looksEnglish(text) {
  const ascii = Array.from(text).filter((ch) => ch.charCodeAt(0) <= 0x7f).length;
  return text.length > 0 && ascii / text.length >= ASCII_RATIO_THRESHOLD;
}

const REFUSAL_PATTERNS = [
  /can'?t translate/i,
  /cannot translate/i,
  /unable to translate/i,
  /i'?m sorry/i,
  /i am sorry/i,
  /as an ai (language model)?/i,
];

function looksLikeRefusal(text) {
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Translates free-text answers into English server-side so the doctor always
 * sees an English-only review screen. Falls back to the original text when the
 * AI translation service is unavailable, so the appointment flow never breaks.
 */
async function translateToEnglish(texts) {
  const safeTexts = (texts || []).filter((t) => typeof t === "string" && t.trim() !== "");
  if (!safeTexts.length) return [];

  const results = [];
  const needsTranslation = safeTexts.map((text) => {
    const english = looksEnglish(text);
    results.push(english ? text : null);
    return !english;
  });

  if (!needsTranslation.some(Boolean)) return results;

  const pendingIndexes = safeTexts.map((text, index) => (needsTranslation[index] ? index : -1)).filter((index) => index !== -1);
  const pendingTexts = pendingIndexes.map((index) => safeTexts[index]);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${config.aiServiceUrl}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AI-Key": config.aiServiceApiKey },
      body: JSON.stringify({ texts: pendingTexts, target_language: "en" }),
      signal: controller.signal,
    });
    if (resp.ok) {
      const data = await resp.json();
      const translations = Array.isArray(data.translations) ? data.translations : [];
      pendingIndexes.forEach((index, i) => {
        const candidate = typeof translations[i] === "string" ? translations[i].trim() : "";
        const translated = candidate && !looksLikeRefusal(candidate) ? candidate : null;
        results[index] = translated || safeTexts[index];
      });
    }
  } catch (e) {
    console.warn("Translation service unavailable, keeping original answer:", e.message);
  } finally {
    clearTimeout(timer);
  }

  return results;
}

module.exports = { translateToEnglish };