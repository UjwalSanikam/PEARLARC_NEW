import os
from dotenv import load_dotenv
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

# 1. Load the API keys from the .env file
load_dotenv()

print("Loading document...")
# 2. Load our cybersecurity text file
loader = TextLoader("cybersecurity_faqs.txt")
document = loader.load()

print("Chunking text...")
# 3. Split the text into smaller, digestible chunks for the AI
text_splitter = RecursiveCharacterTextSplitter(chunk_size=300, chunk_overlap=50)
chunks = text_splitter.split_documents(document)

print("Creating embeddings and building FAISS database...")
# 4. Convert text to vectors using a fast, free Hugging Face model
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 5. Build the Vector Database
db = FAISS.from_documents(chunks, embeddings)

# 6. Save the database to a local folder
db.save_local("faiss_index")
print("Success! FAISS database has been created and saved in the 'faiss_index' folder.")