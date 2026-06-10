import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { loadMemory, saveMemory } from '../utils/memoryEngine';

const MemoryContext = createContext();

export const MemoryProvider = ({ children }) => {
  const [memory, setMemory] = useState([]);

  // ✅ 1) Load from local storage first
  useEffect(() => {
    const stored = loadMemory();
    setMemory(stored);
  }, []);

  // ✅ 2) Then fetch persistent logs from the bridge
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await axios.get('http://localhost:5001/api/logs');
        if (res.data?.logs) {
          setMemory((prev) => {
            // Combine bridge logs with local storage, avoiding duplicates
            const merged = [...prev, ...res.data.logs];
            // Remove duplicates by timestamp + text combo
            const unique = Array.from(new Map(merged.map(item =>
              [`${item.timestamp}-${item.text}`, item]
            )).values());
            return unique;
          });
        }
      } catch (err) {
        console.error('Error fetching bridge logs:', err);
      }
    };

    fetchLogs();
  }, []);

  // ✅ 3) Save updated memory to local storage whenever it changes
  useEffect(() => {
    saveMemory(memory);
  }, [memory]);

  const addToMemory = (entry) => {
    setMemory(prev => [...prev.slice(-19), entry]); // cap at 20
  };

  const clearMemoryLog = () => {
    setMemory([]);
    localStorage.removeItem('elora_memory_log');
  };

  // ✅ New: Search logs by query
  const searchLogs = async (query) => {
    try {
      const res = await axios.get(`http://localhost:5001/api/logs/search?query=${encodeURIComponent(query)}`);
      return res.data?.results || [];
    } catch (err) {
      console.error('Error searching logs:', err);
      return [];
    }
  };

  // ✅ New: Get log summary
  const getLogSummary = async () => {
    try {
      const res = await axios.get('http://localhost:5001/api/logs/summary');
      return res.data?.summary || [];
    } catch (err) {
      console.error('Error fetching log summary:', err);
      return [];
    }
  };

  return (
    <MemoryContext.Provider value={{
      memory,
      addToMemory,
      clearMemoryLog,
      searchLogs,
      getLogSummary
    }}>
      {children}
    </MemoryContext.Provider>
  );
};

export const useMemory = () => useContext(MemoryContext);
