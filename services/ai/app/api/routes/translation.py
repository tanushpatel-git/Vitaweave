import re

from fastapi import APIRouter, Depends

from ...llm.provider import get_provider
from ..deps import verify_ai_key

router = APIRouter()

TRANSLATE_SYSTEM = (
    "You are a strict medical translation engine. Translate the patient's "
    "spoken or typed free-text answers into clear, natural, professional "
    "English. Preserve the medical meaning and details exactly; do not add, "
    "remove, or interpret beyond the source text. Reply with ONLY the "
    "translated text. Do not wrap it in quotes and do not add commentary.\n\n"
    "You MUST always provide a translation. Never refuse, never apologize, "
    "and never say you cannot translate something. Even if the input seems "
    "incomplete or mixed-script, translate the meaningful parts into English "
    "as best you can. If the input is meaningless noise, reply with the text "
    "repeated verbatim."
)

REFUSAL_PATTERNS = (
    re.compile(r"can'?t translate", re.IGNORECASE),
    re.compile(r"cannot translate", re.IGNORECASE),
    re.compile(r"unable to translate", re.IGNORECASE),
    re.compile(r"i'?m sorry", re.IGNORECASE),
    re.compile(r"i am sorry", re.IGNORECASE),
    re.compile(r"as an (ai )?(language model)?", re.IGNORECASE),
)


def looks_like_refusal(text: str) -> bool:
    return any(pattern.search(text) for pattern in REFUSAL_PATTERNS)


@router.post("/translate")
async def translate(
    body: dict,
    _req=Depends(verify_ai_key),
):
    texts = body.get("texts") or []
    target = str(body.get("target_language") or "en")

    if not isinstance(texts, list):
        return {"error": "texts must be an array"}

    provider = get_provider()
    translations = []
    for text in texts:
        value = str(text or "").strip()
        if not value:
            translations.append("")
            continue
        try:
            result = provider.chat(
                messages=[
                    {"role": "system", "content": TRANSLATE_SYSTEM},
                    {"role": "user", "content": f"Translate into {target}:\n{value}"},
                ],
                temperature=0.0,
                max_tokens=512,
            )
            cleaned = (result or "").strip().strip('"').strip()
            if not cleaned or looks_like_refusal(cleaned):
                cleaned = ""
            translations.append(cleaned or None)
        except Exception as exc:  # pragma: no cover - network/model errors
            translations.append(None)

    return {"translations": translations}