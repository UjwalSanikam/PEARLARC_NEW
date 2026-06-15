import { useState, useEffect } from 'react';
import './App.css'; // Make sure this is imported!

function App() {
  // 1. Existing System Status State
  const [serverMessage, setServerMessage] = useState('Waiting for backend...');

  // 2. New Chat States
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hello! I am your Cybersecurity AI Assistant. How can I help you stay safe online today?' }
  ]);
  const [inputValue, setInputValue] = useState('');

  // 3. Existing Backend Status Check
  useEffect(() => {
    const fetchBackendStatus = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/status');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        setServerMessage(data.message || 'Connected!');
      } catch (error) {
        setServerMessage('Error: Cannot connect to backend.');
      }
    };
    fetchBackendStatus();
  }, []);

  // 4. Function to handle sending a message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;

    // Add the user's message to the chat UI
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInputValue(''); // Clear the input box

    try {
      // Send the question to your actual Python AI backend
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userText })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Add the AI's actual response to the chat
      setMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: 'Sorry, I am having trouble connecting to my AI brain right now.'
      }]);
    }
  };

  return (
    <div className="app-container">
      {/* Header & Status */}
      <header className="app-header">
        <h1>Cybersecurity AI Assistant</h1>
        <div className="status-badge">
          <span className={serverMessage.includes('Error') ? 'status-dot error' : 'status-dot ok'}></span>
          {serverMessage}
        </div>
      </header>

      {/* Chat Window */}
      <main className="chat-window">
        {messages.map((msg, index) => (
          <div key={index} className={`message-wrapper ${msg.sender}`}>
            <div className={`message-bubble ${msg.sender}`}>
              {msg.text}
            </div>
          </div>
        ))}
      </main>

      {/* Input Area */}
      <form className="input-area" onSubmit={handleSendMessage}>
        <input
          type="text"
          placeholder="Ask a cybersecurity question..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;