
from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS

# FIX 1: Updated the import to use the newer, official langchain_ollama package 
# (This fixes the yellow deprecation warning in your terminal!)
from langchain_ollama import OllamaEmbeddings

import os

def build_database():
    print("Scanning the 'data' folder for PDF documents...")
    loader = PyPDFDirectoryLoader('./data')
    documents = loader.load()

    if not documents:
        print("No PDFs found! Make sure your NIST document is inside the 'data' folder.")
        return

    print(f"Found {len(documents)} pages. Chunking text...")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=2000,
        chunk_overlap=300
    )
    chunks = text_splitter.split_documents(documents)
    print(f"Created {len(chunks)} text chunks.")

    print("Building FAISS vector database via Local Nomic Embeddings...")
    OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=OLLAMA_BASE_URL)

    print("Processing embeddings locally. This might take a minute depending on your computer...")
    vector_db = FAISS.from_documents(chunks, embeddings)

    vector_db.save_local("faiss_index")
    print("\nSUCCESS! The entire PDF brain has been vectorized locally and saved to 'faiss_index'")