// Pure-math trend engine for lab observations. Numbers are computed here;
// the LLM only ever explains these precomputed facts (never recalculates).
//
// Input: a patient's reports (sorted by date) with ai_findings.
// Output: per-parameter time series + percentage changes vs previous reading
// and overall (first → last).

const PARAMETER_ALIASES = [
  { key: "hemoglobin", aliases: ["hemoglobin", "haemoglobin", "hgb", "hb"] },
  { key: "wbc", aliases: ["white blood cells", "wbc count", "wbc", "total leukocyte count", "leukocytes", "tlc"] },
  { key: "rbc", aliases: ["red blood cells", "rbc count", "rbc"] },
  { key: "platelets", aliases: ["platelet count", "platelets", "plt", "plts"] },
  { key: "hematocrit", aliases: ["hematocrit", "haematocrit", "pcv", "packed cell volume", "hct"] },
  { key: "mcv", aliases: ["mean corpuscular volume", "mcv"] },
  { key: "mch", aliases: ["mean corpuscular hemoglobin", "mch"] },
  { key: "mchc", aliases: ["mean corpuscular hemoglobin concentration", "mchc"] },
  { key: "rdw", aliases: ["red cell distribution width", "rdw"] },
  { key: "neutrophils", aliases: ["neutrophils", "neutrophil count", "absolute neutrophils"] },
  { key: "lymphocytes", aliases: ["lymphocytes", "lymphocyte count"] },
  { key: "monocytes", aliases: ["monocytes", "monocyte count"] },
  { key: "eosinophils", aliases: ["eosinophils", "eosinophil count"] },
  { key: "basophils", aliases: ["basophils", "basophil count"] },
  { key: "creatinine", aliases: ["creatinine", "serum creatinine"] },
  { key: "urea", aliases: ["urea", "blood urea", "bun"] },
  { key: "glucose", aliases: ["glucose", "blood sugar", "fasting glucose", "fbs", "rbs", "random glucose"] },
  { key: "hba1c", aliases: ["hba1c", "glycated hemoglobin", "glycosylated hemoglobin", "a1c"] },
  { key: "cholesterol_total", aliases: ["total cholesterol", "cholesterol"] },
  { key: "hdl", aliases: ["hdl", "hdl cholesterol", "high density lipoprotein"] },
  { key: "ldl", aliases: ["ldl", "ldl cholesterol", "low density lipoprotein"] },
  { key: "triglycerides", aliases: ["triglycerides", "triglyceride", "tg"] },
  { key: "sgpt_alt", aliases: ["sgpt", "alt", "alanine aminotransferase"] },
  { key: "sgot_ast", aliases: ["sgot", "ast", "aspartate aminotransferase"] },
  { key: "albumin", aliases: ["albumin", "serum albumin"] },
  { key: "total_bilirubin", aliases: ["total bilirubin", "bilirubin total", "bilirubin"] },
  { key: "sodium", aliases: ["sodium", "na"] },
  { key: "potassium", aliases: ["potassium", "k"] },
  { key: "chloride", aliases: ["chloride", "cl"] },
  { key: "calcium", aliases: ["calcium", "ca"] },
  { key: "tsh", aliases: ["tsh", "thyroid stimulating hormone"] },
  { key: "t3", aliases: ["t3", "triiodothyronine"] },
  { key: "t4", aliases: ["t4", "thyroxine", "free thyroxine"] },
  { key: "crp", aliases: ["crp", "c-reactive protein", "c reactive protein"] },
  { key: "esr", aliases: ["esr", "erythrocyte sedimentation rate"] },
  { key: "uric_acid", aliases: ["uric acid", "urate"] },
  { key: "vitamin_d", aliases: ["vitamin d", "25-oh vitamin d", "25 hydroxy vitamin d"] },
  { key: "vitamin_b12", aliases: ["vitamin b12", "b12", "cobalamin"] },
  { key: "ferritin", aliases: ["ferritin", "serum ferritin"] },
  { key: "prothrombin_time", aliases: ["prothrombin time", "pt"] },
  { key: "inr", aliases: ["inr", "international normalized ratio"] },
];

const FLAGGED_STATUSES = new Set(["high", "low", "critical"]);

function cleanName(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalParamName(raw) {
  const name = cleanName(raw);
  if (!name) return null;
  for (const group of PARAMETER_ALIASES) {
    for (const alias of group.aliases) {
      const a = alias.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      if (name === a || name.includes(a) || (a.length > 6 && a.includes(name))) {
        return group.key;
      }
    }
  }
  // No known alias — score by first word to keep distinct unknowns grouped.
  const firstWord = name.split(" ")[0];
  return firstWord.length >= 2 ? `par_${firstWord}` : null;
}

function parseNumericValue(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  // "8,000", "10.2", "2.1L", "<0.01", "0.5-1.0" → first number wins, ignore ranges
  const match = String(raw).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function pctChange(first, last) {
  if (first === null || last === null || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

function direction(changePct) {
  if (changePct === null) return "stable";
  if (changePct > 1) return "up";
  if (changePct < -1) return "down";
  return "stable";
}

function fmt(value) {
  if (value === null || value === undefined) return "";
  if (Math.round(value) === value) return Math.round(value).toString();
  return String(Math.round(value * 100) / 100);
}

/**
 * Compute longitudinal trends from a patient's reports.
 * @param {Array<{_id: unknown, date: Date|string, ai_findings: Array, flagged_findings?: string[], type: string}>} reports
 * @returns {{parameters: Array<object>, report_ids: string[]}}
 */
function computeTrends(reports) {
  const params = new Map();

  for (const report of reports || []) {
    if (!Array.isArray(report.ai_findings) || report.ai_findings.length === 0) continue;
    const date = report.date instanceof Date ? report.date : new Date(report.date);
    if (Number.isNaN(date.getTime())) continue;
    const reportId = String(report._id);

    for (const finding of report.ai_findings) {
      const key = canonicalParamName(finding && finding.name);
      if (!key) continue;
      const value = parseNumericValue(finding && finding.value);
      if (value === null) continue;

      let entry = params.get(key);
      if (!entry) {
        entry = {
          key,
          name: String(finding.name || key).trim(),
          unit: finding.unit || null,
          flagged: key !== "generic" && (FLAGGED_STATUSES.has(finding.status) || false),
          readings: [],
        };
        params.set(key, entry);
      }
      if (finding.unit && finding.unit !== entry.unit) entry.unit = entry.unit || finding.unit;
      if (FLAGGED_STATUSES.has(finding.status)) entry.flagged = true;
      entry.readings.push({ value, date: new Date(date).toISOString(), report_id: reportId });
    }
  }

  const parameters = [];
  for (const entry of params.values()) {
    if (entry.readings.length === 0) continue;
    entry.readings.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Deduplicate same-date same-value readings (e.g. reprocessed report).
    const unique = [];
    for (const r of entry.readings) {
      const last = unique[unique.length - 1];
      if (last && last.date === r.date && last.report_id === r.report_id) continue;
      unique.push(r);
    }
    entry.readings = unique;
    if (unique.length < 1) continue;

    const first = unique[0];
    const last = unique[unique.length - 1];
    const overall = pctChange(first.value, last.value);

    const changes = unique.slice(1).map((reading, index) => ({
      from_value: unique[index].value,
      to_value: reading.value,
      change_pct: pctChange(unique[index].value, reading.value),
      date: reading.date,
    }));

    parameters.push({
      key: entry.key,
      name: entry.name,
      unit: entry.unit || null,
      flagged: entry.flagged,
      trend: direction(overall),
      first_value: first.value,
      last_value: last.value,
      first_date: first.date,
      last_date: last.date,
      overall_change_pct: overall,
      readings: unique,
      changes,
    });
  }

  parameters.sort((a, b) =>
    Math.abs(a.overall_change_pct || 0) > Math.abs(b.overall_change_pct || 0) ? -1 : 1
  );

  const reportIds = [
    ...new Set((reports || []).filter((r) => r.date).map((r) => String(r._id))),
  ];
  return { parameters, report_ids: reportIds };
}

function formatPct(pct) {
  if (pct === null || pct === undefined) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${Math.round(pct * 10) / 10}%`;
}

module.exports = { computeTrends, pctChange, formatPct, parseNumericValue, canonicalParamName };