# Cybersecurity AI Assistant

A specialized, reliable AI advisor for online security and fraud prevention. Built with a focus on explainable AI and robust security controls.

## ?? Project Overview
This project acts as a secure, factual assistant trained on cybersecurity guidelines, policies, and fraud prevention FAQs. Unlike generic chatbots that might make up facts (hallucinate), this assistant is tightly constrained to only give factual, safe advice about cyber threats.

## ??? Architecture
- Frontend: React.js & Vite
- Backend: Python 3.11 & FastAPI
- AI/LLM: Google Gemini (via LangChain)
- Database: FAISS (Vector Database)
- Orchestration: LangChain

## ??? Phases Completed
- Phase 1 (MVP): Successfully established communication between the React frontend and FastAPI backend.
- Phase 2 (RAG Pipeline): Implemented "The Brains" of the assistant:
    - Built a vector database using FAISS and Hugging Face embeddings.
    - Configured a RAG pipeline that retrieves relevant context from a cybersecurity FAQ knowledge base before generating answers.
    - Integrated Google Gemini AI to provide accurate, context-aware responses.

## ?? Local Setup
1. Clone the repository: git clone <your-repo-url>
2. Backend Setup:
   - Navigate to backend/: cd backend
   - Activate virtual environment: venv\Scripts\activate
   - Install dependencies: pip install fastapi uvicorn langchain langchain-google-genai faiss-cpu
3. Frontend Setup:
   - Navigate to frontend/: cd frontend
   - Install dependencies: npm install

## ?? Running the App
- Start Backend: uvicorn main:app --reload (in the backend/ folder)
- Start Frontend: npm run dev (in the frontend/ folder)

## ?? Security & Guardrails (In Progress)
- Domain Classifier: Logic is being implemented to ensure the AI only handles cybersecurity queries.
- PII Detection: Redaction layer is planned for future phases to protect user data.
