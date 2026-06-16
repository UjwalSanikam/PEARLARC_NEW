import React, { useState, useEffect } from 'react';
import { Shield, Send, AlertTriangle, User, Activity, Lock } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'AEGIS Cybersecurity Assistant is active. All guardrails are armed. Ask me anything related to cybersecurity, fraud, or digital threats.', action: 'allow' }
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Checking connection...');
  const [stats, setStats] = useState({ total: 0, blocked: 0, pii: 0, safe: 0 });
  const [domainScores, setDomainScores] = useState({ cyber: 0, oob: 0 });

  // Ping the backend on load
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/status')
      .then((res) => res.json())
      .then((data) => setStatus(data.message))
      .catch(() => setStatus('Backend disconnected.'));
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setStats((s) => ({ ...s, total: s.total + 1 }));

    try {
      const response = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      
      const data = await response.json();
      
      if (data.action === 'block_oob') setStats((s) => ({ ...s, blocked: s.blocked + 1 }));
      if (data.pii_redacted?.length > 0) setStats((s) => ({ ...s, pii: s.pii + 1 }));
      if (data.action === 'allow') setStats((s) => ({ ...s, safe: s.safe + 1 }));
      if (data.domain_scores) setDomainScores(data.domain_scores);

      setMessages((prev) => [...prev, { 
        role: 'ai', 
        text: data.reply, 
        action: data.action,
        pii: data.pii_redacted
      }]);

    } catch (error) {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Error connecting to the AI brain.', action: 'error' }]);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-300 font-sans">
      
      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col relative">
        
        {/* Header */}
        <header className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="text-teal-400 w-6 h-6" />
            <h1 className="text-xl font-bold text-teal-400 tracking-wider">AEGIS // CyberGuard AI</h1>
          </div>
          <div className="flex items-center gap-2 text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
            <div className={`w-2 h-2 rounded-full ${status.includes('locked') ? 'bg-teal-400' : 'bg-rose-500 animate-pulse'}`}></div>
            {status.includes('locked') ? 'SYSTEM ONLINE' : 'OFFLINE'}
          </div>
        </header>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${msg.role === 'user' ? 'bg-indigo-900/50 border-indigo-500/30 text-indigo-400' : 'bg-teal-900/30 border-teal-500/30 text-teal-400'}`}>
                {msg.role === 'user' ? <User size={18} /> : <Shield size={18} />}
              </div>

              {/* Message Bubble */}
              <div className={`max-w-[75%] p-4 rounded-xl shadow-lg border ${
                msg.action === 'emergency' ? 'bg-rose-950/40 border-rose-500/50 text-rose-200' :
                msg.action === 'block_oob' ? 'bg-slate-900/80 border-amber-500/30 text-amber-200' :
                msg.role === 'user' ? 'bg-indigo-950/40 border-indigo-500/20 text-indigo-100' :
                'bg-slate-900 border-slate-800 text-slate-200'
              }`}>
                
                {/* Emergency Header */}
                {msg.action === 'emergency' && (
                  <div className="flex items-center gap-2 mb-3 text-rose-400 text-xs font-bold uppercase tracking-widest border-b border-rose-500/20 pb-2">
                    <AlertTriangle size={14} /> Emergency Response
                  </div>
                )}
                
                {/* The Message */}
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* PII Warning Footer */}
                {msg.pii && msg.pii.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-700/50 flex items-center gap-2 text-xs text-amber-400/80">
                    <Lock size={12} />
                    PII Redacted: {msg.pii.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about cybersecurity, fraud, or threats..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all placeholder-slate-600"
            />
            <button type="submit" className="bg-teal-600 hover:bg-teal-500 text-white px-6 py-3 rounded-lg flex items-center justify-center transition-colors">
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT SIDEBAR - STATS & DOMAIN */}
      <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col p-6 hidden lg:flex">
        
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Session Stats</h2>
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
            <div className="text-2xl font-bold text-teal-400">{stats.total}</div>
            <div className="text-xs text-slate-500 mt-1">Total Queries</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
            <div className="text-2xl font-bold text-rose-400">{stats.blocked}</div>
            <div className="text-xs text-slate-500 mt-1">Blocked OOB</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
            <div className="text-2xl font-bold text-amber-400">{stats.pii}</div>
            <div className="text-xs text-slate-500 mt-1">PII Found</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
            <div className="text-2xl font-bold text-emerald-400">{stats.safe}</div>
            <div className="text-xs text-slate-500 mt-1">Safe Passed</div>
          </div>
        </div>

        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Domain Scores</h2>
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Cyber Signal</span>
              <span className="text-teal-400 font-mono">{domainScores.cyber}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-teal-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(domainScores.cyber * 20, 100)}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Out-of-Bound Risk</span>
              <span className="text-amber-400 font-mono">{domainScores.oob}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-amber-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(domainScores.oob * 20, 100)}%` }}></div>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Activity size={14} className="text-teal-500" />
            Vite + React UI Engine
          </div>
        </div>

      </div>
    </div>
  );
}