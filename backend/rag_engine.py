# backend/rag_engine.py
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_classic.chains import ConversationalRetrievalChain
from langchain_core.prompts import PromptTemplate
from memory import memory_manager

print("Initializing Local AI Models and Vector Database...")

# 1. Initialize Models
embeddings = OllamaEmbeddings(model="nomic-embed-text")
db = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
llm = ChatOllama(model="llama3.2:1b", temperature=0)

# 2. Strict Condense Prompt (Stops the 1B model from getting confused during the memory rewrite step)
condense_template = """Rephrase the following follow-up question to be a standalone question using the chat history for context.
CRITICAL: ONLY output the rewritten question. Do NOT add any conversational text. Do NOT answer the question yourself.

Chat History:
{chat_history}

Follow Up Input: {question}
Standalone question:"""
CONDENSE_PROMPT = PromptTemplate.from_template(condense_template)

# 3. Upgraded QA Prompt (Allows the AI to use general knowledge if the PDF doesn't have an exact download guide)
edu_prompt = """You are CyberGuard, an expert cybersecurity assistant. 
You MUST answer the question factually. NEVER refuse to answer.
Use the following context to help answer the question. If the context doesn't contain the exact steps, use your general cybersecurity knowledge to provide a safe, helpful answer.

Context: {context}

Question: {question}
Answer:"""
QA_PROMPT = PromptTemplate.from_template(edu_prompt)

# 4. Setup Chain with Both Prompts Injected
qa_chain = ConversationalRetrievalChain.from_llm(
    llm=llm, 
    retriever=db.as_retriever(search_kwargs={"k": 6}),
    condense_question_prompt=CONDENSE_PROMPT,          # <-- Injected custom memory prompt
    combine_docs_chain_kwargs={"prompt": QA_PROMPT}    # <-- Injected custom QA prompt
)

def generate_ai_response(safe_message: str) -> str:
    """Executes the RAG pipeline using the new memory manager."""
    rag_result = qa_chain.invoke({
        "question": safe_message,
        "chat_history": memory_manager.get_recent_history()
    })
    
    ai_reply = rag_result["answer"]
    
    # Add the interaction to the memory manager so it tracks it and pops old memories
    memory_manager.add_turn(safe_message, ai_reply)
    
    return ai_reply