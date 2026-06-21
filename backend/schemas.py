# backend/schemas.py
from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str
    action: str
    pii_redacted: list[str] = []
    domain_scores: dict = {}
    sources: list[dict] = []  # <-- HYBRID: Accepts objects containing both metadata and snippets