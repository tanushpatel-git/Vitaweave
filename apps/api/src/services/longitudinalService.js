const { config } = require("../config");
const { Report, Appointment, HealthTimeline } = require("../models/schemas");
const { computeTrends, pctChange } = require("./trendEngine");

const LLM_TIMEOUT_MS = 60_000;
const STALE_AFTER_MS = 60 * 60 * 1000; // regenerate summary at most ~1/hour on read

// In-memory guard so only one regeneration runs per patient at a time.
const rebuilding = new Set();

function fmt(value) {
  if (value === null || value === undefined) return "";
  if (Math.round(value) === value) return Math.round(value).toString();
  return String(Math.round(value * 100) / 100).replace(/\.0+$/, "");
}

function pctLabel(pct) {
  if (pct === null || pct === undefined) return "no overall change recorded";
  const sign = pct > 0 ? "+" : "";
  return `changed ${sign}${fmt(Math.round(pct * 10) / 10)}%`;
}

// Clinical-placeholder narrative built entirely from precomputed math. Used
// when the LLM is unavailable so the trends stay visible and traceable.
function fallbackNarrative({ patientName, reportCount, firstDate, lastDate, parameters }) {
  const parts = [];
  if (firstDate && lastDate) {
    parts.push(`Across ${reportCount} recorded annual report(s) between ${String(firstDate).slice(0, 10)} and ${String(lastDate).slice(0, 10)}:`);
  } else {
    parts.push(`Across ${reportCount} recorded report(s):`);
  }
  const notable = parameters.slice(0, 6);
  if (notable.length) {
    notable.forEach((p) => {
      parts.push(`${p.name} changed from ${fmt(p.first_value)}${p.unit ? ` ${p.unit}` : ""} (${String(p.first_date).slice(0, 10)}) to ${fmt(p.last_value)}${p.unit ? ` ${p.unit}` : ""} (${String(p.last_date).slice(0, 10)}), ${pctLabel(p.overall_change_pct)} overall.`);
    });
    const flagged = parameters.filter((p) => p.flagged);
    if (flagged.length) parts.push(`Flagged readings were recorded for: ${flagged.map((p) => p.name).join(", ")}.`);
  } else {
    parts.push("No numeric lab trends could be tracked from the uploaded reports.");
  }
  parts.push("Review the readings against laboratory reference ranges and the patient's clinical history.");
  return parts.join(" ");
}

async function requestLongitudinalNarrative({ patientName, reportCount, firstDate, lastDate, parameters }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const resp = await fetch(`${config.aiServiceUrl}/api/longitudinal-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AI-Key": config.aiServiceApiKey },
      body: JSON.stringify({
        patient_name: patientName,
        report_count: reportCount,
        first_report_date: firstDate ? String(firstDate).slice(0, 10) : null,
        last_report_date: lastDate ? String(lastDate).slice(0, 10) : null,
        parameters: parameters.map((p) => ({
          name: p.name,
          unit: p.unit,
          first_value: p.first_value,
          last_value: p.last_value,
          first_date: p.first_date,
          last_date: p.last_date,
          overall_change_pct: p.overall_change_pct,
          flagged: p.flagged,
          readings: p.readings.map((r) => ({ value: r.value, date: r.date })),
        })),
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`longitudinal-summary ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    return { summary: data?.summary || null };
  } catch (e) {
    console.warn("[longitudinal] AI narrative unavailable:", e.message);
    return { summary: null, error: String(e.message).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rebuild (or create) the patient's persisted HealthTimeline from report data.
 * Numbers always come from the trend engine; the LLM only narrates them.
 */
async function regenerateHealthTimeline(patientId, patientName) {
  if (rebuilding.has(String(patientId))) return null;
  rebuilding.add(String(patientId));
  try {
    const reports = await Report.find({ patient_id: patientId, ai_status: "completed" })
      .select("_id title type ai_classified_type date ai_findings flagged_findings ai_extracted_at")
      .sort({ date: 1 })
      .lean();

    const withFindings = reports.filter((r) => Array.isArray(r.ai_findings) && r.ai_findings.length > 0);
    const { parameters, report_ids } = computeTrends(withFindings);

    const dated = reports.filter((r) => r.date);
    const firstDate = dated.length ? dated[0].date : null;
    const lastDate = dated.length ? dated[dated.length - 1].date : null;
    const visitCount = await Appointment.countDocuments({ patient_id: patientId, status: { $in: ["completed", "confirmed"] } });

    const base = {
      patient_id: patientId,
      report_count: reports.length,
      visit_count: visitCount,
      first_report_date: firstDate,
      last_report_date: lastDate,
      parameters: parameters.map((p) => ({
        key: p.key,
        name: p.name,
        unit: p.unit,
        flagged: p.flagged,
        trend: p.trend,
        first_value: p.first_value,
        last_value: p.last_value,
        first_date: p.first_date,
        last_date: p.last_date,
        overall_change_pct: p.overall_change_pct,
        readings: p.readings,
        changes: p.changes,
      })),
      timeline: dated.map((r) => ({
        report_id: r._id,
        title: r.title,
        type: r.ai_classified_type || r.type,
        date: r.date,
      })),
      source_report_ids: report_ids,
    };

    let summary = null;
    let summaryError = null;
    if (parameters.length > 0) {
      const ai = await requestLongitudinalNarrative({
        patientName,
        reportCount: reports.length,
        firstDate,
        lastDate,
        parameters,
      });
      summary = ai.summary;
      summaryError = ai.error || null;
    }

    return await HealthTimeline.findOneAndUpdate(
      { patient_id: patientId },
      {
        ...base,
        summary,
        summary_error: summaryError,
        version: 1,
        generated_at: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (e) {
    console.warn("[longitudinal] rebuild failed:", e.message);
    return null;
  } finally {
    rebuilding.delete(String(patientId));
  }
}

/**
 * Return the stored timeline if fresh enough; otherwise regenerate in the
 * background and return the current (or freshly built) one.
 */
async function getHealthTimeline(patientId, patientName, { force = false } = {}) {
  let timeline = await HealthTimeline.findOne({ patient_id: patientId }).lean();

  const stale = !timeline || force || !timeline.generated_at ||
    Date.now() - new Date(timeline.generated_at).getTime() > STALE_AFTER_MS;

  if (stale && !rebuilding.has(String(patientId))) {
    if (timeline) {
      regenerateHealthTimeline(patientId, patientName).catch(() => {});
    } else {
      timeline = await regenerateHealthTimeline(patientId, patientName);
    }
  }
  return timeline;
}

/**
 * Find the most recent completed/confirmed appointment of the patient (used as
 * the "since" anchor for What's Changed). Falls back to the penultimate report
 * date so there is always a meaningful comparison window.
 */
async function resolveChangedSinceDate(patientId, timeline) {
  const visit = await Appointment.findOne({
    patient_id: patientId,
    scheduled_for: { $lte: new Date() },
    status: { $in: ["completed", "confirmed"] },
  }).sort({ scheduled_for: -1 }).select("scheduled_for").lean();
  if (visit && visit.scheduled_for) return new Date(visit.scheduled_for);

  const dates = (timeline?.timeline || [])
    .map((t) => t.date)
    .filter(Boolean)
    .map((d) => new Date(d))
    .sort((a, b) => a - b);
  if (dates.length >= 2) return dates[dates.length - 2];
  return null;
}

function paramUnitLabel(value) {
  if (value === null || value === undefined) return "";
  return `${value}`;
}

/**
 * Compute "What's changed since last visit": new documents + per-parameter
 * deltas between the reading closest to (and before) the anchor date and the
 * latest reading. Pure math; traceable to report dates.
 */
function buildWhatChanged(timeline, sinceDate, unitMap) {
  const changed = { since_date: sinceDate ? sinceDate.toISOString() : null, reports_added: [], parameters: [] };
  if (!timeline || !sinceDate) return changed;

  changed.reports_added = (timeline.timeline || []).filter((t) => t.date && new Date(t.date) > sinceDate);

  for (const p of timeline.parameters || []) {
    if (!Array.isArray(p.readings) || !p.readings.length) continue;
    const before = [...p.readings].filter((r) => new Date(r.date) <= sinceDate).pop();
    const latest = p.readings[p.readings.length - 1];
    if (!latest) continue;
    const unit = p.unit || "";
    if (!before) {
      changed.parameters.push({
        key: p.key,
        name: p.name,
        change_pct: null,
        direction: "new",
        label: `${p.name} first recorded at ${paramUnitLabel(latest.value)}${unit ? ` ${unit}` : ""} (${String(latest.date).slice(0, 10)})`,
      });
      continue;
    }
    const pct = pctChange(before.value, latest.value);
    if (pct === null || Math.abs(pct) < 1) continue;
    const dir = pct > 0 ? "up" : "down";
    const arrow = pct > 0 ? "increased" : "decreased";
    const magnitude = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
    changed.parameters.push({
      key: p.key,
      name: p.name,
      change_pct: pct,
      direction: dir,
      label: `${p.name} ${arrow} ${Math.abs(magnitude)}% (${fmt(before.value)}${unit ? ` ${unit}` : ""} → ${fmt(latest.value)}${unit ? ` ${unit}` : ""})`,
    });
  }
  return changed;
}

module.exports = { regenerateHealthTimeline, getHealthTimeline, fallbackNarrative, resolveChangedSinceDate, buildWhatChanged };