import React, { useContext, useState, useEffect } from 'react';
import { useAIState, AIStateContext as AIContext } from '../context/AIStateContext';
import { getLogHistory } from '../utils/logBus';


const SovereignConsole = () => {
  const { aiLogs } = useContext(AIContext);
  const [logHistory, setLogHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      const logs = await getLogHistory();
      setLogHistory(logs);
    };
    fetchLogs();
  }, []);

  const filteredLogs = logHistory.filter(log =>
    log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.persona.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="console sovereign">
      <h1>Sovereign Console</h1>
      <p className="subtitle">Command-Level Oversight Interface</p>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search logs by keyword or persona..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="log-section">
        <h2>📜 Activity Logs</h2>
        <div className="log-stream">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log, index) => (
              <div key={index} className="log-entry">
                <strong>{log.timestamp}</strong> — <em>{log.persona}</em>: {log.message}
              </div>
            ))
          ) : (
            <p>No logs found for that query.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SovereignConsole;
