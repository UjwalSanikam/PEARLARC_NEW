# this file has the input/output format so we ever wanna change the input output format we change it here 
from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str
    action: str
    pii_redacted: list[str] = []
    domain_scores: dict = {}