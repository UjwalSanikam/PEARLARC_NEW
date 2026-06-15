from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI() #initialising the actual backend application its the engine that listens for the requests

#This prevents CORS(crss origin resource sharing) errors when the React frontend (port 5173) talks to your FastAPI backend
# the middleware is letting the frontend talk to the backend without any discrpencies
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#this is a route descriptor tells us when ever someone interacts with the url ending in /api/status using a standard GET request it triggers the function
@app.get("/api/status")
def get_status():
    return {"message": "The Cybersecurity AI backend is locked, loaded, and listening!"}