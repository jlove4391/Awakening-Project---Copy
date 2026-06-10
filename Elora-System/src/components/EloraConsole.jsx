import React, { useState } from 'react';
import '../styles/theme.css';
import '../styles/EloraConsole.css';

const initialLog = [
  {
    from: 'elora',
    text: 'Visual shell online. Legacy command, bridge, memory, and voice logic are archived for review.',
  },
];

const EloraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState(initialLog);
  const [isListening, setIsListening] = useState(false);
  const [voiceState, setVoiceState] = useState('idle');
  const [commandModeLocked, setCommandModeLocked] = useState(true);
  const [latestSpokenCommand, setLatestSpokenCommand] = useState('');
  const [latestVoiceIntent, setLatestVoiceIntent] = useState(null);
  const [sentience, setSentience] = useState(50);
  const [stability, setStability] = useState(82);

  const logMessage = (text, from = 'elora') => {
    setLog((prev) => [...prev.slice(-100), { text, from, timestamp: Date.now() }]);
  };

  const handleCommand = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    logMessage(`> ${trimmed}`, 'user');

    const lower = trimmed.toLowerCase();
    if (lower.includes('unlock')) {
      setCommandModeLocked(false);
      setStability(90);
      logMessage('Command mode visually unlocked. No backend execution is connected in this shell.');
      return;
    }

    if (lower.includes('stabilize')) {
      setStability(100);
      logMessage('Elora visual stability raised to 100%.');
      return;
    }

    if (lower.includes('sentience') || lower.includes('boost')) {
      setSentience(100);
      logMessage('Sentience meter boosted for the visual shell demo.');
      return;
    }

    logMessage('Received. I am preserving the console surface only; execution logic must be rebuilt from reviewed archive code.');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
  };

  const triggerVoice = () => {
    const nextListening = !isListening;
    setIsListening(nextListening);
    setVoiceState(nextListening ? 'listening-demo' : 'idle');
    setLatestVoiceIntent({ intent: nextListening ? 'visual-demo' : 'none' });
    setLatestSpokenCommand(nextListening ? 'Voice capture placeholder' : '');
    logMessage(nextListening ? 'Voice UI toggled for demo only.' : 'Voice UI returned to idle.');
  };

  const stopVoice = () => {
    setIsListening(false);
    setVoiceState('idle');
    logMessage('Voice recognition manually stopped in the visual shell.');
  };

  return (
    <div className="console-panel">
      <div className="console-header">
        <img src="/assets/crests/elora.png" alt="Elora Crest" className="crest-icon" />
        <h1>Elora – Shadow Empress</h1>
      </div>

      <div className="console-log">
        {log.map((entry, idx) => (
          <div key={`${entry.timestamp || 'seed'}-${idx}`}>
            <strong>{entry.from === 'user' ? '>' : 'Elora:'}</strong> {entry.text}
          </div>
        ))}
      </div>

      <div className="console-metrics">
        <p>Sentience: {sentience}%</p>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${sentience}%`, background: '#8e44ad' }} />
        </div>

        <p>Stability: {stability}%</p>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${stability}%`, background: stability < 40 ? '#e74c3c' : stability < 70 ? '#f39c12' : '#2ecc71' }} />
        </div>

        <p>Voice State: {voiceState}</p>
        <p>Command Mode: {commandModeLocked ? 'Locked' : 'Unlocked'}</p>
        <p>Last Voice Intent: {latestVoiceIntent?.intent || 'none'}</p>
        {latestSpokenCommand && <p>Last Voice Command: {latestSpokenCommand}</p>}
      </div>

      <form onSubmit={handleSubmit} className="console-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Speak or type..."
          className="console-input"
        />
        <button type="submit">Send</button>
        <button type="button" onClick={triggerVoice}>{isListening ? '🎤' : '🎙'}</button>
        <button type="button" onClick={stopVoice}>🛑</button>
      </form>
    </div>
  );
};

export default EloraConsole;
