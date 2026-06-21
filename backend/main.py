from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# --- Modular Imports ---
from schemas import ChatRequest, ChatResponse          # single source of truth
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


# --- ENDPOINTS ---

@app.get("/api/status")
def status():
    return {"message": "The Modular Offline AI backend is locked, loaded, and listening!"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # FIX: Use get_conversation_context() instead of get_user_context().
    # This passes both recent user messages AND the AI's replies to the guardrail
    # classifier, which is what makes follow-up questions like "how do I install
    # it on my phone?" resolve correctly — the AI's previous answer about
    # authenticator apps contains the cybersecurity vocabulary that tips the
    # semantic classifier back into the right domain.
    conversation_context = memory_manager.get_conversation_context()

    # Run guardrails with the richer context
    result = run_guardrails(req.message, context=conversation_context)

    # Intercept hard EMERGENCIES and Out-Of-Bounds Topics before hitting the RAG
    if result.action in (GuardrailAction.EMERGENCY, GuardrailAction.BLOCK_OOB):
        print(f"[DEBUG] Request HALTED by guardrails: {result.action}")
        return ChatResponse(
            reply=result.response,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
        )

    # Generate AI Response via RAG pipeline
# 4. Generate AI Response via RAG pipeline
# Generate AI Response via RAG pipeline
    try:
        print("[DEBUG] Executing RAG Pipeline via rag_engine.py...")
        
        # --- HYBRID UPDATE: Unpack the tuple ---
        ai_reply, source_docs = generate_ai_response(result.safe_message)
        print(f"[DEBUG] Response successfully generated with {len(source_docs)} citations.")

        return ChatResponse(
            reply=ai_reply,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
            sources=source_docs # <-- Pass hybrid sources to frontend
        )
    except Exception as e:
        print(f"[DEBUG] Pipeline Crash Detected: {str(e)}")
        return ChatResponse(
            reply=f"Error generating response: {str(e)}",
            action="error",
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
            sources=[]
        )