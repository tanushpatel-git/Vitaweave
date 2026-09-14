from fastapi import APIRouter, Depends

from ...llm.provider import get_provider
from ..deps import verify_ai_key

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a medical documentation assistant. Take the patient's "
    "pre-consultation answers and produce ONE consolidated clinical summary "
    "in English.\n\n"
    "Use this exact section format. Write each heading on its own line, then "
    "write the content for that section on the following lines. Use plain "
    "short sentences or bullet text. No markdown '#' headers, no greetings, "
    "no preamble, no closing remarks.\n\n"
    "Chief complaint\n"
    "Onset and duration\n"
    "Symptoms\n"
    "Severity\n"
    "Medications, home remedies or self care\n"
    "Additional context\n"
    "Clinical snapshot\n"
    "\n"
    "Rules:\n"
    "- Use ONLY the information given. Never invent symptoms, diagnoses, or "
    "  medication doses.\n"
    "- If a section's information is missing or not mentioned, write "
    "  \"Not reported\" for that section.\n"
    "- Keep the language concise, clinical, and in English."
)


@router.post("/summarize-screening")
async def summarize_screening(
    body: dict,
    _req=Depends(verify_ai_key),
):
    answers = body.get("answers")
    department = str(body.get("department") or "").strip()

    if not isinstance(answers, list) or not answers:
        return {"error": "answers must be a non-empty array"}

    pairs = []
    for item in answers:
        question = str(item.get("question") or "").strip()
        value = item.get("answer")
        if value is None:
            continue
        rendered = ", ".join(str(x) for x in value) if isinstance(value, list) else str(value)
        if question and rendered.strip():
            pairs.append(f"- {question}: {rendered.strip()}")

    if not pairs:
        return {"summary": None, "error": "no answerable content"}

    user_message = (
        f"Department: {department or 'General consultation'}\n\n"
        f"Patient's answers:\n" + "\n".join(pairs)
    )

    provider = get_provider()
    try:
        narrative = provider.chat(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.1,
            max_tokens=700,
        )
    except Exception:  # pragma: no cover - provider/network errors
        return {"summary": None, "error": "summarization failed"}

    narrative = (narrative or "").strip()
    if not narrative:
        return {"summary": None, "error": "empty summary"}
    return {"summary": {"narrative": narrative}}