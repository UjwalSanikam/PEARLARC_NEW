# backend/memory.py

class SessionMemory:
    """Holds conversational history for a single chat session."""

    def __init__(self, max_turns: int = 4):
        self.history = []
        self.max_turns = max_turns

    def add_turn(self, user_msg: str, ai_msg: str):
        self.history.append((user_msg, ai_msg))
        if len(self.history) > self.max_turns:
            self.history.pop(0)

    def get_recent_history(self) -> list:
        return self.history

    def get_conversation_context(self, max_turns: int = 2) -> str:
        if not self.history:
            return ""
        recent = self.history[-max_turns:]
        parts = []
        for user_msg, ai_msg in recent:
            parts.append(f"User: {user_msg}")
            parts.append(f"Assistant: {ai_msg[:300]}")
        return " | ".join(parts)


class MemoryStore:
    """Keeps one SessionMemory per chat session_id, so histories never mix."""

    def __init__(self, max_turns: int = 4):
        self._sessions: dict[str, SessionMemory] = {}
        self.max_turns = max_turns

    def get(self, session_id: str) -> SessionMemory:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionMemory(max_turns=self.max_turns)
        return self._sessions[session_id]

    def clear(self, session_id: str):
        self._sessions.pop(session_id, None)


# Global store is fine — it's keyed by session_id, so no cross-user bleed
memory_store = MemoryStore()