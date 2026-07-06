# backend/rag_engine.py
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_classic.chains import ConversationalRetrievalChain
from langchain_core.prompts import PromptTemplate
from memory import memory_store

print("Initializing Local AI Models and Vector Database...")

import os
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=OLLAMA_BASE_URL)
llm = ChatOllama(model="phi3", temperature=0, base_url=OLLAMA_BASE_URL)

edu_prompt = """You are CyberGuard, an expert cybersecurity assistant. 
You MUST answer the question factually. NEVER refuse to answer.
Use the following context to help answer the question. If the context doesn't contain the exact steps, use your general cybersecurity knowledge to provide a safe, helpful answer.

Context: {context}

Question: {question}
Answer:"""
QA_PROMPT = PromptTemplate.from_template(edu_prompt)

# FIX: Removed condense_question_prompt — we now manually pre-expand follow-up
# questions in _build_standalone_question() before they reach the chain.
# Passing chat_history=[] means the chain always goes straight to retrieval +
# answering, completely bypassing the condensation LLM call.
# Why: llama3.2:1b is too small to reliably condense questions — it occasionally
# responds conversationally ("can you provide more context?") instead of
# outputting a plain rephrased question, which then hits the retriever as
# a useless query and produces a vague answer.
def _load_qa_chain():
    vector_db = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
    return ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=vector_db.as_retriever(search_kwargs={"k": 6}),
        return_source_documents=True,
        combine_docs_chain_kwargs={"prompt": QA_PROMPT}
    )

qa_chain = _load_qa_chain()

def reload_vector_db():
    """Call this after new PDFs are added so the chatbot can see them immediately, without restarting the server."""
    global qa_chain
    print("[DEBUG] Reloading FAISS vector DB into memory...")
    qa_chain = _load_qa_chain()
    print("[DEBUG] Vector DB reload complete.")

def _build_standalone_question(safe_message: str, history: list) -> str:
    """
    Manually expands a follow-up question into a self-contained query by
    prepending recent conversation topics.

    Example:
        history  : [("what is 2FA?", "2FA stands for...")]
        message  : "how to download it on my phone?"
        result   : 'In the context of our previous discussion about "what is 2FA?",
                    how to download it on my phone?'

    This replaces the LLM condensation step entirely, making follow-up
    resolution deterministic and immune to small-model failures.
    """
    if not history:
        return safe_message

    recent_turns = history[-2:]
    prior_topics = " and ".join(f'"{user_msg}"' for user_msg, _ in recent_turns)
    return f"In the context of our previous discussion about {prior_topics}, {safe_message}"




def generate_ai_response(safe_message: str, session_id: str) -> tuple[str, list[dict]]:
    session_memory = memory_store.get(session_id)
    history = session_memory.get_recent_history()

    standalone_question = _build_standalone_question(safe_message, history)
    print(f"[DEBUG] Standalone question sent to RAG: {standalone_question}")

    rag_result = qa_chain.invoke({
        "question": standalone_question,
        "chat_history": [],
    })

    ai_reply = rag_result["answer"]
    retrieved_docs = rag_result.get("source_documents", [])

    formatted_sources = []
    seen = set()
    for doc in retrieved_docs:
        src_name = doc.metadata.get("source", "Unknown")
        page_num = doc.metadata.get("page", "N/A")
        snippet = doc.page_content[:200].replace("\n", " ").strip() + "..."
        identifier = f"{src_name}-{page_num}"
        if identifier not in seen:
            seen.add(identifier)
            formatted_sources.append({"source": src_name, "page": page_num, "snippet": snippet})

    session_memory.add_turn(safe_message, ai_reply)
    return ai_reply, formatted_sources