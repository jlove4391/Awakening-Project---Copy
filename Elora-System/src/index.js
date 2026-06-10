import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/dynasty-ui.css';

import { SettingsProvider } from './context/SettingsContext';
import { AIStateProvider, useAIState } from './context/AIStateContext';
import { runSharedInfluence } from './utils/SharedInfluenceEngine';
import { MemoryProvider } from './context/MemoryContext';

// Wrapper to run shared influence engine
function AppWrapper() {
  const { aiStates, updateAIState } = useAIState();

  useEffect(() => {
    const interval = setInterval(() => {
      runSharedInfluence(aiStates, updateAIState);
    }, 3000); // runs every 3 seconds

    return () => clearInterval(interval);
  }, [aiStates]);

  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
   <MemoryProvider>
  <SettingsProvider>
    <AIStateProvider>
      <AppWrapper />
    </AIStateProvider>
  </SettingsProvider>
</MemoryProvider>

  </React.StrictMode>
);
