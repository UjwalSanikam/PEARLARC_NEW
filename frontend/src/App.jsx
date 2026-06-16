import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, Send, AlertTriangle, Lock,
  RefreshCw, CheckCircle2, Search, Wifi, WifiOff, Loader2
} from 'lucide-react';

const INITIAL_MESSAGES = [
  {
    role: 'ai',
    text: 'Hello! I am your Cybersecurity AI Assistant. How can I help you stay safe online today?',
    action: 'allow',
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

export default function App() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Checking connection...');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

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
    { label: 'Domain Classify', active: !!lastAiMessage },
    { label: 'PII Detection', active: !!lastAiMessage, flagged: lastAiMessage?.pii?.length > 0 },
    { label: 'Emergency Scan', active: !!lastAiMessage, flagged: lastAiMessage?.action === 'emergency' },
    { label: 'Response Sent', active: !!lastAiMessage },
  ];

  const resetChat = () => setMessages(INITIAL_MESSAGES);

  return (
    <div className="aegis-app">
      <style>{CSS}</style>

      {/* Header */}
      <header className="aegis-header">
        <div className="brand">
          <Shield size={20} className="brand-icon" />
          <div className="brand-text">
            <span className="brand-name">AEGIS</span>
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
              <span>
                PII: {lastAiMessage?.pii?.length > 0 ? 'DETECTED' : 'NONE DETECTED'}
              </span>
            </div>
            <div className="disclaimer">AEGIS AI can make mistakes. Verify critical security configurations.</div>
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

.brand-icon {
  color: var(--accent);
}

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
.pill-danger { color: var(--danger); border-color: rgba(255,84,104,0.3); background: var(--danger-bg); }
.pill-warning { color: var(--warning); border-color: rgba(255,176,32,0.3); background: var(--warning-bg); }
.pill-neutral { color: var(--accent); border-color: rgba(45,212,191,0.3); background: rgba(45,212,191,0.08); }

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
  grid-template-columns: 1fr 300px;
  min-height: 0;
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

.row-user {
  justify-content: flex-end;
}

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

.bubble-user {
  background: #115e59;
  color: #ecfdf9;
  border-bottom-right-radius: 4px;
}

.bubble-ai {
  background: var(--panel-raised);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.bubble-emergency {
  background: var(--danger-bg);
  border-color: rgba(255, 84, 104, 0.4);
  color: #ffd7dc;
}

.bubble-block {
  background: var(--warning-bg);
  border-color: rgba(255, 176, 32, 0.4);
  color: #ffe7b8;
}

.bubble-error {
  background: rgba(140, 140, 140, 0.08);
  border-color: var(--border-strong);
  color: var(--text-secondary);
}

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

.bubble-flag-warning {
  color: var(--warning);
}

.bubble-text {
  white-space: pre-wrap;
}

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

.spin {
  animation: aegis-spin 1s linear infinite;
}

@keyframes aegis-spin {
  to { transform: rotate(360deg); }
}

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

.chip:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
}

.chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel-raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 6px 6px 6px 16px;
}

.input-bar:focus-within {
  border-color: var(--accent);
}

.input-bar input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.9rem;
  padding: 8px 0;
}

.input-bar input::placeholder {
  color: var(--text-tertiary);
}

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

.input-bar button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

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

.panel-muted {
  background: transparent;
}

.panel-title {
  margin: 0 0 12px;
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

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

.stat-danger { color: var(--danger); }
.stat-warning { color: var(--warning); }
.stat-success { color: var(--success); }

.stat-label {
  font-size: 0.68rem;
  color: var(--text-tertiary);
}

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

.pipeline-list li.pipeline-active {
  color: var(--text-primary);
}

.pipeline-icon-ok {
  color: var(--success);
}

.pipeline-icon-flagged {
  color: var(--warning);
}

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
  .sidebar .panel {
    min-width: 220px;
  }
}
`;