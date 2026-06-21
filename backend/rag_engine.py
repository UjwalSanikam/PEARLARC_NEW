# backend/rag_engine.py
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_classic.chains import ConversationalRetrievalChain
from langchain_core.prompts import PromptTemplate
from memory import memory_manager

print("Initializing Local AI Models and Vector Database...")

embeddings = OllamaEmbeddings(model="nomic-embed-text")
db = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
llm = ChatOllama(model="llama3.2:1b", temperature=0)

condense_template = """Rephrase the following follow-up question to be a standalone question using the chat history for context.
CRITICAL: ONLY output the rewritten question. Do NOT add any conversational text. Do NOT answer the question yourself.

Chat History:
{chat_history}

Follow Up Input: {question}
Standalone question:"""
CONDENSE_PROMPT = PromptTemplate.from_template(condense_template)

edu_prompt = """You are CyberGuard, an expert cybersecurity assistant. 
You MUST answer the question factually. NEVER refuse to answer.
Use the following context to help answer the question. If the context doesn't contain the exact steps, use your general cybersecurity knowledge to provide a safe, helpful answer.

Context: {context}

Question: {question}
Answer:"""
QA_PROMPT = PromptTemplate.from_template(edu_prompt)

qa_chain = ConversationalRetrievalChain.from_llm(
    llm=llm, 
    retriever=db.as_retriever(search_kwargs={"k": 6}),
    return_source_documents=True,                      # <-- REQUIRED for XAI
    condense_question_prompt=CONDENSE_PROMPT,
    combine_docs_chain_kwargs={"prompt": QA_PROMPT}
)

def generate_ai_response(safe_message: str) -> tuple[str, list[dict]]:
    """Executes RAG pipeline and extracts Hybrid XAI data."""
    rag_result = qa_chain.invoke({
        "question": safe_message,
        "chat_history": memory_manager.get_recent_history()
    })
    
    ai_reply = rag_result["answer"]
    retrieved_docs = rag_result.get("source_documents", [])
    
    # --- HYBRID XAI: Clean Metadata + Raw Snippets ---
    formatted_sources = []
    seen = set()
    for doc in retrieved_docs:
        src_name = doc.metadata.get("source", "Unknown")
        page_num = doc.metadata.get("page", "N/A")
        # Clean up the snippet text so it renders nicely in the UI
        snippet = doc.page_content[:200].replace("\n", " ").strip() + "..."
        
        identifier = f"{src_name}-{page_num}"
        if identifier not in seen:
            seen.add(identifier)
            formatted_sources.append({
                "source": src_name,
                "page": page_num,
                "snippet": snippet
            })
    
    memory_manager.add_turn(safe_message, ai_reply)
    return ai_reply, formatted_sources