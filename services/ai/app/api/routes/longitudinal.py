from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ...llm.provider import get_provider
from ..deps import verify_ai_key

router = APIRouter()

SYSTEM_PROMPT = """You are a clinical data reviewer. You are given a patient's precomputed lab trends (percentage changes and readings over time). The numbers are already calculated by a trend engine — never recompute, correct, or infer values that are not listed.

Write ONE concise narrative (4-7 sentences) that a doctor can skim before opening individual reports:
- Open by stating the number of reports and the observation window (first → last date).
- Summarise each parameter whose trajectory is clinically notable (magnitude and direction), citing the reported values/dates exactly as supplied.
- Mention parameters that stayed stable in one short sentence.
- Mention flagged readings if any are flagged ("flagged" field true) without inventing a diagnosis.
- Never diagnose, never recommend treatment, never guess missing values.
- NEVER mention a parameter, value, or date that is not explicitly listed in the supplied data — if the list is short, write about the listed parameters only.
- Refer to the patient by name or "the patient".
- Plain prose, no headings, no bullets, no markdown.
"""


class TrendReading(BaseModel):
    value: float
    date: str


class TrendParameter(BaseModel):
    name: str
    unit: str | None = None
    first_value: float
    last_value: float
    first_date: str
    last_date: str
    overall_change_pct: float | None = None
    flagged: bool = False
    readings: list[TrendReading] = []


class LongitudinalSummaryRequest(BaseModel):
    patient_name: str | None = None
    report_count: int = 0
    first_report_date: str | None = None
    last_report_date: str | None = None
    parameters: list[TrendParameter] = []


def _fmt(value: float, unit: str | None) -> str:
    if value is None:
        return ""
    number = str(int(value)) if float(value).is_integer() else f"{value:.2f}".rstrip("0").rstrip(".")
    return f"{number}{(' ' + unit) if unit else ''}"


@router.post("/longitudinal-summary")
async def longitudinal_summary(
    body: LongitudinalSummaryRequest,
    _req=Depends(verify_ai_key),
):
    if not body.parameters:
        raise HTTPException(status_code=422, detail="No tracked parameters provided")

    lines = []
    for p in body.parameters:
        readings = " → ".join(
            f"{_fmt(r.value, p.unit)} ({r.date[:10]})" for r in p.readings
        )
        flag = " [FLAGGED]" if p.flagged else ""
        change = (
            f"overall change {p.overall_change_pct:+.1f}%"
            if p.overall_change_pct is not None
            else "overall change not computable"
        )
        lines.append(
            f"- {p.name}: {readings}{flag} | {change}"
        )

    user_message = (
        f"Patient: {body.patient_name or 'Unknown'}\n"
        f"Reports analysed: {body.report_count} | Window: {body.first_report_date or 'n/a'} → {body.last_report_date or 'n/a'}\n"
        "Tracked parameters:\n" + "\n".join(lines)
    )

    provider = get_provider()
    try:
        response = provider.chat(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.2,
            max_tokens=1200,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM unavailable: {exc}")

    narrative = (response or "").strip()
    if not narrative:
        raise HTTPException(status_code=502, detail="LLM returned an empty narrative")

    return {"summary": narrative, "source": "longitudinal-review"}