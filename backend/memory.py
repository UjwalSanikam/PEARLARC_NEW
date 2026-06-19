# backend/memory.py
class SessionMemory:
    """Manages conversational history for the CyberGuard RAG pipeline."""
    
    def __init__(self, max_turns: int = 4):
        self.history = []
        self.max_turns = max_turns

    def add_turn(self, user_msg: str, ai_msg: str):
        """Saves a successful interaction to memory."""
        self.history.append((user_msg, ai_msg))
        if len(self.history) > self.max_turns:
            self.history.pop(0)

    def get_recent_history(self) -> list:
        """Returns the history formatted for LangChain."""
        return self.history

    def get_user_context(self) -> str:
        """Grabs the User's previous question instead of the AI's long answer."""
        if not self.history:
            return ""
        return self.history[-1][0]

    def get_conversation_context(self, max_turns: int = 2) -> str:
        """
        Returns a rich context string built from recent user+AI pairs.
        Including the AI's reply is critical: for follow-ups like
        'how to download it on my phone?', the AI's previous answer about
        2FA/authenticator apps contains the cybersecurity vocabulary that
        tips the semantic classifier back into the correct domain.
        """
        if not self.history:
            return ""
        # Take the most recent `max_turns` pairs
        recent = self.history[-max_turns:]
        parts = []
        for user_msg, ai_msg in recent:
            parts.append(f"User: {user_msg}")
            # Truncate AI reply to avoid bloating the embedding input
            parts.append(f"Assistant: {ai_msg[:300]}")
        return " | ".join(parts)

# Initialize a global memory manager to be imported by main.py and rag_engine.py
memory_manager = SessionMemory()