import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import { useAuth } from "./AuthContext";
import Login from "./Login"; // adjust path if your Login component lives elsewhere
import {
  Shield,
  Send,
  Plus,
  MessageSquare,
  Loader2,
  Wifi,
  WifiOff,
  FileText,
  Lock,
  Menu,
  LogOut,
} from "lucide-react";

// Update this to your actual backend IP if needed (e.g., "http://192.168.1.73:8000/api")
const API_BASE = "http://127.0.0.1:8000/api";

const INITIAL_MESSAGES = [
  {
    role: "ai",
    text: "Hello! I am your Cybersecurity AI Assistant. How can I help you stay safe online today?",
    action: "greeting",
  },
];

function App() {
  // --- Auth state (hook must always run, no early return before other hooks) ---
  const { token, isAuthenticated, logout, isChecking } = useAuth();

  /**
   * All hooks are declared here, unconditionally, before any early return.
   * This is required by React's Rules of Hooks.
   */
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Checking backend...");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scrollRef = useRef(null);
  const sidebarUploadRef = useRef(null);
  const inlineUploadRef = useRef(null);

  const [isOnline, setIsOnline] = useState(false);

  /* ----------------------------- */
  /* FETCH SESSIONS & STATUS       */
  /* ----------------------------- */

  const fetchSessions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error("Failed to fetch sessions: status", res.status);
        setSessions([]);
        return;
      }
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
      setSessions([]);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setStatus(data.message);
        setIsOnline(res.ok);
      } catch {
        setStatus("Backend disconnected.");
        setIsOnline(false);
      }
    };

    checkStatus();
    fetchSessions();
  }, [fetchSessions, token]);

  /* ----------------------------- */
  /* LOAD CHAT HISTORY             */
  /* ----------------------------- */

  useEffect(() => {
    if (!activeId) {
      setMessages(INITIAL_MESSAGES);
      return;
    }
    if (!token) return;

    const loadHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/chats/${activeId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        const history = Array.isArray(data)
          ? data.map((msg) => ({
            role: msg.role,
            text: msg.content,
            action: "history",
          }))
          : INITIAL_MESSAGES;

        setMessages(history);
      } catch (err) {
        console.error("Failed to load history:", err);
      }
    };

    loadHistory();
  }, [activeId, token]);

  /* ----------------------------- */
  /* AUTO SCROLL                   */
  /* ----------------------------- */

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  /* ----------------------------- */
  /* NEW CHAT                      */
  /* ----------------------------- */

  const createNewChat = () => {
    setActiveId(null);
    setMessages(INITIAL_MESSAGES);
  };

  /* ----------------------------- */
  /* PDF UPLOAD                    */
  /* ----------------------------- */

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: data.detail || "PDF upload failed. Please try a different file.",
            action: "error",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: data.message || "PDF uploaded successfully.", action: "upload_success" },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Unable to connect to the upload server.", action: "error" },
      ]);
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
  };

  /* ----------------------------- */
  /* SEND MESSAGE                  */
  /* ----------------------------- */

  const submit = async (e) => {
    e.preventDefault();

    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: "user", text }]);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, session_id: activeId }),
      });

      const data = await response.json();

      if (!activeId && data.session_id) {
        setActiveId(data.session_id);
        fetchSessions();
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: data.reply || "No response generated.",
          action: data.action,
          pii: data.pii_redacted,
          scores: data.domain_scores,
          sources: data.sources || [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Communication error.", action: "error" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  /* ----------------------------- */
  /* AUTH GATE (after all hooks)   */
  /* ----------------------------- */

  if (isChecking) return <div>Loading...</div>;
  if (!isAuthenticated) return <Login />;

  /* ----------------------------- */
  /* RENDER                        */
  /* ----------------------------- */

  return (
    <div
      className="app-container"
      style={{ display: "flex", flexDirection: "row", height: "100vh", overflow: "hidden" }}
    >
      {/* ---------------- Left rail: header + persistent sidebar ---------------- */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          height: "100vh",
        }}
      >
        <header
          className="top-header"
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px",
          }}
        >
          <button
            className="dashboard-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle dashboard menu"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              padding: "6px",
              fontSize: "1.2rem",
              fontWeight: "700",
            }}
          >
            <Menu size={24} />
            Dashboard
          </button>
        </header>

        {/* ---------------- Persistent Sidebar Panel ---------------- */}
        {sidebarOpen && (
          <aside
            className="sidebar"
            style={{
              width: "320px",
              margin: 0,
              borderRadius: 0,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              className="sidebar-header"
              style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "15px" }}
            >
              <button
                className="new-chat-btn"
                onClick={() => sidebarUploadRef.current.click()}
                disabled={isLoading}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                <FileText size={16} />
                Upload PDF
              </button>

              <input
                type="file"
                accept="application/pdf"
                ref={sidebarUploadRef}
                style={{ display: "none" }}
                onChange={handleUpload}
              />

              <button
                className="new-chat-btn"
                onClick={createNewChat}
                disabled={isLoading}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                <Plus size={16} />
                New Chat
              </button>
            </div>

            <div className="session-list">
              <div className="session-label">Recent Chats</div>

              {sessions.length === 0 && (
                <div className="empty-session">No previous chats</div>
              )}

              {sessions.map((session) => (
                <button
                  key={session.id}
                  className={`session-item ${activeId === session.id ? "active" : ""
                    }`}
                  onClick={() => setActiveId(session.id)}
                >
                  <MessageSquare size={15} />
                  <span className="session-title">{session.title}</span>
                </button>
              ))}
            </div>

            <div className="sidebar-footer">
              <div className="brand">
                <Shield size={20} />
                <div>
                  <div className="brand-title">CyberGuard AI</div>
                  <div className="brand-subtitle">Secure Assistant</div>
                </div>
              </div>

              <div
                className={`status-indicator ${isOnline ? "online" : "offline"
                  }`}
              >
                {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
              </div>
            </div>

            <div className="sidebar-bottom-bar">
              <button
                className="footer-logout-btn"
                onClick={logout}
                aria-label="Log out"
              >
                <LogOut size={16} />
                Log Out
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Chat area flexes to fill remaining width next to the sidebar */}
      <main
        className="chat-area full"
        style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}
      >
        <div className="chat-scroll" ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
          {messages.map((msg, index) => (
            <div key={index} className={`row row-${msg.role}`}>
              {msg.role === "ai" && (
                <div className="avatar">
                  <Shield size={16} />
                </div>
              )}

              <div
                className={`bubble bubble-${msg.role} ${msg.action === "error" ? "error" : ""
                  }`}
              >
                <div className="bubble-text">{msg.text}</div>

                {/* ---------- Explainability ---------- */}
                {msg.role === "ai" && (msg.sources?.length > 0 || msg.scores) && (
                  <details className="reasoning-panel">
                    <summary>🔍 View AI Reasoning</summary>

                    <div className="reasoning-body">
                      {msg.scores && (
                        <div className="routing-box">
                          <strong>Primary Domain</strong>
                          <div>{msg.scores.primary_domain}</div>
                        </div>
                      )}

                      {msg.sources?.length > 0 && (
                        <div className="sources-box">
                          <strong>Retrieved Sources</strong>
                          <ul>
                            {msg.sources.map((src, i) => (
                              <li key={i}>
                                <FileText size={12} />
                                <div>
                                  <strong>{src.source}</strong>
                                  <p>{src.snippet}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.pii && (
                        <div className="pii-warning">
                          <Lock size={14} />
                          Sensitive information was automatically redacted.
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="row row-ai">
              <div className="avatar">
                <Shield size={16} />
              </div>
              <div className="bubble bubble-ai">
                <div className="loading">
                  <Loader2 className="spin" size={18} />
                  Thinking...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================= INPUT AREA (bottom, matching mockup) ================= */}
        <div className="input-container">
          <form className="input-bar" onSubmit={submit}>
            <input
              type="file"
              accept="application/pdf"
              ref={inlineUploadRef}
              style={{ display: "none" }}
              onChange={handleUpload}
            />

            <button
              type="button"
              className="inline-plus-btn"
              onClick={() => inlineUploadRef.current.click()}
              disabled={isLoading}
            >
              <Plus size={18} />
            </button>

            <input
              type="text"
              placeholder="Ask a cybersecurity question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />

            <button
              type="submit"
              className="send-btn"
              disabled={!input.trim() || isLoading}
            >
              <Send size={18} />
            </button>
          </form>

          <div className="disclaimer">
            CyberGuard AI may generate incorrect or incomplete responses. Always
            verify critical cybersecurity advice before taking action.
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;