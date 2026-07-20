from langchain_community.document_loaders import PyPDFDirectoryLoader, PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings

import os

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
INDEX_PATH = "faiss_index"


def _get_embeddings():
    return OllamaEmbeddings(model="nomic-embed-text", base_url=OLLAMA_BASE_URL)


def build_database():
    """
    Full rebuild from every PDF in ./data. Kept as a manual maintenance tool
    (e.g. if the index gets corrupted, or a document was deleted and needs
    to be cleanly removed from search results). Day-to-day uploads should
    use add_documents_to_index() instead, which is much faster.
    """
    print("Scanning the 'data' folder for PDF documents...")
    loader = PyPDFDirectoryLoader('./data')
    documents = loader.load()

    if not documents:
        print("No PDFs found in ./data.")
        return

    print(f"Found {len(documents)} pages. Chunking text...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=300)
    chunks = text_splitter.split_documents(documents)
    print(f"Created {len(chunks)} text chunks.")

    print("Rebuilding FAISS vector database from scratch via Local Nomic Embeddings...")
    embeddings = _get_embeddings()
    vector_db = FAISS.from_documents(chunks, embeddings)
    vector_db.save_local(INDEX_PATH)
    print(f"\nSUCCESS! Full rebuild complete — {len(chunks)} chunks indexed.")


def add_documents_to_index(new_docs: list[Document]):
    """
    Incrementally adds new_docs to the existing FAISS index without
    re-embedding anything that's already indexed. Creates the index fresh
    if this is the very first document ever added.
    """
    if not new_docs:
        print("No documents to add — skipping.")
        return

    embeddings = _get_embeddings()
    index_faiss_file = os.path.join(INDEX_PATH, "index.faiss")

    if os.path.exists(index_faiss_file):
        print(f"Loading existing index to incrementally add {len(new_docs)} document(s)...")
        vector_db = FAISS.load_local(INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
        vector_db.add_documents(new_docs)
    else:
        print(f"No existing index found — creating new one with {len(new_docs)} document(s)...")
        vector_db = FAISS.from_documents(new_docs, embeddings)

    vector_db.save_local(INDEX_PATH)
    print(f"SUCCESS! Added {len(new_docs)} document(s) incrementally.")


def add_pdf_to_index(file_path: str):
    """Chunks a single newly-uploaded PDF and adds only its chunks to the index."""
    print(f"Chunking new PDF: {file_path}")
    pages = PyPDFLoader(file_path).load()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=300)
    chunks = text_splitter.split_documents(pages)
    print(f"Created {len(chunks)} chunks from this PDF.")
    add_documents_to_index(chunks)


def add_image_to_index(description: str, filename: str, file_path: str):
    """Adds a single newly-uploaded image's description as one document to the index."""
    doc = Document(
        page_content=description,
        metadata={"source": filename, "type": "image", "image_path": file_path},
    )
    add_documents_to_index([doc])