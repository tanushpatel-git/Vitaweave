const { config } = require("../config");
const { Report } = require("../models/schemas");

const EXTRACTION_TIMEOUT_MS = 90_000;

function normalizeFlaggedValues(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((f) => {
      if (typeof f === "string") return f.trim().slice(0, 500);
      if (f && typeof f === "object") {
        const name = String(f.name || "Value").trim();
        const value = f.value !== undefined && f.value !== null ? String(f.value) : "";
        const unit = f.unit ? String(f.unit) : "";
        const status = f.status && f.status !== "normal" ? `(${String(f.status)})` : "";
        return [name, value, unit, status].filter(Boolean).join(" ").trim().slice(0, 500);
      }
      return null;
    })
    .filter(Boolean);
}

// Cloud-hosted files (ImageKit) are fetched and sent to the AI service
// in-memory, so extraction never depends on a local disk path.
async function fetchFileBase64FromUrl(fileUrl) {
  try {
    const resp = await fetch(fileUrl);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return buf.toString("base64");
  } catch (e) {
    console.warn("[medical-doc] could not fetch cloud file:", e.message);
    return null;
  }
}

/**
 * Sends a saved report to the FastAPI AI service for structured medical
 * extraction (classification → text/OCR → LLM summary → structured findings).
 * The file travels as in-memory base64 (fresh upload or cloud URL), falling
 * back to a local disk path for legacy local-hosted reports.
 * Fully non-blocking on failure so an upload is never lost.
 */
async function extractMedicalDocument({ reportId, filePath, fileBase64, fileUrl, filename, reportType, title }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  const payload = {
    report_id: reportId,
    file_path: filePath || null,
    filename,
    report_type: reportType,
    title,
  };
  if (fileBase64) {
    payload.file_base64 = fileBase64;
  } else if (fileUrl && /^https?:\/\//.test(fileUrl)) {
    const b64 = await fetchFileBase64FromUrl(fileUrl);
    if (b64) payload.file_base64 = b64;
  }
  try {
    const resp = await fetch(`${config.aiServiceUrl}/api/extract-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AI-Key": config.aiServiceApiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`AI extraction failed with status ${resp.status}: ${text.slice(0, 300)}`);
    }
    return await resp.json();
  } catch (e) {
    console.warn("[medical-doc] AI extraction unavailable:", e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Applies a completed extraction payload to the stored report so both upload
 * flows (hospital/doctor uploads and patient prescription uploads) share the
 * exact same status/findings bookkeeping. `preserveSummary` keeps a manually
 * entered summary (e.g. the patient's typed prescription details) instead of
 * replacing it with the AI narrative.
 */
async function applyExtractionResult({ reportId, data, preserveSummary = false }) {
  if (!data) {
    await Report.findByIdAndUpdate(reportId, { ai_status: "failed", ai_error: "AI service unavailable" });
    return { failed: true };
  }
  const findings = Array.isArray(data.findings) ? data.findings.map((f) => ({
    name: f.name || "Unknown",
    value: f.value !== undefined && f.value !== null ? String(f.value) : null,
    unit: f.unit || null,
    reference_range: f.reference_range || null,
    status: f.status || "normal",
  })) : [];
  // A fallback response carrying an error means the document could not be
  // processed (e.g. unreadable scan/OCR). Mark failed so the doctor sees an
  // explicit "reprocess" path instead of a misleading completed summary.
  const failed = Boolean(data.error);
  const usableSummary = data.summary && !failed;
  const update = {
    ai_status: failed ? "failed" : "completed",
    ai_classified_type: data.classified_type || null,
    ai_summary: usableSummary ? data.summary : null,
    ai_findings: findings,
    ai_raw_text: data.raw_text || null,
    flagged_findings: normalizeFlaggedValues(data.flagged_values),
    extracted_points: Array.isArray(data.key_observations) ? data.key_observations.filter(Boolean) : [],
    extraction_source: "ai-pipeline",
    ai_extracted_at: new Date(),
    ai_error: data.error || null,
  };
  if (!preserveSummary) update.summary = usableSummary ? data.summary : null;
  await Report.findByIdAndUpdate(reportId, update);
  return { failed, usableSummary };
}

module.exports = { extractMedicalDocument, applyExtractionResult, normalizeFlaggedValues };