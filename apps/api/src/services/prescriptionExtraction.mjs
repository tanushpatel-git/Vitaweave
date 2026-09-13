import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import Tesseract from "tesseract.js";

/**
 * Extract clean display points for the patient summary and doctor cards.
 */
function compactPoints(data) {
  const clean = (str) => typeof str === "string" ? str.trim() : "";
  const isNone = (str) => {
    const s = clean(str).toLowerCase();
    return !s || s === "none" || s === "none specified" || s === "n/a" || s === "null";
  };

  const medicines = (data.medicines || [])
    .filter((m) => m && !isNone(m.name))
    .map((m) => {
      const parts = [m.name, m.strength, m.form, m.dose, m.frequency, m.duration]
        .map(clean)
        .filter((val) => !isNone(val));
      return parts.join(" · ");
    })
    .filter(Boolean);

  const findings = (data.key_findings || [])
    .map(clean)
    .filter((f) => !isNone(f));

  const instructions = (data.instructions || [])
    .map(clean)
    .filter((i) => !isNone(i));

  const points = [...medicines, ...findings, ...instructions].slice(0, 4);

  if (points.length > 0) return points;
  if (!isNone(data.document_summary)) return [clean(data.document_summary)];
  return ["Document processed — review attached image for details."];
}

/**
 * Extract readable text from digital PDF stream buffers using pure Node.js zlib.
 */
function extractPdfText(buffer) {
  let text = "";
  const str = buffer.toString("latin1");
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;

  while ((match = streamRegex.exec(str)) !== null) {
    try {
      const streamData = Buffer.from(match[1], "latin1");
      const uncompressed = inflateSync(streamData).toString("latin1");
      
      // Match (text) Tj
      const tjMatches = uncompressed.match(/\((.*?)\)\s*Tj/g) || [];
      for (const tj of tjMatches) {
        text += tj.replace(/^\(|\)\s*Tj$/g, "") + " ";
      }

      // Match [(text)] TJ
      const tjArrayMatches = uncompressed.match(/\[(.*?)\]\s*TJ/g) || [];
      for (const tja of tjArrayMatches) {
        const parts = tja.match(/\((.*?)\)/g) || [];
        text += parts.map((p) => p.slice(1, -1)).join("") + " ";
      }
    } catch {
      // Ignore non-deflate stream segments
    }
  }

  // Unescape standard PDF literal escape sequences
  return text
    .replace(/\\([()\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize and sanitize structured JSON output from LLM.
 */
function normalise(data) {
  const isString = (v) => typeof v === "string" && v.trim().length > 0;
  return {
    document_summary: typeof data.document_summary === "string" ? data.document_summary.trim() : "",
    key_findings: Array.isArray(data.key_findings)
      ? data.key_findings.filter(isString).map((s) => s.trim())
      : [],
    medicines: Array.isArray(data.medicines)
      ? data.medicines
          .filter((m) => m && (m.name || m.medicine))
          .map((m) => ({
            name: String(m.name || m.medicine || "").trim(),
            strength: String(m.strength || "").trim(),
            form: String(m.form || "").trim(),
            dose: String(m.dose || m.dosage || "").trim(),
            frequency: String(m.frequency || "").trim(),
            duration: String(m.duration || "").trim(),
          }))
      : [],
    instructions: Array.isArray(data.instructions)
      ? data.instructions.filter(isString).map((s) => s.trim())
      : [],
    warnings: Array.isArray(data.warnings)
      ? data.warnings.filter(isString).map((s) => s.trim())
      : [],
    needs_manual_review: Boolean(data.needs_manual_review),
  };
}

/**
 * Robust fallback to extract medicines & findings directly from OCR text
 * if the local Ollama LLM is busy, loading weights, or timed out.
 */
function heuristicExtraction(ocrText, documentType) {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  const medicines = [];
  const findings = [];
  const instructions = [];

  const medPattern = /\b(tab|cap|syr|inj|ointment|gel|suspension|tablet|capsule|syrup|drop|mg|mcg|ml|od|bd|tds|qid|hs|sos)\b/i;

  for (const line of lines) {
    if (medPattern.test(line)) {
      medicines.push({
        name: line.replace(/^(rx|tab|cap|syr|inj)\s*[:.]?\s*/i, "").slice(0, 60),
        strength: (line.match(/\b\d+\s*(?:mg|mcg|ml|g)\b/i) || [""])[0],
        form: (line.match(/\b(tab|cap|syr|inj|tablet|capsule)\b/i) || [""])[0],
        dose: (line.match(/\b\d+\s*(?:tab|cap|tablet|capsule|spoon|ml)\b/i) || ["1"])[0],
        frequency: (line.match(/\b(od|bd|tds|qid|hs|sos|daily|once daily|twice daily)\b/i) || [""])[0],
        duration: (line.match(/\b\d+\s*(?:days|weeks|months)\b/i) || [""])[0],
      });
    } else if (/\b(diagnosis|impression|finding|result|history|complaint|hypertension|fever|cough|pain|diabetes)\b/i.test(line)) {
      findings.push(line.slice(0, 100));
    } else if (/\b(take|advice|follow|avoid|drink|after food|before food|bedtime|diet|rest)\b/i.test(line)) {
      instructions.push(line.slice(0, 100));
    }
  }

  // If no specific lines matched regex, take the top 3 readable lines as extracted text
  const cleanLines = lines.filter((l) => l.replace(/[^a-zA-Z0-9]/g, "").length >= 4);
  const fallbackPoints = medicines.length > 0 || findings.length > 0
    ? []
    : cleanLines.slice(0, 3);

  const data = normalise({
    document_summary: `${documentType} document text extracted via local OCR`,
    key_findings: findings.length > 0 ? findings.slice(0, 4) : fallbackPoints,
    medicines: medicines.slice(0, 5),
    instructions: instructions.slice(0, 3),
    warnings: [],
    needs_manual_review: false,
  });

  const points = compactPoints(data);

  return {
    data,
    points: points.length > 0 ? points : [cleanLines[0] || `${documentType} text processed`],
    status: "completed",
  };
}

/**
 * Main medical document extraction function.
 * 1. Reads image via Tesseract OCR or extracts text from PDF.
 * 2. Formulates clinical structuring prompt and passes text to Ollama JSON mode.
 * 3. Normalizes medicines, findings, instructions and returns completed status.
 */
export async function extractMedicalDocumentFromFile(
  file,
  baseUrl = "http://127.0.0.1:11434",
  model = "llama3.2:latest",
  documentType = "clinical report"
) {
  if (!file || !file.path) {
    throw new Error("A valid document file path is required for extraction.");
  }

  const isPdf = file.mimetype === "application/pdf" || (file.originalname || "").toLowerCase().endsWith(".pdf");
  let ocrText = "";

  // Step 1: Extract text from PDF or Image
  try {
    if (isPdf) {
      const buffer = await readFile(file.path);
      ocrText = extractPdfText(buffer);
    } else {
      // Local image OCR using Tesseract.js
      const result = await Tesseract.recognize(file.path, "eng");
      ocrText = (result?.data?.text || "").trim();
    }
  } catch (err) {
    console.warn("Document OCR/PDF text extraction error:", err?.message || err);
  }

  // If no text was found at all
  if (!ocrText || ocrText.trim().length < 8) {
    return {
      ocrText: null,
      data: {
        document_summary: `Uploaded ${documentType} — visual inspection required`,
        key_findings: ["Document uploaded successfully", "Visual inspection required"],
        medicines: [],
        instructions: ["Review original document for clinical details"],
        warnings: ["Manual review required"],
        needs_manual_review: true,
      },
      points: [`Uploaded ${documentType} — visual inspection required`],
      status: "needs_review",
    };
  }

  // Step 2: Use local Ollama LLM to extract structured clinical data
  const cleanBaseUrl = (baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
  const targetModel = model || "llama3.2:latest";

  const prompt = `Extract only directly visible facts from this ${documentType} OCR text. Never infer or invent medicines, findings, diagnoses, or warnings. Return valid JSON with document_summary (string), key_findings (string array), medicines (array of {name,strength,form,dose,frequency,duration}), instructions (string array), warnings (string array), needs_manual_review (boolean). OCR text: ${ocrText.slice(0, 3000)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${cleanBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: targetModel,
        prompt,
        format: "json",
        stream: false,
        options: {
          temperature: 0,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();
      const rawContent = json.response || "";
      const parsed = JSON.parse(rawContent);
      const data = normalise(parsed);
      const points = compactPoints(data);

      return {
        ocrText,
        data,
        points,
        status: data.needs_manual_review ? "needs_review" : "completed",
      };
    }
  } catch (err) {
    console.warn("Ollama LLM structuring error (using resilient heuristic extraction):", err?.message || err);
  }

  // Step 3: Heuristic fallback from OCR text if Ollama times out or errors
  const fallback = heuristicExtraction(ocrText, documentType);
  return {
    ocrText,
    data: fallback.data,
    points: fallback.points,
    status: fallback.status,
  };
}
