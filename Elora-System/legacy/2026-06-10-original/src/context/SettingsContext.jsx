import React, { createContext, useState, useEffect, useContext } from 'react';

const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [devMode, setDevMode] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const voice = localStorage.getItem('voiceEnabled');
    const dev = localStorage.getItem('devMode');

    if (voice !== null) setVoiceEnabled(voice === 'true');
    if (dev !== null) setDevMode(dev === 'true');
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('voiceEnabled', voiceEnabled);
    localStorage.setItem('devMode', devMode);
  }, [voiceEnabled, devMode]);

  return (
    <SettingsContext.Provider
      value={{
        voiceEnabled,
        setVoiceEnabled,
        devMode,
        setDevMode
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
