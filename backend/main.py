from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv

# LangChain and AI Imports
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_classic.chains import RetrievalQA

# --- NEW: Import the security guardrails ---
from security_guardrails import run_guardrails, GuardrailAction

# 1. Load the API keys from your .env file
load_dotenv()
print("Did I find the API key?", os.getenv("GOOGLE_API_KEY") is not None)

app = FastAPI(title="CyberGuard AI")

# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Booting up the AI brain...")

# 3. Load the FAISS Database
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash", 
    temperature=0, 
    api_key=os.getenv("GOOGLE_API_KEY")
)
# 4. Set up the LLM and the RAG Chain
llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash", temperature=0)
qa_chain = RetrievalQA.from_chain_type(
    llm=llm, 
    chain_type="stuff", 
    retriever=db.as_retriever(search_kwargs={"k": 2})
)

# 5. Define incoming and outgoing data structures
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
    return {"message": "The Cybersecurity AI backend is locked, loaded, and listening!"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # --- Phase 3: Run Guardrails First ---
    result = run_guardrails(req.message)

    # Intercept EMERGENCY and BLOCK_OOB (Never reaches the RAG AI)
    if result.action in (GuardrailAction.EMERGENCY, GuardrailAction.BLOCK_OOB):
        return ChatResponse(
            reply=result.response,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
        )

    # --- Phase 2: RAG Pipeline ---
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