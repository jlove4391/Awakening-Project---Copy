import React from 'react';
import { useSettings } from '../context/SettingsContext';
import '../styles/theme.css';

const SettingsPanel = () => {
  const { voiceEnabled, setVoiceEnabled, devMode, setDevMode } = useSettings();

  const toggleItems = [
    { key: 'voiceEnabled', label: '🔊 Voice Output', value: voiceEnabled, setter: setVoiceEnabled },
    { key: 'devMode', label: '🧪 Developer Mode', value: devMode, setter: setDevMode },
  ];

  return (
    <div className="console-panel" style={{ maxWidth: '700px', margin: '40px auto' }}>
      <h1 style={{
        fontFamily: 'var(--font-title)',
        color: 'var(--gold)',
        fontSize: '2rem',
        marginBottom: '16px'
      }}>
        System Settings
      </h1>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        Adjust Vireon's global control parameters across all consoles.
      </p>

      {toggleItems.map(({ key, label, value, setter }) => (
        <div className="setting-row" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }} key={key}>
          <span style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{label}</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={value}
              onChange={() => setter(!value)}
            />
            <span className="slider" />
          </label>
        </div>
      ))}
    </div>
  );
};

export default SettingsPanel;
