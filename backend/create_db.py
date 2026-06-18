import os
from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.vectorstores import FAISS

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
    print(f"Created {len(chunks)} text chunks.")

    print("Building FAISS vector database via Local Nomic Embeddings...")
    # 1. Use the offline Ollama embedding model
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    
    # No more batching, limits, or sleep timers! Let your CPU do the work.
    print("Processing embeddings locally. This might take a minute depending on your computer...")
    vector_db = FAISS.from_documents(chunks, embeddings)

    vector_db.save_local("faiss_index")
    print("\nSUCCESS! The entire PDF brain has been vectorized locally and saved to 'faiss_index'.")

if __name__ == "__main__":
    build_database()