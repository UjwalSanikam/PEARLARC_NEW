import os
import time
from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv

load_dotenv()

def build_database():
    print("Scanning the 'data' folder for PDF documents...")
    loader = PyPDFDirectoryLoader('./data')
    documents = loader.load()

    if not documents:
        print("No PDFs found! Make sure your NIST document is inside the 'data' folder.")
        return

    print(f"Found {len(documents)} pages. Chunking text...")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000, 
        chunk_overlap=200 
    )
    chunks = text_splitter.split_documents(documents)
    total_chunks = len(chunks)
    print(f"Created {total_chunks} text chunks.")

    print("Building FAISS vector database via Gemini Cloud Embeddings...")
    embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001")
    
    # -----------------------------------------------------------------
    # BATCHING LAYER: Protects your Free Tier quota from 429 Rate Limits
    # -----------------------------------------------------------------
    batch_size = 30  # Process 30 chunks at a time to stay safely below the 100 limit
    vector_db = None
    
    for i in range(0, total_chunks, batch_size):
        batch = chunks[i:i + batch_size]
        current_batch_num = (i // batch_size) + 1
        total_batches = (total_chunks + batch_size - 1) // batch_size
        
        print(f"-> Processing batch {current_batch_num}/{total_batches} ({len(batch)} chunks)...")
        
        try:
            if vector_db is None:
                vector_db = FAISS.from_documents(batch, embeddings)
            else:
                vector_db.add_documents(batch)
        except Exception as e:
            # Automatic fallback: If Google still flags a 429, pause, let it reset, and retry
            print(f"\n[!] Rate limit reached: {str(e)}")
            print("Cooling down for 40 seconds to reset your Gemini quota window...")
            time.sleep(40)
            print("Retrying current batch...")
            if vector_db is None:
                vector_db = FAISS.from_documents(batch, embeddings)
            else:
                vector_db.add_documents(batch)

        # Strategic pause between successful batches to maintain a safe API cadence
        if i + batch_size < total_chunks:
            print("Sleeping for 8 seconds to prevent API flooding...")
            time.sleep(8)
            
    # -----------------------------------------------------------------
    
    if vector_db:
        vector_db.save_local("faiss_index")
        print("\nSUCCESS! The entire 80-page NIST brain has been vectorized and saved to 'faiss_index'.")

if __name__ == "__main__":
    build_database()