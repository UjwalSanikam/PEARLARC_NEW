from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os

# --- NEW: Local LangChain and Ollama Imports ---
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama
from langchain_ollama import OllamaEmbeddings
from langchain_classic.chains import RetrievalQA

# --- Phase 3 Integration: Import the security guardrails layer ---
from security_guardrails import run_guardrails, GuardrailAction

app = FastAPI(title="CyberGuard AI - Offline Edition")

# CORS Middleware (Allows your React frontend to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Booting up the Offline AI brain...")

# 1. Use the Local Nomic Embedding Model
embeddings = OllamaEmbeddings(model="nomic-embed-text")

# Load the FAISS Database using the local embedding architecture
db = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)

# 2. Set up the Local Ollama LLM (Phi-3) and the RAG Chain
llm = ChatOllama(model="llama3.2:1b", temperature=0)
qa_chain = RetrievalQA.from_chain_type(
    llm=llm, 
    chain_type="stuff", 
    retriever=db.as_retriever(search_kwargs={"k": 6})
)

# 3. Define incoming and outgoing data structures
class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str
    action: str
    pii_redacted: list[str] = []
    domain_scores: dict = {}

# --- ENDPOINTS ---

@app.get("/api/status")
def status():
    return {"message": "The Offline Cybersecurity AI backend is locked, loaded, and listening!"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # --- Phase 3: Run Guardrails First (The Interceptor Layer) ---
    result = run_guardrails(req.message)

    # Intercept EMERGENCY and BLOCK_OOB (Never reaches the RAG AI)
    if result.action in (GuardrailAction.EMERGENCY, GuardrailAction.BLOCK_OOB):
        return ChatResponse(
            reply=result.response,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
        )

    # --- Phase 2: RAG Pipeline (Runs only if the message passes security checks) ---
    try:
        # We pass the safe, redacted message to the RAG chain
        rag_result = qa_chain.invoke(result.safe_message)
        
        return ChatResponse(
            reply=rag_result["result"],
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
        )
    except Exception as e:
        return ChatResponse(
            reply=f"Error generating response: {str(e)}",
            action="error",
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
        )