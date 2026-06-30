import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
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

export default function App() {
  /* ----------------------------- */
  /* STATE                         */
  /* ----------------------------- */

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

  const isOnline = /online|ready|active|ok/i.test(status);

  /* ----------------------------- */
  /* FETCH SESSIONS & STATUS       */
  /* ----------------------------- */

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chats`);
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/status`);
        const data = await res.json();
        setStatus(data.message);
      } catch {
        setStatus("Backend disconnected.");
      }
    };

    checkStatus();
    fetchSessions();
  }, [fetchSessions]);

  /* ----------------------------- */
  /* LOAD CHAT HISTORY             */
  /* ----------------------------- */

  useEffect(() => {
    if (!activeId) {
      setMessages(INITIAL_MESSAGES);
      return;
    }

    const loadHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/chats/${activeId}`);
        const data = await res.json();

        const history = data.map((msg) => ({
          role: msg.role,
          text: msg.content,
          action: "history",
        }));

        setMessages(history);
      } catch (err) {
        console.error("Failed to load history:", err);
      }
    };

    loadHistory();
  }, [activeId]);

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
        body: form,
      });

      if (!res.ok) {
        alert("Upload failed.");
      } else {
        alert("Knowledge base updated successfully.");
      }
    } catch {
      alert("Unable to connect to upload server.");
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
        headers: { "Content-Type": "application/json" },
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
  /* RENDER                        */
  /* ----------------------------- */

  return (
    <div className="app-container">
      <header className="top-header" style={{ position: 'relative', zIndex: 100 }}>
        {/* Wrapping the button and sidebar to act as a relative anchor for the dropdown */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            className="dashboard-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: '600',
              padding: '10px'
            }}
          >
            <Menu size={24} />
            Dashboard
          </button>

          {/* ---------------- Dropdown Sidebar ---------------- */}
          {sidebarOpen && (
            <aside
              className="sidebar"
              style={{
                position: 'absolute',
                top: '100%',
                left: '10px',
                marginTop: '8px',
                height: 'auto',
                minHeight: '400px',
                maxHeight: '80vh',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Added flex column layout here to force vertical stacking */}
              <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '15px' }}>

                <button
                  className="new-chat-btn"
                  onClick={() => sidebarUploadRef.current.click()}
                  disabled={isLoading}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
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
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
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
            </aside>
          )}
        </div>
      </header>

      {/* Changed to always be "full" so the chat doesn't squish when the dropdown opens */}
      <main className="chat-area full">
        <div className="chat-scroll" ref={scrollRef}>
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

        {/* ================= INPUT AREA ================= */}
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