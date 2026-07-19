# Cybersecurity AI Assistant

A secure cybersecurity chat assistant built as a full-stack project with a React/Vite frontend, a FastAPI backend, PostgreSQL storage, vector search, and local AI models via Ollama.

## Project Overview

This project is designed to help users ask cybersecurity questions in a safer, more explainable way. The assistant is built to:

- authenticate users and store chat sessions
- validate and filter queries through guardrails
- retrieve relevant documents from a PDF knowledge base
- generate answers using a local AI model and a RAG pipeline
- store user chats and session history in PostgreSQL

The current implementation is focused on cyber-related queries and includes mechanisms for emergency detection, PII redaction, and domain classification.

## Architecture Summary

### Frontend
- React 19 + Vite
- Login / registration flow using JWT auth
- Chat interface for sending messages and viewing AI replies
- PDF upload support for adding new documents to the knowledge base

### Backend
- Python 3.11 + FastAPI
- PostgreSQL database for users, chat sessions, and messages
- Vec search using FAISS index built from uploaded PDFs
- Local AI model integration using Ollama with `langchain-ollama`
- Guardrail pipeline for cybersecurity domain filtering, emergency detection, and PII redaction

### Data and AI
- `backend/data/` stores uploaded PDF files
- `backend/faiss_index/` contains the serialized FAISS vector store
- `backend/create_db.py` reads PDF documents, chunks text, creates embeddings, and saves the FAISS index
- `backend/rag_engine.py` loads the FAISS index, performs retrieval, and generates answers

### Orchestration
- `docker-compose.yml` defines four services:
  - `db`: PostgreSQL database
  - `ollama`: local Ollama model server
  - `backend`: FastAPI application
  - `frontend`: Vite development server

## Folder Structure

```
cybersecurity-ai-assistant/
├── backend/
│   ├── auth.py                # JWT auth, password hashing, token verification
│   ├── create_db.py           # PDF ingestion, text chunking, FAISS index creation
│   ├── database.py            # SQLAlchemy models and DB session helper
│   ├── Dockerfile             # Backend container build instructions
│   ├── main.py                # FastAPI app, auth endpoints, chat endpoints, PDF upload endpoint
│   ├── memory.py              # in-memory session conversation store
│   ├── rag_engine.py          # retrieval-augmented generation pipeline
│   ├── requirements.txt       # Python dependencies list
│   ├── schemas.py             # request/response Pydantic models for chat
│   ├── schemas_auth.py        # request/response Pydantic models for auth
│   ├── security_guardrails.py # domain classification, PII redaction, emergency detection
│   ├── data/                  # stored PDFs and documents
│   ├── faiss_index/           # serialized FAISS index files
│   ├── temp_uploads/          # staging folder for PDF uploads
│   └── ...
├── frontend/
│   ├── Dockerfile             # Frontend container build instructions
│   ├── package.json           # npm dependencies and scripts
│   ├── README.md              # Vite starter README
│   ├── index.html             # web app HTML shell
│   ├── src/
│   │   ├── App.jsx            # main chat UI and session flow
│   │   ├── AuthContext.jsx    # auth state and token persistence
│   │   ├── Login.jsx          # login/register form
│   │   ├── main.jsx           # React entrypoint
│   │   ├── App.css            # UI styling for the chat app
│   │   └── index.css          # basic global styling
│   └── ...
├── docker-compose.yml         # orchestration of backend, frontend, db, ollama
├── .env                       # local environment variables
├── README.md                  # project documentation
└── hello.txt / other frontend.txt
```

## Backend Files and Responsibilities

### `backend/main.py`

This is the FastAPI application entrypoint. It does the following:

- creates database tables using SQLAlchemy on startup
- configures CORS for frontend requests
- mounts API endpoints for auth, chat, sessions, and PDF upload
- validates chat requests and runs guardrails before calling the RAG engine
- saves both user messages and AI responses to PostgreSQL
- supports creating new chat sessions and loading session history

Key endpoints:
- `POST /api/auth/register` — register a new user and return a JWT
- `POST /api/auth/login` — login and return a JWT
- `GET /api/auth/me` — return the authenticated user's ID and email
- `GET /api/status` — health/status endpoint
- `GET /api/chats` — fetch recent chat sessions for the current user
- `GET /api/chats/{session_id}` — load message history for a chat session
- `POST /api/chat` — send a question to the assistant
- `POST /api/upload` — upload a PDF document into the knowledge base

### `backend/auth.py`

Handles authentication utilities:

- password hashing and verification with `passlib`
- JWT generation with `python-jose`
- token validation via FastAPI dependency injection
- current user lookup from PostgreSQL

### `backend/database.py`

Defines all SQLAlchemy ORM models and database connection behavior:

- `User` — registered users with `id`, `email`, and `hashed_password`
- `ChatSession` — chat sessions scoped to a user
- `ChatMessage` — each user/AI message in a session
- `get_db()` — generator dependency for request-scoped DB sessions

### `backend/create_db.py`

Builds the offline vector store from PDF documents in `backend/data/`:

- loads all PDFs using `PyPDFDirectoryLoader`
- splits documents into chunks with `RecursiveCharacterTextSplitter`
- creates embeddings with `OllamaEmbeddings`
- stores the result as a local FAISS index in `backend/faiss_index/`

This file is used when adding new PDF documents via upload.

### `backend/memory.py`

Provides a lightweight in-memory conversation store:

- stores recent user/assistant turns per session ID
- preserves short chat history to support follow-up questions
- exposes context for guardrail evaluation and RAG question rewriting

### `backend/rag_engine.py`

Implements retrieval-augmented generation using the local FAISS vector store:

- loads FAISS index from `backend/faiss_index`
- configures a `ChatOllama` local model and prompt template
- defines `generate_ai_response()` to retrieve documents and produce answers
- formats retrieved document sources into citations for the frontend
- supports refreshing the index with `reload_vector_db()` after uploads

### `backend/security_guardrails.py`

Contains the guardrail policy pipeline that enforces safety and domain alignment:

- normalizes spelling and cybersecurity-specific typos
- detects emergency queries using regex
- redacts PII patterns like AADHAAR, PAN, and email addresses
- classifies queries using semantic embeddings into cybersecurity / out-of-bounds / emergency
- blocks off-topic questions and returns a safe rejection response
- validates uploaded PDF content before ingestion

### `backend/schemas.py`

Defines Pydantic request/response models for the chat API:

- `ChatRequest` — message text and optional session ID
- `ChatResponse` — returned AI reply, action state, PII details, domain scores, sources, and session ID

### `backend/schemas_auth.py`

Defines Pydantic models for authentication requests and responses:

- `UserCreate`
- `UserLogin`
- `TokenResponse`

### `backend/requirements.txt`

Contains all Python package dependencies required by the backend.

The project uses packages such as:
- `fastapi`, `uvicorn`, `SQLAlchemy`, `pydantic`
- `psycopg2-binary`, `passlib`, `python-jose`
- `faiss-cpu`, `langchain-ollama`, `langchain-community`
- `pypdf`, `numpy`, `scipy`, `python-multipart`

> Use `pip install -r backend/requirements.txt` to install them.

## Frontend Files and Responsibilities

### `frontend/src/App.jsx`

The main React application:

- manages authentication state, session list, and active chat session
- loads chat history for selected sessions
- renders the chat UI, message bubbles, and AI reasoning details
- sends user messages to the backend and displays AI replies
- uploads PDFs to the backend knowledge base
- exposes live backend status and session navigation

### `frontend/src/Login.jsx`

Provides login and registration UI:

- toggles between login and register modes
- submits credentials to backend auth endpoints
- stores the returned JWT via `AuthContext`

### `frontend/src/AuthContext.jsx`

Maintains auth state and token persistence:

- stores JWT in `localStorage`
- validates token by calling the backend session endpoint
- exposes `login()`, `logout()`, `token`, and `isAuthenticated`

### `frontend/src/main.jsx`

React entrypoint that renders the app inside `AuthProvider`.

### `frontend/src/App.css`

Contains the chat app styling, dark theme UI, button styles, and layout for the app.

### `frontend/src/index.css`

Contains global CSS variables and base browser resets.

### `frontend/package.json`

Defines the React app’s dependencies and scripts:

- `npm install`
- `npm run dev`
- `npm run build`

The frontend uses:
- `react`, `react-dom`, `vite`, `@vitejs/plugin-react`
- `lucide-react` for icons
- Tailwind-related packages in the template dependencies

## Docker and Deployment

### `docker-compose.yml`

Orchestrates the full stack using Docker:

- `db` runs PostgreSQL 16 and exposes port `5432`
- `ollama` runs the local Ollama model server on port `11434`
- `backend` runs the FastAPI service on port `8000`
- `frontend` runs the Vite app on port `5173`

The backend expects environment variables from `.env`:

- `POSTGRES_PASSWORD`
- `JWT_SECRET_KEY`

### Backend Dockerfile

- uses `python:3.11-slim`
- installs build dependencies and `libpq-dev`
- installs backend Python packages from `requirements.txt`
- exposes port `8000`
- starts the app with `uvicorn main:app --host 0.0.0.0 --port 8000`

### Frontend Dockerfile

- uses `node:20-slim`
- installs npm dependencies
- starts Vite on `0.0.0.0` port `5173`

## Environment and Setup

### Required tools

- Python 3.11
- Node 20+
- npm
- Docker and Docker Compose (optional, for containerized deployment)
- PostgreSQL if running without Docker, or Docker Compose will provide it

### Local setup steps

1. Clone the repo:
   ```bash
   git clone <your-repo-url>
   cd cybersecurity-ai-assistant
   ```
2. Create a `.env` file with:
   ```env
   POSTGRES_PASSWORD=your_postgres_password
   JWT_SECRET_KEY=your_jwt_secret
   ```
3. Backend setup:
   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. Frontend setup:
   ```bash
   cd ..\frontend
   npm install
   ```

### Running locally without Docker

1. Start PostgreSQL and ensure `DATABASE_URL` in `backend/database.py` is valid.
2. Start Ollama locally or configure `OLLAMA_BASE_URL` to a running server.
3. Build the FAISS index if you have PDFs in `backend/data/`:
   ```bash
   cd backend
   .\.venv\Scripts\activate
   python create_db.py
   ```
4. Start the backend:
   ```bash
   uvicorn main:app --reload
   ```
5. Start the frontend:
   ```bash
   cd ..\frontend
   npm run dev
   ```

### Running with Docker Compose

From the repository root:
```bash
docker compose up --build
```

This starts the database, Ollama, backend, and frontend together.

## How the chat flow works

1. User logs in or registers via the frontend.
2. The frontend stores the JWT and calls backend endpoints.
3. When a user sends a message, the backend:
   - validates the request
   - stores the user message in PostgreSQL
   - runs `security_guardrails.run_guardrails()`
   - if allowed, passes the text to `rag_engine.generate_ai_response()`
   - stores the AI reply in PostgreSQL
   - returns the answer and provenance to the frontend
4. The frontend renders the AI reply and optional reasoning details.

## PDF upload and knowledge base

- PDF files are uploaded from the frontend to `POST /api/upload`.
- The backend verifies the PDF text, checks whether it is cybersecurity-related, and if approved:
  - moves it into `backend/data/`
  - rebuilds the FAISS index with `create_db.py`
  - reloads the retrieval pipeline via `rag_engine.reload_vector_db()`
- The new documents become searchable by the RAG pipeline immediately.

## Guardrails and Safety

The backend includes multiple safety mechanisms:

- spelling normalization for cybersecurity terms
- off-topic blocking via semantic classification
- emergency query detection
- PII redaction for emails and sensitive Indian identity formats
- document domain classification before PDF ingestion

## Known limitations / notes

- The frontend currently assumes `http://127.0.0.1:8000/api` as the backend base URL.
- The project uses an in-memory session memory store in `backend/memory.py`; it is not persisted across server restarts.
- The backend database URL defaults to a PostgreSQL connection string in `backend/database.py` if `DATABASE_URL` is not provided.
- `backend/requirements.txt` is UTF-16 encoded and contains the Python dependency list used by the backend.

## Helpful commands

- `cd backend && .\.venv\Scripts\activate && uvicorn main:app --reload`
- `cd frontend && npm run dev`
- `docker compose up --build`
- `python backend/create_db.py`

## Contact

If you send this README to another developer, they should be able to understand:
- how the backend and frontend communicate
- how the AI retrieval pipeline works
- where data is stored
- what each Python file is responsible for
- how to run the system locally and with Docker

---

Thank you for using Cybersecurity AI Assistant.
