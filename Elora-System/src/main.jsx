import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { SettingsProvider } from './context/SettingsContext';
import { AIStateProvider } from './context/AIStateContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <SettingsProvider>
      <AIStateProvider>
        <App />
      </AIStateProvider>
    </SettingsProvider>
  </React.StrictMode>
);
