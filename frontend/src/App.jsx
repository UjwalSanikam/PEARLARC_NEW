import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Send, Plus, MessageSquare, Loader2, Wifi, WifiOff, FileText, Lock 
} from 'lucide-react';

const INITIAL_MESSAGES = [
  {
    role: 'ai',
    text: 'Hello! I am your Cybersecurity AI Assistant. How can I help you stay safe online today?',
    action: 'greeting',
  },
];

export default function App() {
  // --- DATABASE-BACKED STATE ---
  const [sessions, setSessions] = useState([]); // Sidebar list from Postgres
  const [activeId, setActiveId] = useState(null); // Currently selected database session ID
  const [messages, setMessages] = useState(INITIAL_MESSAGES); // Active conversation
  
  // --- UI STATE ---
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Checking connection...');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  const isOnline = /online|active|locked|ready|ok/i.test(status);

  // --- API ROUTING ---
  
  // 1. Fetch backend status
  useEffect(() => {
    fetch('http://172.29.222.183:8000/api/status')
      .then((res) => res.json())
      .then((data) => setStatus(data.message))
      .catch(() => setStatus('Backend disconnected.'));
  }, []);

  // 2. Fetch all chat sessions for the sidebar
  const fetchSessions = async () => {
    try {
      const res = await fetch('http://172.29.222.183:8000/api/chats');
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      console.error("Failed to fetch sidebar sessions from database:", err);
    }
  };

  // Run once on load
  useEffect(() => {
    fetchSessions();
  }, []);

  // 3. Fetch specific chat history when activeId changes
  useEffect(() => {
    if (!activeId) {
      // If activeId is null, it means we clicked "New Chat"
      setMessages(INITIAL_MESSAGES);
      return;
    }

    const fetchHistory = async () => {
      try {
        const res = await fetch(`http://172.29.222.183:8000/api/chats/${activeId}`);
        const data = await res.json();
        // Map database format to our UI format
        const formattedMessages = data.map(m => ({
          role: m.role,
          text: m.content,
          action: 'history' 
        }));
        setMessages(formattedMessages);
      } catch (err) {
        console.error("Failed to load conversation history:", err);
      }
    };

    fetchHistory();
  }, [activeId]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);


  // --- ACTIONS ---
  const createNewChat = () => {
    setActiveId(null);
    setMessages(INITIAL_MESSAGES);
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setIsLoading(true);

    // 1. Add user message to UI immediately for a snappy feel
    const newMessages = [...messages, { role: 'user', text }];
    setMessages(newMessages);

    try {
      // 2. Send payload directly to Postgres-backed endpoint
      const response = await fetch('http://172.29.222.183:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          session_id: activeId // Backend determines if it needs to make a new row
        }),
      });

      const data = await response.json();

      // 3. If this was a brand new chat, lock in the new Postgres ID
      if (!activeId && data.session_id) {
        setActiveId(data.session_id);
        fetchSessions(); // Refresh the sidebar to show the newly created chat
      }

      // 4. Append AI response
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: data.reply || 'No response generated.',
          action: data.action,
          pii: data.pii_redacted,
          scores: data.domain_scores,
          sources: data.sources || []
        },
      ]);
    } catch (error) {
      console.error('Network Error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Communication error with backend.', action: 'error' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <style>{CSS}</style>

      {/* --- SIDEBAR --- */}
      <aside className="sidebar">
        <button className="new-chat-btn" onClick={createNewChat} disabled={isLoading}>
          <Plus size={16} />
          New Chat
        </button>

        <div className="session-list">
          <div className="session-label">Recent Chats</div>
          {sessions.map((session) => (
            <button
              key={session.id}
              className={`session-item ${session.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(session.id)}
              disabled={isLoading}
            >
              <MessageSquare size={16} className="session-icon" />
              <span className="session-title">{session.title}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="brand">
            <Shield size={20} className="brand-icon" />
            <div className="brand-text">
              <span className="brand-name">CyberGuard</span>
              <span className="brand-sub">Local AI</span>
            </div>
          </div>
          <div className={`status-dot ${isOnline ? 'online' : 'offline'}`} title={status}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          </div>
        </div>
      </aside>

      {/* --- MAIN CHAT AREA --- */}
      <main className="chat-area">
        <div className="chat-scroll" ref={scrollRef}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`row row-${msg.role}`}>
              {msg.role === 'ai' && (
                <div className="avatar">
                  <Shield size={16} />
                </div>
              )}

              <div className={`bubble bubble-${msg.role} ${msg.action === 'error' ? 'error' : ''}`}>
                <div className="bubble-text">{msg.text}</div>

                {/* XAI Reasoning Toggle */}
                {msg.role === 'ai' && msg.action === 'allow' && (msg.sources?.length > 0 || msg.scores) && (
                  <details className="xai-details">
                    <summary>🔍 View AI Reasoning & Sources</summary>
                    <div className="xai-box">
                      
                      {msg.scores?.primary_domain && (
                        <div style={{ marginBottom: '12px' }}>
                          <strong>Routing:</strong> Passed as <em>{msg.scores.primary_domain}</em> 
                          ({(msg.scores.confidence * 100).toFixed(1)}%)
                        </div>
                      )}

                      {msg.sources?.length > 0 && (
                        <div>
                          <strong>FAISS Context Retrieved:</strong>
                          <ul className="xai-snippets">
                            {msg.sources.map((src, i) => (
                              <li key={i} className="xai-snippet">
                                {typeof src === 'string' ? (
                                  <span className="xai-snippet-text">"{src}"</span>
                                ) : (
                                  <>
                                    <span className="xai-snippet-source">
                                      <FileText size={10} /> {src.source} · p.{src.page}
                                    </span>
                                    <span className="xai-snippet-text">"{src.snippet}"</span>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* PII Block */}
                {msg.pii && msg.pii.length > 0 && (
                  <div className="bubble-pii">
                    <Lock size={12} /> Protected data: {msg.pii.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="row row-ai">
              <div className="avatar"><Shield size={16} /></div>
              <div className="bubble bubble-ai loading">
                <Loader2 size={16} className="spin" /> Analyzing...
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="input-container">
          <form className="input-bar" onSubmit={submit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a cybersecurity question..."
              disabled={isLoading}
            />
            <button type="submit" disabled={!input.trim() || isLoading}>
              <Send size={18} />
            </button>
          </form>
          <div className="disclaimer">
            CyberGuard AI can make mistakes. Verify critical security configurations.
          </div>
        </div>
      </main>
    </div>
  );
}

const CSS = `
:root {
  --bg-sidebar: #171717;
  --bg-sidebar-hover: #212121;
  --bg-sidebar-active: #2f2f2f;
  --bg-main: #212121;
  --bg-input: #2f2f2f;
  --text-primary: #ececec;
  --text-secondary: #9b9b9b;
  --accent: #2dd4bf;
  --accent-hover: #14b8a6;
  --bubble-user: #115e59;
  --bubble-ai: #2f2f2f;
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--text-primary);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: var(--bg-main);
  overflow: hidden;
}

/* --- SIDEBAR --- */
.sidebar {
  width: 260px;
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  border-right: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.2);
  color: var(--text-primary);
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 24px;
}

.new-chat-btn:hover:not(:disabled) { background: rgba(255,255,255,0.05); }
.new-chat-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.session-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }

.session-label { font-size: 0.75rem; color: var(--text-secondary); font-weight: 600; padding: 0 12px; margin-bottom: 8px; }

.session-item {
  display: flex; align-items: center; gap: 12px;
  background: transparent; border: none; color: var(--text-primary);
  padding: 12px; border-radius: 8px; cursor: pointer;
  text-align: left; transition: background 0.2s;
}

.session-item:hover:not(:disabled) { background: var(--bg-sidebar-hover); }
.session-item.active { background: var(--bg-sidebar-active); }
.session-item:disabled { opacity: 0.5; cursor: not-allowed; }
.session-icon { color: var(--text-secondary); flex-shrink: 0; }
.session-title { font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.sidebar-footer {
  margin-top: auto; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: space-between;
}

.brand { display: flex; align-items: center; gap: 8px; }
.brand-icon { color: var(--accent); }
.brand-text { display: flex; flex-direction: column; line-height: 1.1; }
.brand-name { font-weight: bold; font-size: 0.9rem; }
.brand-sub { font-size: 0.7rem; color: var(--text-secondary); }

.status-dot {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.05);
}
.status-dot.online { color: var(--accent); }
.status-dot.offline { color: #ff5468; }

/* --- MAIN CHAT --- */
.chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.chat-scroll { flex: 1; overflow-y: auto; padding: 32px 10%; display: flex; flex-direction: column; gap: 24px; }
.row { display: flex; gap: 16px; max-width: 800px; margin: 0 auto; width: 100%; }
.row-user { justify-content: flex-end; }
.avatar { width: 32px; height: 32px; border-radius: 6px; background: rgba(45, 212, 191, 0.15); color: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.bubble { padding: 14px 18px; border-radius: 12px; font-size: 0.95rem; line-height: 1.6; max-width: 80%; }
.bubble-user { background: var(--bubble-user); border-bottom-right-radius: 4px; }
.bubble-ai { background: var(--bubble-ai); border-bottom-left-radius: 4px; }
.bubble.error { border: 1px solid #ff5468; background: rgba(255,84,104,0.1); }
.bubble-text { white-space: pre-wrap; }

.loading { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* XAI Details & Snippets */
.xai-details { margin-top: 12px; font-size: 0.8rem; color: var(--text-secondary); }
.xai-details summary { cursor: pointer; font-weight: 600; margin-bottom: 6px; outline: none; }
.xai-box { padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); }
.xai-snippets { margin-top: 8px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.xai-snippet { display: flex; flex-direction: column; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.xai-snippet:last-child { border-bottom: none; padding-bottom: 0; }
.xai-snippet-source { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--accent); font-family: monospace; text-transform: uppercase;}
.xai-snippet-text { font-size: 0.8rem; font-style: italic; color: var(--text-secondary); }

/* PII Badge */
.bubble-pii { display: flex; align-items: center; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem; color: #ffb020; }

/* --- INPUT AREA --- */
.input-container { padding: 24px 10%; background: transparent; max-width: 1000px; margin: 0 auto; width: 100%; }
.input-bar { display: flex; align-items: center; background: var(--bg-input); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 8px 16px; transition: border-color 0.2s; }
.input-bar:focus-within { border-color: var(--accent); }
.input-bar input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 1rem; padding: 10px 0; }
.input-bar button { background: var(--accent); color: #000; border: none; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity 0.2s; }
.input-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
.disclaimer { text-align: center; font-size: 0.75rem; color: var(--text-secondary); margin-top: 12px; }

@media (max-width: 768px) {
  .sidebar { width: 60px; padding: 16px 8px; }
  .session-title, .session-label, .brand-text { display: none; }
  .new-chat-btn { justify-content: center; padding: 12px; }
  .session-item { justify-content: center; }
  .chat-scroll, .input-container { padding: 16px; }
  .bubble { max-width: 90%; }
}
`;