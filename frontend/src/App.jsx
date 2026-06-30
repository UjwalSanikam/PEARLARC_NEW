import React, { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";

import "./App.css";

const API_BASE = "http://172.29.222.183:8000/api";

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
  // FIX 1: One ref for the sidebar upload, one for the inline input-bar upload.
  //        Previously both inputs shared one ref, so only the last-rendered
  //        one was reachable and the sidebar button silently did nothing.
  const sidebarUploadRef = useRef(null);
  const inlineUploadRef = useRef(null);

  // FIX 2: Removed "locked" from the online pattern — a locked system is not
  //        online.  "active" and "ready" are sufficient positive signals.
  const isOnline = /online|ready|active|ok/i.test(status);

  /* ----------------------------- */
  /* FETCH SIDEBAR                 */
  /* ----------------------------- */

  // FIX 3: Defined fetchSessions with useCallback *before* the useEffect that
  //        calls it.  Avoids a temporal dependency on declaration order and
  //        lets us safely include it in the effect dependency array.
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chats`);
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  }, []);

  /* ----------------------------- */
  /* BACKEND STATUS                */
  /* ----------------------------- */

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
      // Reset so the same file can be re-uploaded if needed
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

      <header className="top-header">
        <button
          className="dashboard-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          ☰ Dashboard
        </button>
      </header>

      {/* ---------------- Sidebar ---------------- */}
      {sidebarOpen && (
        <aside className="sidebar">

          <div className="sidebar-header">

            {/* FIX 4: Sidebar uses its own ref so it stays independent of the
                       inline upload button in the input bar. */}
            <button
              className="new-chat-btn"
              onClick={() => sidebarUploadRef.current.click()}
              disabled={isLoading}
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
                className={`session-item ${activeId === session.id ? "active" : ""}`}
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

            <div className={`status-indicator ${isOnline ? "online" : "offline"}`}>
              {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
            </div>

          </div>

        </aside>
      )}

      {/* FIX 5: Removed the duplicate self-closing <main className="chat-area" />
                 that was rendering an empty ghost element before the real main.
                 There is now exactly one <main> tag. */}
      <main className={`chat-area ${sidebarOpen ? "" : "full"}`}>

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
                {msg.role === "ai" &&
                  (msg.sources?.length > 0 || msg.scores) && (
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
                                    {/* FIX 6: Render snippet as a proper
                                               string inside a <p> tag without
                                               raw JSX quote-text nodes. */}
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

            {/* FIX 4 (continued): Inline upload uses its own separate ref. */}
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
            CyberGuard AI may generate incorrect or incomplete responses.
            Always verify critical cybersecurity advice before taking action.
          </div>

        </div>

      </main>

    </div>
  );
}