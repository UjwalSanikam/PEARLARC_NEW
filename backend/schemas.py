from pydantic import BaseModel
from typing import Optional

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None # Needed for database syncing

class ChatResponse(BaseModel):
    reply: str
    action: str
    pii_redacted: list[str] = []
    domain_scores: dict = {}
    sources: list[dict] = []  # <-- HYBRID: Accepts objects containing both metadata and snippets
    session_id: Optional[str] = None # Needed for database syncing