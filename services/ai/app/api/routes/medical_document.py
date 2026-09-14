import base64
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ...llm.provider import get_provider
from ..deps import verify_ai_key

router = APIRouter()

# Repo root: services/ai/app/api/routes -> 6 parents up
UPLOAD_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent.parent.parent
    / "apps"
    / "api"
    / "uploads"
    / "reports"
)


class ReportExtractionRequest(BaseModel):
    report_id: str
    file_path: str | None = None
    file_base64: str | None = None
    filename: str | None = None
    report_type: str | None = None
    title: str | None = None


class Finding(BaseModel):
    name: str
    value: str | None = None
    unit: str | None = None
    reference_range: str | None = None
    status: str = "normal"


class ReportExtractionResponse(BaseModel):
    report_id: str
    classified_type: str
    summary: str
    findings: list[Finding] = Field(default_factory=list)
    flagged_values: list[str] = Field(default_factory=list)
    key_observations: list[str] = Field(default_factory=list)
    raw_text: str | None = None
    disclaimer: str = "This is an AI-generated summary and must be verified by a qualified clinician."
    status: str = "completed"
    error: str | None = None


SYSTEM_PROMPT = """You are a medical document analysis assistant. You receive extracted text from medical reports (blood tests, urine tests, X-rays, CT scans, MRI, ECG, pathology, prescriptions, discharge summaries, etc.).

Your task is to:
1. Classify the document type precisely (Blood, Urine, ECG, X-Ray, MRI, CT, Pathology, Prescription, Imaging, Discharge, General, Other).
2. Extract key medical findings, values, and observations.
3. For lab/test results: extract each parameter with its value, unit, reference range, and status (normal/high/low/critical).
4. Flag any abnormal or concerning values.
5. Create a concise clinical summary.

RULES:
- Extract ONLY what is present in the document. Do NOT fabricate values.
- If reference ranges are provided in the document, compare values against them.
- If reference ranges are NOT provided, mark as "reference range not provided".
- The summary should assist the clinician, NOT diagnose the patient.
- For imaging reports (X-ray, CT, MRI): extract the radiologist's observations and impression.
- For ECG: extract rhythm, rate, intervals, and interpretation.
- For prescriptions: extract medications, dosages, frequency, duration.
- For discharge summaries: extract diagnosis, treatment, follow-up instructions.

Return ONLY valid JSON matching this schema:
{
  "classified_type": "Blood|Urine|ECG|X-Ray|MRI|CT|Pathology|Prescription|Imaging|Discharge|General|Other",
  "summary": "Concise clinical summary of the document",
  "findings": [
    {"name": "parameter name", "value": "measured value", "unit": "unit if applicable", "reference_range": "normal range if provided", "status": "normal|high|low|critical|not_applicable"}
  ],
  "flagged_values": ["List of abnormal/flagged findings requiring attention"],
  "key_observations": ["Key clinical observations from the document"]
}"""


_TEXT_LAYER_MIN_CHARS = 40


def _preprocess_image(img: Any) -> Any:
    """Normalize an image for better OCR results (grayscale + contrast + upscale)."""
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(img)
    if img.mode not in ("L", "RGB"):
        try:
            img = img.convert("RGB")
        except Exception:
            pass
    if img.mode != "L":
        try:
            img = img.convert("L")
        except Exception:
            pass
    img = ImageOps.autocontrast(img)
    scale = 2.0
    img = img.resize(
        (int(img.width * scale), int(img.height * scale)), Image.LANCZOS
    )
    return img


def _extract_text_from_pdf_text_layer(file_path: str) -> str | None:
    """Extract the embedded text layer of a PDF using pypdf (no OCR)."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(file_path)
        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text and page_text.strip():
                text_parts.append(page_text.strip())
        return "\n\n".join(text_parts) if text_parts else None
    except Exception:
        return None


def _ocr_pdf_pages(file_path: str) -> str | None:
    """Rasterize a scanned PDF with PyMuPDF and OCR every page via tesseract."""
    try:
        import pytesseract
        from PIL import Image

        try:
            import pymupdf as fitz_module
        except ImportError:
            import fitz as fitz_module
    except ImportError:
        return None

    try:
        doc = fitz_module.open(file_path)
    except Exception:
        return None

    parts: list[str] = []
    try:
        for page in doc:
            pix = page.get_pixmap(matrix=fitz_module.Matrix(2, 2), alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            text = pytesseract.image_to_string(_preprocess_image(img))
            if text and text.strip():
                parts.append(text.strip())
    except Exception:
        return None
    finally:
        try:
            doc.close()
        except Exception:
            pass
    return "\n\n".join(parts) if parts else None


def _extract_text_from_pdf(file_path: str) -> str | None:
    """Extract PDF text, falling back to OCR for scanned/image-based PDFs."""
    text = _extract_text_from_pdf_text_layer(file_path)
    if text and len(text.strip()) >= _TEXT_LAYER_MIN_CHARS:
        return text.strip()
    ocr = _ocr_pdf_pages(file_path)
    if ocr:
        return ocr
    return text.strip() if text and text.strip() else None


def _extract_text_from_image(file_path: str) -> str | None:
    """Extract text from an image via pytesseract (OCR) when available."""
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return None
    try:
        text = pytesseract.image_to_string(_preprocess_image(Image.open(file_path)))
        if text and text.strip():
            return text.strip()
    except Exception:
        pass
    try:
        text = pytesseract.image_to_string(Image.open(file_path))
        return text.strip() if text and text.strip() else None
    except Exception:
        return None


def _extract_text_from_file(file_path: str) -> str | None:
    """Extract text from a file based on its extension."""
    ext = Path(file_path).suffix.lower()

    if ext == ".pdf":
        return _extract_text_from_pdf(file_path)
    elif ext in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"):
        return _extract_text_from_image(file_path)
    elif ext in (".txt", ".md"):
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read().strip() or None
        except Exception:
            return None
    return None


_EXTRACTABLE_EXTS = (
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp", ".txt", ".md",
)


def _extract_text_from_base64(file_base64: str, filename: str | None) -> str | None:
    """Decode an in-memory file (cloud uploads) to a temp file and extract text."""
    try:
        decoded = base64.b64decode(file_base64)
    except Exception:
        return None
    if not decoded:
        return None

    suffix = Path(filename or "").suffix.lower()
    candidate_suffixes = [suffix] if suffix in _EXTRACTABLE_EXTS else list(_EXTRACTABLE_EXTS)

    for ext in candidate_suffixes:
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(decoded)
                tmp_path = tmp.name
            text = _extract_text_from_file(tmp_path)
            if text:
                return text
        except Exception:
            pass
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
    return None


def _heuristic_classification(text: str, filename: str, title: str) -> str:
    """Heuristic document classification based on text content and filename."""
    combined = f"{text} {filename} {title}".lower()

    if any(kw in combined for kw in ["cbc", "hemoglobin", "wbc", "platelet", "blood count", "lipid", "cholesterol", "glucose", "hba1c", "thyroid", "tsh", "liver function", "kidney function", "creatinine", "urea"]):
        return "Blood"
    if any(kw in combined for kw in ["urine", "urinalysis", "urine routine", "microalbumin"]):
        return "Urine"
    if any(kw in combined for kw in ["ecg", "electrocardiogram", "qt interval", "pr interval", "qrs"]):
        return "ECG"
    if any(kw in combined for kw in ["x-ray", "xray", "radiograph", "chest x"]):
        return "X-Ray"
    if any(kw in combined for kw in ["mri", "magnetic resonance"]):
        return "MRI"
    if any(kw in combined for kw in ["ct scan", "computed tomography"]):
        return "CT"
    if any(kw in combined for kw in ["pathology", "histology", "biopsy", "cytology", "histopath"]):
        return "Pathology"
    if any(kw in combined for kw in ["prescription", "rx", "medication", "tablet", "capsule", "dosage"]):
        return "Prescription"
    if any(kw in combined for kw in ["discharge summary", "discharge", "admitted", "discharged"]):
        return "Discharge"
    if any(kw in combined for kw in ["imaging", "ultrasound", "sonography", "echo"]):
        return "Imaging"

    return "General"


def _heuristic_fallback(report_id: str, text: str | None, filename: str | None, title: str | None, report_type: str | None) -> dict[str, Any]:
    """Fallback extraction when AI is unavailable."""
    classified = report_type or _heuristic_classification(text or "", filename or "", title or "")

    if not text or not text.strip():
        return {
            "report_id": report_id,
            "classified_type": classified,
            "summary": f"{title or classified} report uploaded. No readable text could be extracted automatically — manual review required.",
            "findings": [],
            "flagged_values": [],
            "key_observations": ["Document appears scanned or unreadable by OCR. Manual review required."],
            "raw_text": None,
            "disclaimer": "This is an AI-generated summary and must be verified by a qualified clinician.",
            "status": "completed",
            "error": "No readable text found in the document (scanned or OCR failure). Manual review required.",
        }

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    findings = []
    flagged = []

    for line in lines[:50]:
        match = re.match(r"([A-Za-z\s]+)[:\s]+([\d.]+)\s*([a-zA-Z/%µµ]+)?(?:\s*\(([^)]+)\))?", line)
        if match:
            name = match.group(1).strip()
            value = match.group(2).strip()
            unit = match.group(3).strip() if match.group(3) else None
            ref_range = match.group(4).strip() if match.group(4) else None
            status = "normal"
            if ref_range:
                range_match = re.match(r"([\d.]+)\s*[-–]\s*([\d.]+)", ref_range)
                if range_match:
                    low, high = float(range_match.group(1)), float(range_match.group(2))
                    val = float(value) if value.replace(".", "").isdigit() else None
                    if val is not None:
                        if val < low:
                            status = "low"
                            flagged.append(f"{name}: {value} {unit or ''} (below normal)")
                        elif val > high:
                            status = "high"
                            flagged.append(f"{name}: {value} {unit or ''} (above normal)")
            findings.append({"name": name, "value": value, "unit": unit, "reference_range": ref_range, "status": status})

    summary = f"{title or classified} report. "
    if findings:
        summary += f"{len(findings)} parameters extracted."
    if flagged:
        summary += f" {len(flagged)} flagged values."
    summary += " Manual verification recommended."

    return {
        "report_id": report_id,
        "classified_type": classified,
        "summary": summary,
        "findings": findings,
        "flagged_values": flagged,
        "key_observations": [],
        "raw_text": text[:5000] if text else None,
        "disclaimer": "This is an AI-generated summary and must be verified by a qualified clinician.",
        "status": "completed",
        "error": None,
    }


@router.post("/extract-report")
async def extract_report(
    body: ReportExtractionRequest,
    _req: Request = Depends(verify_ai_key),
) -> dict[str, Any]:
    """Extract structured medical information from a report document.

    Supports PDF (text extraction via pypdf), images (OCR via pytesseract),
    and plain text files. Uses Ollama LLM for structured extraction with
    heuristic fallback.
    """
    report_id = body.report_id
    text = None

    # 0. Prefer in-memory file content (cloud uploads carry the buffer instead
    #    of a path on the API server).
    if text is None and body.file_base64:
        text = _extract_text_from_base64(body.file_base64, body.filename)

    # 1. Try to extract text from file
    if body.file_path:
        full_path = UPLOAD_DIR / body.file_path
        if full_path.exists():
            text = _extract_text_from_file(str(full_path))
        else:
            # Try absolute path
            if os.path.isabs(body.file_path) and os.path.exists(body.file_path):
                text = _extract_text_from_file(body.file_path)

    # 2. If no file_path, try to resolve from common patterns
    if text is None and body.filename:
        # Try to find file in uploads directory
        for candidate in UPLOAD_DIR.glob(f"*{body.filename}*"):
            if candidate.is_file():
                text = _extract_text_from_file(str(candidate))
                if text:
                    break

    # 3. Classify document type
    classified_type = body.report_type or _heuristic_classification(text or "", body.filename or "", body.title or "")

    # 4. Try Ollama LLM extraction if we have text
    if text and text.strip():
        provider = get_provider()
        try:
            user_message = f"Document type hint: {classified_type}\nTitle: {body.title or 'Unknown'}\n\nExtracted text:\n{text[:8000]}"
            response = provider.chat(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.1,
                max_tokens=2000,
            )
            response = (response or "").strip()
            if response:
                # Try to parse JSON from response
                json_match = re.search(r"\{.*\}", response, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                    return {
                        "report_id": report_id,
                        "classified_type": data.get("classified_type", classified_type),
                        "summary": data.get("summary", ""),
                        "findings": data.get("findings", []),
                        "flagged_values": data.get("flagged_values", []),
                        "key_observations": data.get("key_observations", []),
                        "raw_text": text[:5000],
                        "disclaimer": "This is an AI-generated summary and must be verified by a qualified clinician.",
                        "status": "completed",
                        "error": None,
                    }
        except Exception:
            pass

    # 5. Fallback to heuristic extraction
    return _heuristic_fallback(report_id, text, body.filename, body.title, body.report_type)
