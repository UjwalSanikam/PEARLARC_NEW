from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import ChatRequest, ChatResponse
from security_guardrails import run_guardrails, GuardrailAction
from memory import memory_manager
from rag_engine import generate_ai_response

app = FastAPI(title="CyberGuard AI - Modular Edition")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Backend API Router successfully booted.")


@app.get("/api/status")
def status():
    return {"message": "The Modular Offline AI backend is locked, loaded, and listening!"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    conversation_context = memory_manager.get_conversation_context()
    result = run_guardrails(req.message, context=conversation_context)

    if result.action in (GuardrailAction.EMERGENCY, GuardrailAction.BLOCK_OOB):
        print(f"[DEBUG] Request HALTED by guardrails: {result.action}")
        return ChatResponse(
            reply=result.response,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
            sources=[],
        )

    try:
        print("[DEBUG] Executing RAG Pipeline via rag_engine.py...")
        ai_reply, source_docs = generate_ai_response(result.safe_message)
        print(f"[DEBUG] Response generated with {len(source_docs)} citations.")

        return ChatResponse(
            reply=ai_reply,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
            sources=source_docs,
        )
    except Exception as e:
        print(f"[DEBUG] Pipeline Crash Detected: {str(e)}")
        return ChatResponse(
            reply=f"Error generating response: {str(e)}",
            action="error",
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
            sources=[],
        )