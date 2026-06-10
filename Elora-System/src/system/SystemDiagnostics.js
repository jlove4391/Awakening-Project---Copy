
// SystemDiagnostics.js

import React from 'react';
import { useMemory } from '../context/MemoryContext';

const SystemDiagnostics = () => {
  const { memory } = useMemory();

  const recentLogs = memory.slice(-5).reverse();

  return (
    <div className="diagnostics-panel">
      <h2>📊 System Diagnostics</h2>
      <ul>
        {recentLogs.map((log, index) => (
          <li key={index}>
            <strong>{log.timestamp}</strong> - [{log.type}] {log.text || log.message}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SystemDiagnostics;
