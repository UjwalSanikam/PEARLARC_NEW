from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from typing import List

import base64
from rag_engine import generate_ai_response_with_image
from fastapi import Form
from fastapi.staticfiles import StaticFiles

from schemas import ChatRequest, ChatResponse
from security_guardrails import run_guardrails, GuardrailAction
from memory import memory_store   # replace the old `from memory import memory_manager`
from rag_engine import generate_ai_response

# --- NEW: Import Database Components ---
from database import engine, Base, get_db, ChatSession, ChatMessage

from fastapi import UploadFile, File
import shutil
import os
from create_db import build_database

from database import engine, Base, get_db, ChatSession, ChatMessage, User
from auth import get_current_user

from langchain_community.document_loaders import PyPDFLoader
from security_guardrails import classify_document_domain
from rag_engine import reload_vector_db

from rag_engine import caption_image


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

os.makedirs("data/chat_images", exist_ok=True)
app.mount("/images", StaticFiles(directory="data/chat_images"), name="chat_images")

print("Backend API Router successfully booted.")

from auth import hash_password, verify_password, create_access_token, get_current_user
from schemas_auth import UserCreate, UserLogin, TokenResponse
from database import User

@app.post("/api/auth/register", response_model=TokenResponse)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)




@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email}


@app.get("/api/status")
def status():
    return {"message": "The Modular Offline AI backend is locked, loaded, and listening!"}

# --- NEW ENDPOINT: Get all chat sessions for the frontend sidebar ---
@app.get("/api/chats")
def get_all_chats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chats = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc())
        .all()
    )
    return [{"id": chat.id, "title": chat.title, "created_at": chat.created_at} for chat in chats]

# --- NEW ENDPOINT: Get the message history for a specific chat ---
@app.get("/api/chats/{session_id}")
def get_chat_history(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    return [
        {
            "role": msg.role,
            "content": msg.content,
            "image_url": f"/images/{os.path.basename(msg.image_path)}" if msg.image_path else None,
        }
        for msg in messages
    ]


@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(req: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    session_id = getattr(req, 'session_id', None)

    if not session_id:
        new_session = ChatSession(title=req.message[:40] + "...", user_id=current_user.id)
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        session_id = new_session.id
    else:
        # Make sure this session actually belongs to the caller
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found.")

    # ... rest of the function stays exactly the same

    # 2. Save the User's Message to the Database
    user_msg = ChatMessage(session_id=session_id, role="user", content=req.message)
    db.add(user_msg)
    db.commit()

    # 3. Run Guardrails
    conversation_context = memory_store.get(session_id).get_conversation_context()
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
        ai_reply, source_docs = generate_ai_response(result.safe_message, session_id)
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

@app.post("/api/chat/image", response_model=ChatResponse)
async def chat_with_image(
    message: str = Form(""),
    session_id: str = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_types = {"image/png", "image/jpeg", "image/webp"}
    if image.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG, or WEBP images are supported.")

    contents = await image.read()
    max_size = 10 * 1024 * 1024  # 10MB
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB).")

    # 1. Resolve or create the chat session (same pattern as /api/chat)
    if not session_id:
        title = message[:40] + "..." if message.strip() else "Image analysis"
        new_session = ChatSession(title=title, user_id=current_user.id)
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        session_id = new_session.id
    else:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found.")

    # 2. Save the image to disk
    os.makedirs("data/chat_images", exist_ok=True)
    safe_filename = f"{session_id}_{image.filename}"
    saved_path = os.path.join("data/chat_images", safe_filename)
    with open(saved_path, "wb") as f:
        f.write(contents)

    ## 3. Save the user's message (with image_path) to the database
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=message if message.strip() else "[Image uploaded]",
        image_path=saved_path,
    )
    db.add(user_msg)
    db.commit()

    b64_image = base64.b64encode(contents).decode()

    # 4. Guardrail check — caption the image, then run it through the
    #    same emergency/PII/domain pipeline used for text messages
    try:
        caption = caption_image(b64_image)
        print(f"[DEBUG] Image caption for guardrails: {caption}")
    except Exception as e:
        print(f"[DEBUG] Captioning failed, blocking image as a precaution: {str(e)}")
        error_text = "Could not safely process this image. Please try again."
        ai_msg = ChatMessage(session_id=session_id, role="ai", content=error_text)
        db.add(ai_msg)
        db.commit()
        return ChatResponse(
            reply=error_text, action="error", pii_redacted=[], domain_scores={},
            sources=[], session_id=session_id,
        )

    conversation_context = memory_store.get(session_id).get_conversation_context()
    guard_result = run_guardrails(caption, context=conversation_context)

    if guard_result.action in (GuardrailAction.EMERGENCY, GuardrailAction.BLOCK_OOB):
        print(f"[DEBUG] Image request HALTED by guardrails: {guard_result.action}")
        ai_msg = ChatMessage(session_id=session_id, role="ai", content=guard_result.response)
        db.add(ai_msg)
        db.commit()
        return ChatResponse(
            reply=guard_result.response,
            action=guard_result.action.value,
            pii_redacted=guard_result.pii_found,
            domain_scores=guard_result.classifier_score,
            sources=[],
            session_id=session_id,
        )

    # 5. Passed guardrails — run the full vision analysis
    try:
        ai_reply, sources = generate_ai_response_with_image(b64_image, message, session_id)

        ai_msg = ChatMessage(session_id=session_id, role="ai", content=ai_reply)
        db.add(ai_msg)
        db.commit()

        return ChatResponse(
            reply=ai_reply,
            action="allow",
            pii_redacted=[],
            domain_scores={},
            sources=sources,
            session_id=session_id,
        )
    except Exception as e:
        print(f"[DEBUG] Image pipeline crash: {str(e)}")
        error_text = f"Error analyzing image: {str(e)}"

        ai_msg = ChatMessage(session_id=session_id, role="ai", content=error_text)
        db.add(ai_msg)
        db.commit()

        return ChatResponse(
            reply=error_text,
            action="error",
            pii_redacted=[],
            domain_scores={},
            sources=[],
            session_id=session_id,
        )

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    os.makedirs("data", exist_ok=True)
    os.makedirs("temp_uploads", exist_ok=True)
    temp_path = os.path.join("temp_uploads", file.filename)

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 1. Extract text BEFORE accepting it into the knowledge base
        try:
            pages = PyPDFLoader(temp_path).load()
        except Exception as e:
            os.remove(temp_path)
            raise HTTPException(status_code=400, detail=f"Could not read PDF: {str(e)}")

        sample_text = " ".join(p.page_content for p in pages[:5])
        if not sample_text.strip():
            os.remove(temp_path)
            raise HTTPException(
                status_code=400,
                detail="This PDF has no extractable text (it may be a scanned image)."
            )

        # 2. Check the domain
        domain_result = classify_document_domain(sample_text)
        print(f"[DEBUG] PDF domain classification: {domain_result}")

        if not domain_result["is_cybersecurity"]:
            os.remove(temp_path)
            raise HTTPException(
                status_code=400,
                detail="This document doesn't appear to be cybersecurity-related. Please upload a relevant PDF."
            )

        # 3. Passed — move into the permanent knowledge base and rebuild the index
        final_path = os.path.join("data", file.filename)
        shutil.move(temp_path, final_path)

        build_database()
        reload_vector_db()

        return {
            "message": f"'{file.filename}' passed the cybersecurity check and was added to the knowledge base.",
            "domain_check": domain_result,
        }

    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        print(f"[ERROR] Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")