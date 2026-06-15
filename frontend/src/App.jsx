import { useState, useEffect } from 'react';

function App() {
  // Initialize state with the waiting message
  const [serverMessage, setServerMessage] = useState('Waiting for backend...');

  useEffect(() => {
    // Define the async fetch function
    const fetchBackendStatus = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/status');

        // Check if the response is successful (status in the range 200-299)
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Parse the JSON response
        const data = await response.json();

        // Update the state with the server's message. 
        setServerMessage(data.message || 'Connected, but no message key found in response.');

      } catch (error) {
        console.error("Failed to fetch from backend:", error);
        setServerMessage('Error: Cannot connect to backend. Ensure FastAPI is running on port 8000.');
      }
    };

    // Execute the fetch function
    fetchBackendStatus();
  }, []); // Empty dependency array ensures this runs only once on component mount

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Cybersecurity AI Assistant</h1>

      <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>System Status</h2>
        <p>
          <strong>Backend Message: </strong>
          <span style={{ color: serverMessage.includes('Error') ? 'red' : 'green' }}>
            {serverMessage}
          </span>
        </p>
      </div>
    </div>
  );
}

export default App;