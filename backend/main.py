from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv

# LangChain and AI Imports
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_classic.chains import RetrievalQA

# 1. Load the API keys from your .env file
load_dotenv()

app = FastAPI()

# 2. CORS Middleware (Allows your React frontend to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Booting up the AI brain...")

# 3. Match the embedding model name to gemini-embedding-001
embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001")

# Load the FAISS Database using our optimized cloud embedding architecture
db = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)

# 4. Set up the Google Gemini LLM and the RAG Chain
# We use temperature=0 so the AI gives factual, non-creative answers
llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash", temperature=0)
qa_chain = RetrievalQA.from_chain_type(
    llm=llm, 
    chain_type="stuff", 
    retriever=db.as_retriever(search_kwargs={"k": 2}) # Retrieves top 2 most relevant chunks
)

# 5. Define what the incoming request from React will look like
class ChatRequest(BaseModel):
    message: str

# --- ENDPOINTS ---

# The original Ping endpoint (Keep this so your teammate's UI still shows "Connected!")
@app.get("/api/status")
def status():
    return {"message": "The Cybersecurity AI backend is locked, loaded, and listening!"}

# The new Chat endpoint!
@app.post("/api/chat")
def chat_with_ai(request: ChatRequest):
    try:
        # Ask the RAG pipeline the user's question
        result = qa_chain.invoke(request.message)
        return {"reply": result["result"]}
    except Exception as e:
        return {"reply": f"Error generating response: {str(e)}"}