import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Tesseract from "tesseract.js";

const run = promisify(execFile);

function compactPoints(data) {
  const medicines = data.medicines.slice(0, 3).map((medicine) => [medicine.name, medicine.strength, medicine.dose, medicine.frequency, medicine.duration].filter(Boolean).join(" · "));
  return [...medicines, ...data.key_findings, ...data.instructions].filter(Boolean).slice(0, 3);
}

async function imageBase64(file) {
  if ((file.mimetype || "").startsWith("image/")) return (await readFile(file.path)).toString("base64");
  if (file.mimetype !== "application/pdf") throw new Error("Local extraction currently supports images and PDFs. Upload a JPG, PNG, or PDF.");
  const prefix = join(tmpdir(), `vitaweave-${randomUUID()}`);
  const pngPath = `${prefix}-1.png`;
  try {
    await run("pdftoppm", ["-png", "-f", "1", "-singlefile", "-r", "180", file.path, prefix]);
    return (await readFile(pngPath)).toString("base64");
  } finally { await rm(pngPath, { force: true }).catch(() => {}); }
}

function normalise(data) {
  return {
    document_summary: typeof data.document_summary === "string" ? data.document_summary : "",
    key_findings: Array.isArray(data.key_findings) ? data.key_findings.filter((item) => typeof item === "string") : [],
    medicines: Array.isArray(data.medicines) ? data.medicines.map((medicine) => ({ name: String(medicine.name || ""), strength: String(medicine.strength || ""), form: String(medicine.form || ""), dose: String(medicine.dose || ""), frequency: String(medicine.frequency || ""), duration: String(medicine.duration || "") })) : [],
    instructions: Array.isArray(data.instructions) ? data.instructions.filter((item) => typeof item === "string") : [],
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((item) => typeof item === "string") : [],
    needs_manual_review: Boolean(data.needs_manual_review),
  };
}

export async function extractMedicalDocumentFromFile(file, baseUrl, model, documentType = "clinical report") {
  try {
    // For now, only support image files - PDFs require external tools
    if (file.mimetype === "application/pdf") {
      throw new Error("PDF support requires additional installation. Please upload JPG/PNG images.");
    }

    // OCR with Tesseract.js using buffer
    const imageBuffer = await readFile(file.path);
    const { data: { text: ocrText } } = await Tesseract.recognize(imageBuffer, 'eng', {
      logger: m => console.log(m) // Optional: log progress
    });

    if (!ocrText || ocrText.trim().length < 10) {
      throw new Error("OCR produced insufficient text from document");
    }

    // Step 2: Extract structured data using local LLM
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        model, 
        stream: false, 
        format: "json", 
        options: { temperature: 0 }, 
        prompt: `Extract only directly visible facts from this ${documentType} OCR text. Never infer or invent medicines, findings, diagnoses, measurements, or warnings. Return valid JSON with document_summary (string), key_findings (string array), medicines (array of {name,strength,form,dose,frequency,duration}), instructions (string array), warnings (string array), needs_manual_review (boolean). Mark manual review true if text quality is poor or details are unclear. OCR text: ${ocrText.substring(0, 2000)}` 
      }),
    });

    if (!response.ok) throw new Error(`Local Ollama extraction failed (${response.status}): ${await response.text()}`);
    const body = await response.json();
    let parsed;
    try { parsed = JSON.parse(body.response || "{}"); } catch { throw new Error("Local Ollama returned invalid extraction JSON."); }
    const data = normalise(parsed);
    return { ocrText, data, points: compactPoints(data), status: data.needs_manual_review ? "needs_review" : "completed" };
  } catch (error) {
    console.error("OCR extraction error:", error);
    // Fallback: return structured data indicating processing limitation
    return {
      ocrText: null,
      data: {
        document_summary: `Uploaded ${documentType} - OCR processing failed`,
        key_findings: ["Document uploaded successfully", "OCR processing limitation"],
        medicines: [],
        instructions: ["Review original document for details"],
        warnings: ["Manual review required"],
        needs_manual_review: true
      },
      points: [`Uploaded ${documentType} - OCR processing failed`, "Review original document for details"],
      status: "needs_review"
    };
  }
}
