from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from typing import List

from schemas import ChatRequest, ChatResponse
from security_guardrails import run_guardrails, GuardrailAction
from memory import memory_manager
from rag_engine import generate_ai_response

# --- NEW: Import Database Components ---
from database import engine, Base, get_db, ChatSession, ChatMessage

from fastapi import UploadFile, File
import shutil
import os
from create_db import build_database

# --- NEW: Generate Tables on Startup ---
print("Generating database tables...")
Base.metadata.create_all(bind=engine)

app = FastAPI(title="CyberGuard AI - Modular Edition")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # <-- Change this line!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Backend API Router successfully booted.")


@app.get("/api/status")
def status():
    return {"message": "The Modular Offline AI backend is locked, loaded, and listening!"}

# --- NEW ENDPOINT: Get all chat sessions for the frontend sidebar ---
@app.get("/api/chats")
def get_all_chats(db: Session = Depends(get_db)):
    chats = db.query(ChatSession).order_by(ChatSession.created_at.desc()).all()
    return [{"id": chat.id, "title": chat.title, "created_at": chat.created_at} for chat in chats]

# --- NEW ENDPOINT: Get the message history for a specific chat ---
@app.get("/api/chats/{session_id}")
def get_chat_history(session_id: str, db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    return [{"role": msg.role, "content": msg.content} for msg in messages]


@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(req: ChatRequest, db: Session = Depends(get_db)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # 1. Manage the Chat Session
    session_id = getattr(req, 'session_id', None)
    
    if not session_id:
        # If no session exists, create a new one in the database
        new_session = ChatSession(title=req.message[:40] + "...") 
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        session_id = new_session.id

    # 2. Save the User's Message to the Database
    user_msg = ChatMessage(session_id=session_id, role="user", content=req.message)
    db.add(user_msg)
    db.commit()

    # 3. Run Guardrails
    conversation_context = memory_manager.get_conversation_context()
    result = run_guardrails(req.message, context=conversation_context)

    if result.action in (GuardrailAction.EMERGENCY, GuardrailAction.BLOCK_OOB):
        print(f"[DEBUG] Request HALTED by guardrails: {result.action}")
        
        # Save the AI's rejection message
        ai_msg = ChatMessage(session_id=session_id, role="ai", content=result.response)
        db.add(ai_msg)
        db.commit()

        return ChatResponse(
            reply=result.response,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
            sources=[],
            session_id=session_id # Send ID back so frontend knows where it is
        )

    # 4. Generate AI Response
    try:
        print("[DEBUG] Executing RAG Pipeline via rag_engine.py...")
        ai_reply, source_docs = generate_ai_response(result.safe_message)
        print(f"[DEBUG] Response generated with {len(source_docs)} citations.")

        # Save the AI's successful reply to the database
        ai_msg = ChatMessage(session_id=session_id, role="ai", content=ai_reply)
        db.add(ai_msg)
        db.commit()

        return ChatResponse(
            reply=ai_reply,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
            sources=source_docs,
            session_id=session_id # Send ID back to frontend
        )
    except Exception as e:
        print(f"[DEBUG] Pipeline Crash Detected: {str(e)}")
        error_text = f"Error generating response: {str(e)}"
        
        # Save the error to the database so it shows up on refresh
        ai_msg = ChatMessage(session_id=session_id, role="ai", content=error_text)
        db.add(ai_msg)
        db.commit()

        return ChatResponse(
            reply=error_text,
            action="error",
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
            sources=[],
            session_id=session_id
        )