import React, { useContext, useEffect, useState } from 'react';
import { useAIState } from '../context/AIStateContext'; // ✅ CORRECT

import '../styles/LogBusViewer.css';

const LogBusViewer = () => {
  const { aiStates } = useAIState(); // ✅

  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // Simulated dynamic log fetching
    const allLogs = [];

    Object.entries(aiStates).forEach(([name, state]) => {
      if (state.logs && Array.isArray(state.logs)) {
        state.logs.forEach((entry) => {
          allLogs.push({ ai: name, ...entry });
        });
      }
    });

    setLogs(allLogs.sort((a, b) => b.timestamp - a.timestamp)); // Most recent first
  }, [aiStates]);

  return (
    <div className="logbus-container">
      <h1>LogBus Viewer</h1>
      <div className="log-list">
        {logs.length === 0 ? (
          <p>No logs found.</p>
        ) : (
          logs.map((entry, idx) => (
            <div className="log-entry" key={idx}>
              <strong>{entry.ai.toUpperCase()}</strong> → <em>{new Date(entry.timestamp).toLocaleTimeString()}</em>
              <div className="log-text">{entry.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LogBusViewer;
