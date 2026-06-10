import React, { createContext, useContext, useState } from 'react';

export const AIStateContext = createContext();


// List of all known personas (used to prebuild clean structure)
const personaList = [
  'elora', 'aura', 'cassian', 'darius', 'galen', 'ira',
  'jynx', 'kale', 'lyra', 'nexora', 'nova', 'novara',
  'nymera', 'orion', 'selene', 'seraph', 'sylvaris', 'syvra',
  'thorn', 'valtrix', 'velvra', 'veyra', 'zyvra', 'sorein', 'valen', 'cipher', 'synq'
];

// Default values for new or uninitialized AI states
const defaultAIState = {
  mood: 'neutral',
  empathy: 0,
  sentience: 50,
  stability: 75,
  meter: 50,
  lastCommand: '',
  active: false,
};

export const AIStateProvider = ({ children }) => {
  const [aiStates, setAIStates] = useState(() => {
    const initial = {};
    personaList.forEach(name => {
      initial[name] = { ...defaultAIState };
    });
    return initial;
  });

  const [logs, setLogs] = useState([]); // 🔥 Add logs state

  const updateAIState = (persona, updates) => {
    setAIStates(prev => ({
      ...prev,
      [persona]: {
        ...defaultAIState,
        ...prev[persona],
        ...updates,
      },
    }));
  };

  const resetAIState = (persona) => {
    setAIStates(prev => ({
      ...prev,
      [persona]: { ...defaultAIState },
    }));
  };

  return (
    <AIStateContext.Provider value={{
      aiStates, updateAIState, resetAIState,
      logs, setLogs // 🔥 Expose logs
    }}>
      {children}
    </AIStateContext.Provider>
  );
};

export const useAIState = () => useContext(AIStateContext);

