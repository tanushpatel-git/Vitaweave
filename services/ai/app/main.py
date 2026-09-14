from fastapi import FastAPI

from .api.routes.query import router as query_router
from .api.routes.ingest import router as ingest_router
from .api.routes.extraction import router as extraction_router
from .api.routes.transcription import router as transcription_router
from .api.routes.translation import router as translation_router
from .api.routes.summary import router as summary_router
from .api.routes.medical_document import router as medical_document_router
from .api.routes.longitudinal import router as longitudinal_router
from .api.routes.conversation import router as conversation_router
from .config import settings
from .db import get_collection, close_client


def ensure_indexes():
    get_collection("documentchunks").create_index([("doctor_id", 1), ("document_id", 1)])
    get_collection("documentchunks").create_index([("doctor_id", 1)])


app = FastAPI(
    title="MedChat AI Service",
    description="RAG + LangChain inference service for the medical chatbot",
    version="0.1.0",
    on_startup=[ensure_indexes],
)


@app.on_event("shutdown")
async def shutdown():
    close_client()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai", "model": settings.ollama_model}


app.include_router(query_router, prefix="/api", tags=["query"])
app.include_router(ingest_router, prefix="/api", tags=["ingest"])
app.include_router(extraction_router, prefix="/api", tags=["extraction"])
app.include_router(transcription_router, prefix="/api", tags=["transcription"])
app.include_router(translation_router, prefix="/api", tags=["translation"])
app.include_router(summary_router, prefix="/api", tags=["summary"])
app.include_router(medical_document_router, prefix="/api", tags=["medical-document"])
app.include_router(longitudinal_router, prefix="/api", tags=["longitudinal"])
app.include_router(conversation_router, prefix="/api", tags=["conversation"])