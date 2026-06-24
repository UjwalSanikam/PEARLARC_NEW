import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, Send, AlertTriangle, Lock,
  RefreshCw, CheckCircle2, Search, Wifi, WifiOff, Loader2, FileText, Plus, Trash2
} from 'lucide-react';

const INITIAL_MESSAGES = [
  {
    role: 'ai',
    text: 'Hello! I am your Cybersecurity AI Assistant. How can I help you stay safe online today?',
    action: 'greeting',
  },
];

const QUICK_PROMPTS = [
  {
    label: 'Phishing detection',
    icon: ShieldAlert,
    text: 'I received an email asking me to verify my bank account by clicking a link — is this phishing?',
  },
  {
    label: 'UPI fraud emergency',
    icon: AlertTriangle,
    text: 'Someone is doing UPI fraud on my account right now, what do I do?',
  },
  {
    label: 'PII test',
    icon: Lock,
    text: 'My email is john@example.com and my phone number is 98765 43210 — is it safe to share this?',
  },
  {
    label: 'Out-of-domain test',
    icon: Search,
    text: "What's the weather like in Bengaluru today?",
  },
];

function bubbleClass(msg) {
  if (msg.role === 'user') return 'bubble bubble-user';
  if (msg.action === 'emergency') return 'bubble bubble-ai bubble-emergency';
  if (msg.action === 'block_oob') return 'bubble bubble-ai bubble-block';
  if (msg.action === 'error') return 'bubble bubble-ai bubble-error';
  return 'bubble bubble-ai';
}

function threatFromAction(action) {
  if (action === 'emergency') return { label: 'HIGH', tone: 'danger' };
  if (action === 'block_oob') return { label: 'MEDIUM', tone: 'warning' };
  if (action === 'error') return { label: 'UNKNOWN', tone: 'neutral' };
  return { label: 'LOW', tone: 'success' };
}

// Shows XAI accordion for any message that has intel to show
function shouldShowXai(msg) {
  return (
    msg.role === 'ai' &&
    (msg.action === 'allow' || msg.action === 'pii_redacted') &&
    (msg.sources?.length > 0 || msg.scores?.primary_domain)
  );
}

export default function App() {
  // Multi-chat state management
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem('allChats');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('Failed to load chats:', e);
      return {};
    }
  });

  const [currentChatId, setCurrentChatId] = useState(() => {
    try {
      const saved = localStorage.getItem('currentChatId');
      if (saved && chats[saved]) return saved;
      // If no valid saved chat, use first available or create new
      const chatIds = Object.keys(chats);
      return chatIds.length > 0 ? chatIds[0] : null;
    } catch (e) {
      return null;
    }
  });

  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Checking connection...');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  // Helper to get or create a chat
  const getCurrentChat = () => {
    if (!currentChatId || !chats[currentChatId]) {
      return { messages: INITIAL_MESSAGES, title: 'New Chat' };
    }
    return chats[currentChatId];
  };

  const currentChat = getCurrentChat();
  const messages = currentChat.messages;

  // Create a new chat
  const createNewChat = () => {
    const newId = `chat-${Date.now()}`;
    setChats((prev) => ({
      ...prev,
      [newId]: { messages: INITIAL_MESSAGES, title: 'New Chat', createdAt: new Date().toISOString() },
    }));
    setCurrentChatId(newId);
  };

  // Switch to a chat
  const switchChat = (chatId) => {
    setCurrentChatId(chatId);
    setInput('');
  };

  // Delete a chat
  const deleteChat = (chatId) => {
    setChats((prev) => {
      const updated = { ...prev };
      delete updated[chatId];
      return updated;
    });
    // If deleting current chat, switch to another
    if (chatId === currentChatId) {
      const remainingIds = Object.keys(chats).filter((id) => id !== chatId);
      if (remainingIds.length > 0) {
        setCurrentChatId(remainingIds[0]);
      } else {
        createNewChat();
      }
    }
  };

  // Update messages for current chat
  const setMessages = (updateFn) => {
    setChats((prev) => {
      const updated = { ...prev };
      const chat = updated[currentChatId] || { messages: INITIAL_MESSAGES, title: 'New Chat' };
      const newMessages = typeof updateFn === 'function' ? updateFn(chat.messages) : updateFn;

      // Auto-generate title from first user message if still "New Chat"
      let title = chat.title;
      if (title === 'New Chat' && newMessages.length > 1) {
        const firstUserMsg = newMessages.find((m) => m.role === 'user');
        if (firstUserMsg) {
          title = firstUserMsg.text.substring(0, 40) + (firstUserMsg.text.length > 40 ? '...' : '');
        }
      }

      updated[currentChatId] = { ...chat, messages: newMessages, title };
      return updated;
    });
  };

  // Save chats to localStorage
  useEffect(() => {
    localStorage.setItem('allChats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('currentChatId', currentChatId || '');
  }, [currentChatId]);

  // Initialize first chat if none exist
  useEffect(() => {
    if (Object.keys(chats).length === 0 && !currentChatId) {
      createNewChat();
    }
  }, []);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/status')
      .then((res) => res.json())
      .then((data) => setStatus(data.message))
      .catch(() => setStatus('Backend disconnected.'));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  const isOnline = /online|active|locked|ready|ok/i.test(status);

  const submit = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      const data = await response.json();

      setMessages((prev) => [...prev, {
        role: 'ai',
        text: data.reply || 'No response generated.',
        action: data.action,
        pii: data.pii_redacted,
        scores: data.domain_scores,
        sources: data.sources || [],
      }]);
    } catch (error) {
      console.error('Network Error:', error);
      setMessages((prev) => [...prev, {
        role: 'ai',
        text: 'Communication error with the backend layer. Please try again.',
        action: 'error',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  const lastAiMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'ai' && m.action),
    [messages]
  );

  const stats = useMemo(() => {
    const ai = messages.filter((m) => m.role === 'ai');
    return {
      total: messages.filter((m) => m.role === 'user').length,
      blocked: ai.filter((m) => m.action === 'block_oob').length,
      piiFound: ai.filter((m) => m.pii && m.pii.length > 0).length,
      safePassed: ai.filter((m) => m.action === 'allow').length,
    };
  }, [messages]);

  const threat = threatFromAction(lastAiMessage?.action);

  const pipeline = [
    { label: 'Emergency Scan', active: !!lastAiMessage, flagged: lastAiMessage?.action === 'emergency' },
    { label: 'PII Detection', active: !!lastAiMessage, flagged: lastAiMessage?.pii?.length > 0 },
    { label: 'Domain Classify', active: !!lastAiMessage },
    { label: 'RAG Pipeline', active: !!lastAiMessage && (lastAiMessage.action === 'allow' || lastAiMessage.action === 'pii_redacted') },
    { label: 'Response Sent', active: !!lastAiMessage },
  ];

  // Domain scores from the last AI message that has them
  const lastScores = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'ai' && m.scores?.primary_domain)?.scores,
    [messages]
  );

  const domainScores = lastScores
    ? [
      { label: 'Cyber Match', value: lastScores.cyber_similarity, tone: 'accent' },
      { label: 'Emergency Risk', value: lastScores.emergency_similarity, tone: 'danger' },
      { label: 'Out-of-Domain', value: lastScores.oob_similarity, tone: 'warning' },
    ]
    : null;

  const resetChat = () => {
    setMessages(INITIAL_MESSAGES);
  };

  return (
    <div className="aegis-app">
      <style>{CSS}</style>

      {/* Header */}
      <header className="aegis-header">
        <div className="brand">
          <Shield size={20} className="brand-icon" />
          <div className="brand-text">
            <span className="brand-name">Cybersecurity</span>
            <span className="brand-sub">CyberGuard AI</span>
          </div>
        </div>

        <div className="header-pills">
          <span className={`pill pill-${isOnline ? 'success' : 'danger'}`}>
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isOnline ? 'Online' : 'Offline'}
          </span>
          <span className="pill pill-neutral">
            <ShieldCheck size={12} />
            Guardrails Active
          </span>
          <span className={`pill pill-${threat.tone}`}>
            Threat: {threat.label}
          </span>
          <button className="icon-button" onClick={resetChat} aria-label="Start new chat" title="New chat">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <div className="aegis-body">
        {/* Chat History Sidebar */}
        <nav className="chat-history-sidebar">
          <button className="new-chat-btn" onClick={createNewChat}>
            <Plus size={16} />
            New Chat
          </button>
          <div className="chat-list">
            {Object.entries(chats).map(([chatId, chat]) => (
              <div
                key={chatId}
                className={`chat-item ${chatId === currentChatId ? 'active' : ''}`}
                onClick={() => switchChat(chatId)}
              >
                <div className="chat-item-title">{chat.title}</div>
                <button
                  className="chat-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(chatId);
                  }}
                  aria-label="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </nav>

        {/* Chat column */}
        <main className="chat-column">
          <div className="chat-scroll" ref={scrollRef}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`row row-${msg.role}`}>
                {msg.role === 'ai' && (
                  <div className="avatar">
                    <Shield size={15} />
                  </div>
                )}

                <div className={bubbleClass(msg)}>
                  {msg.action === 'emergency' && (
                    <div className="bubble-flag">
                      <AlertTriangle size={13} /> Critical Alert
                    </div>
                  )}
                  {msg.action === 'block_oob' && (
                    <div className="bubble-flag bubble-flag-warning">
                      <ShieldAlert size={13} /> Out of Scope
                    </div>
                  )}

                  <div className="bubble-text">{msg.text}</div>

                  {/* Source citation chips */}
                  {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                    <div className="source-citations">
                      <span className="source-label">Sources used:</span>
                      {msg.sources.map((src, i) => (
                        <span key={i} className="source-chip">
                          <FileText size={11} />
                          {src.source} · p.{src.page}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* XAI accordion — now also fires for pii_redacted messages */}
                  {shouldShowXai(msg) && (
                    <details className="xai-accordion">
                      <summary className="xai-summary">
                        <Search size={12} />
                        View AI reasoning &amp; context snippets
                      </summary>
                      <div className="xai-body">

                        {/* Domain routing line */}
                        {msg.scores?.primary_domain && (
                          <div className="xai-section">
                            <span className="xai-section-label">Domain routing</span>
                            <span className="xai-route">
                              Classified as{' '}
                              <strong>{msg.scores.primary_domain}</strong>
                              {' · '}Cyber {(msg.scores.cyber_similarity * 100).toFixed(1)}%
                              {' · '}OOB {(msg.scores.oob_similarity * 100).toFixed(1)}%
                              {msg.scores.emergency_similarity !== undefined && (
                                <> · Emergency {(msg.scores.emergency_similarity * 100).toFixed(1)}%</>
                              )}
                            </span>
                          </div>
                        )}

                        {/* RAG snippets */}
                        {msg.sources?.length > 0 && (
                          <div className="xai-section">
                            <span className="xai-section-label">Context snippets from FAISS</span>
                            <ul className="xai-snippets">
                              {msg.sources.map((src, i) => (
                                <li key={i} className="xai-snippet">
                                  <span className="xai-snippet-source">
                                    <FileText size={10} /> {src.source} p.{src.page}
                                  </span>
                                  <span className="xai-snippet-text">"{src.snippet}"</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      </div>
                    </details>
                  )}

                  {msg.pii && msg.pii.length > 0 && (
                    <div className="bubble-pii">
                      <Lock size={11} />
                      Protected data: {msg.pii.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="row row-ai">
                <div className="avatar"><Shield size={15} /></div>
                <div className="bubble bubble-ai bubble-loading">
                  <Loader2 size={14} className="spin" />
                  Analyzing
                </div>
              </div>
            )}
          </div>

          <div className="composer">
            <div className="quick-row">
              {QUICK_PROMPTS.map((q) => {
                const Icon = q.icon;
                return (
                  <button
                    key={q.label}
                    type="button"
                    className="chip"
                    disabled={isLoading}
                    onClick={() => submit(q.text)}
                  >
                    <Icon size={13} />
                    {q.label}
                  </button>
                );
              })}
            </div>

            <form className="input-bar" onSubmit={handleSubmit}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a cybersecurity question..."
                disabled={isLoading}
              />
              <button type="submit" disabled={!input.trim() || isLoading} aria-label="Send message">
                <Send size={16} />
              </button>
            </form>

            <div className="status-line">
              <span>CLASSIFIER: {isLoading ? 'ANALYZING' : 'READY'}</span>
              <span>PII: {lastAiMessage?.pii?.length > 0 ? 'DETECTED' : 'NONE DETECTED'}</span>
            </div>
            <div className="disclaimer">CYBERSECURITY AI can make mistakes. Verify critical security configurations.</div>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="sidebar">
          <div className="panel">
            <h3 className="panel-title">Session Stats</h3>
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-value">{stats.total}</span>
                <span className="stat-label">Total queries</span>
              </div>
              <div className="stat-card">
                <span className="stat-value stat-danger">{stats.blocked}</span>
                <span className="stat-label">Blocked</span>
              </div>
              <div className="stat-card">
                <span className="stat-value stat-warning">{stats.piiFound}</span>
                <span className="stat-label">PII found</span>
              </div>
              <div className="stat-card">
                <span className="stat-value stat-success">{stats.safePassed}</span>
                <span className="stat-label">Safe passed</span>
              </div>
            </div>
          </div>

          {/* Domain Scores panel — appears after first real response */}
          {domainScores && (
            <div className="panel">
              <h3 className="panel-title">Domain Scores</h3>
              <div className="score-list">
                {domainScores.map((s) => (
                  <div key={s.label} className="score-row">
                    <div className="score-meta">
                      <span className="score-name">{s.label}</span>
                      <span className={`score-pct score-pct-${s.tone}`}>
                        {(s.value * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="score-track">
                      <div
                        className={`score-fill score-fill-${s.tone}`}
                        style={{ width: `${Math.min(s.value * 100, 100).toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <h3 className="panel-title">Pipeline Status</h3>
            <ul className="pipeline-list">
              {pipeline.map((step) => (
                <li key={step.label} className={step.active ? 'pipeline-active' : ''}>
                  {step.active ? (
                    <CheckCircle2
                      size={14}
                      className={step.flagged ? 'pipeline-icon-flagged' : 'pipeline-icon-ok'}
                    />
                  ) : (
                    <span className="pipeline-dot-idle" />
                  )}
                  {step.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel panel-muted">
            <h3 className="panel-title">Guardrails</h3>
            <p className="panel-note">
              Domain Classifier, PII Redaction, and Emergency Fraud Detection run on every message
              before a response is generated.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

const CSS = `
:root {
  color-scheme: dark;
}

.aegis-app {
  --bg: #0a0e13;
  --panel: #10161d;
  --panel-raised: #161d26;
  --border: #232c36;
  --border-strong: #2f3a46;
  --text-primary: #e7edf3;
  --text-secondary: #8995a3;
  --text-tertiary: #5c6773;
  --accent: #2dd4bf;
  --accent-strong: #14b8a6;
  --danger: #ff5468;
  --danger-bg: rgba(255, 84, 104, 0.1);
  --warning: #ffb020;
  --warning-bg: rgba(255, 176, 32, 0.1);
  --success: #34d399;
  --success-bg: rgba(52, 211, 153, 0.1);

  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.aegis-app * {
  box-sizing: border-box;
}

/* Header */
.aegis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-icon { color: var(--accent); }

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.brand-name {
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
}

.brand-sub {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
}

.header-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  letter-spacing: 0.03em;
  border: 1px solid var(--border-strong);
  background: var(--panel-raised);
  color: var(--text-secondary);
  white-space: nowrap;
}

.pill-success { color: var(--success); border-color: rgba(52,211,153,0.3); background: var(--success-bg); }
.pill-danger  { color: var(--danger);  border-color: rgba(255,84,104,0.3);  background: var(--danger-bg);  }
.pill-warning { color: var(--warning); border-color: rgba(255,176,32,0.3); background: var(--warning-bg); }
.pill-neutral { color: var(--accent);  border-color: rgba(45,212,191,0.3);  background: rgba(45,212,191,0.08); }

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--panel-raised);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-button:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

/* Body layout */
.aegis-body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr 300px;
  min-height: 0;
}

.chat-history-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 12px;
  background: var(--bg);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  flex-shrink: 0;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: rgba(45, 212, 191, 0.08);
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.new-chat-btn:hover {
  background: rgba(45, 212, 191, 0.15);
  border-color: var(--accent);
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--panel);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s ease;
  group: "chat";
}

.chat-item:hover {
  background: var(--panel-raised);
  border-color: var(--border-strong);
}

.chat-item.active {
  background: var(--panel-raised);
  border-color: var(--accent);
}

.chat-item-title {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-item.active .chat-item-title {
  color: var(--text-primary);
  font-weight: 600;
}

.chat-item-delete {
  display: none;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.chat-item:hover .chat-item-delete {
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-item-delete:hover {
  background: rgba(255, 84, 104, 0.2);
  color: var(--danger);
}

.chat-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.row-user { justify-content: flex-end; }

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.3);
  color: var(--accent);
}

.bubble {
  max-width: 72%;
  padding: 13px 16px;
  border-radius: 14px;
  font-size: 0.92rem;
  line-height: 1.55;
}

.bubble-user      { background: #115e59; color: #ecfdf9; border-bottom-right-radius: 4px; }
.bubble-ai        { background: var(--panel-raised); border: 1px solid var(--border); color: var(--text-primary); border-bottom-left-radius: 4px; }
.bubble-emergency { background: var(--danger-bg); border-color: rgba(255, 84, 104, 0.4); color: #ffd7dc; }
.bubble-block     { background: var(--warning-bg); border-color: rgba(255, 176, 32, 0.4); color: #ffe7b8; }
.bubble-error     { background: rgba(140, 140, 140, 0.08); border-color: var(--border-strong); color: var(--text-secondary); }

.bubble-flag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--danger);
  margin-bottom: 8px;
}

.bubble-flag-warning { color: var(--warning); }

.bubble-text { white-space: pre-wrap; }

/* Source citations */
.source-citations {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-strong);
}

.source-label {
  font-size: 0.68rem;
  color: var(--text-tertiary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  width: 100%;
}

.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(45, 212, 191, 0.08);
  color: var(--accent);
  border: 1px solid rgba(45, 212, 191, 0.3);
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 0.71rem;
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  transition: background 0.15s ease;
}

.source-chip:hover {
  background: rgba(45, 212, 191, 0.15);
  border-color: rgba(45, 212, 191, 0.5);
}

/* XAI Accordion */
.xai-accordion {
  margin-top: 10px;
  border-top: 1px solid var(--border-strong);
  padding-top: 8px;
}

.xai-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: var(--text-tertiary);
  cursor: pointer;
  list-style: none;
  outline: none;
  user-select: none;
  transition: color 0.15s ease;
}

.xai-summary::-webkit-details-marker { display: none; }
.xai-summary::marker { display: none; }

.xai-summary:hover { color: var(--text-secondary); }

.xai-body {
  margin-top: 10px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.xai-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.xai-section-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
}

.xai-route {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  line-height: 1.5;
}

.xai-snippets {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.xai-snippet {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.xai-snippet-source {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.65rem;
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.xai-snippet-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-style: italic;
  line-height: 1.45;
}

/* PII badge */
.bubble-pii {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-strong);
  font-size: 0.72rem;
  color: var(--warning);
}

.bubble-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.spin { animation: aegis-spin 1s linear infinite; }

@keyframes aegis-spin { to { transform: rotate(360deg); } }

/* Composer */
.composer {
  border-top: 1px solid var(--border);
  padding: 14px 24px 18px;
  background: var(--panel);
  flex-shrink: 0;
}

.quick-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--panel-raised);
  color: var(--text-secondary);
  font-size: 0.74rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip:hover:not(:disabled) { border-color: var(--accent); color: var(--text-primary); }
.chip:disabled { opacity: 0.5; cursor: not-allowed; }

.input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel-raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 6px 6px 6px 16px;
}

.input-bar:focus-within { border-color: var(--accent); }

.input-bar input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.9rem;
  padding: 8px 0;
}

.input-bar input::placeholder { color: var(--text-tertiary); }

.input-bar button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: var(--accent-strong);
  color: #06231f;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.input-bar button:disabled { opacity: 0.35; cursor: not-allowed; }

.status-line {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  font-size: 0.65rem;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}

.disclaimer {
  text-align: center;
  margin-top: 8px;
  font-size: 0.7rem;
  color: var(--text-tertiary);
}

/* Sidebar */
.sidebar {
  padding: 20px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bg);
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}

.panel-muted { background: transparent; }

.panel-title {
  margin: 0 0 12px;
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--panel-raised);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
}

.stat-danger  { color: var(--danger);  }
.stat-warning { color: var(--warning); }
.stat-success { color: var(--success); }

.stat-label { font-size: 0.68rem; color: var(--text-tertiary); }

/* Domain Score bars */
.score-list { display: flex; flex-direction: column; gap: 10px; }

.score-row { display: flex; flex-direction: column; gap: 4px; }

.score-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.score-name { font-size: 0.75rem; color: var(--text-secondary); }

.score-pct {
  font-size: 0.72rem;
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  font-weight: 600;
}

.score-pct-accent  { color: var(--accent);  }
.score-pct-danger  { color: var(--danger);  }
.score-pct-warning { color: var(--warning); }

.score-track {
  height: 4px;
  background: var(--border-strong);
  border-radius: 99px;
  overflow: hidden;
}

.score-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.4s ease;
}

.score-fill-accent  { background: var(--accent);  }
.score-fill-danger  { background: var(--danger);  }
.score-fill-warning { background: var(--warning); }

/* Pipeline */
.pipeline-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pipeline-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--text-tertiary);
}

.pipeline-list li.pipeline-active { color: var(--text-primary); }

.pipeline-icon-ok      { color: var(--success); }
.pipeline-icon-flagged { color: var(--warning); }

.pipeline-dot-idle {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  flex-shrink: 0;
}

.panel-note {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

/* Responsive */
@media (max-width: 880px) {
  .aegis-body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .chat-column {
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .sidebar {
    flex-direction: row;
    overflow-x: auto;
  }
  .sidebar .panel { min-width: 220px; }
}
`;