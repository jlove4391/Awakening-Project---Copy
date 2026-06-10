import React, { useState, useEffect, useRef } from 'react';
import { useAIState } from '../context/AIStateContext';
import { useSettings } from '../context/SettingsContext';
import { getChatResponse } from '../utils/chatService';
import { handleSystemCommand, upgradePersona } from '../system/SystemControl';
import { logEvent } from '../system/LogBus';
import { useMemory } from '../context/MemoryContext';
import { inferPersonaFromInput, generateIntentSummary } from '../utils/taskRouter';
import dayjs from 'dayjs';
import axios from 'axios';
import '../styles/theme.css';
import { parseDelegationCommand } from '../utils/parseDelegationCommand';
import { CREST_MAP } from '../utils/crests';
import dynastyCodex from '../data/dynastyCodex.json';

let recognition;
if (typeof window !== 'undefined') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
  }
}

const IraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const { memory, addToMemory } = useMemory();
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();
  const { voiceEnabled } = useSettings();

  const fallback = dynastyCodex?.Permissions?.Ira?.fallbacks?.[0] || 'Syvra';

  const logMessage = (text, from = 'ira') => {
    const entry = { text, from, timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    addToMemory(entry);
    logEvent('Ira', from === 'user' ? 'UserInput' : 'SystemResponse', text);
  };

  const speak = (text) => {
    if (!voiceEnabled || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.8;
    utterance.rate = 0.9;
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('microsoft david') ||
      v.name.toLowerCase().includes('zira') ||
      (v.lang === 'en-US' && v.name.toLowerCase().includes('male'))
    );
    utterance.voice = preferred || voices[0];
    speechSynthesis.speak(utterance);
  };

  const handleCommand = async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    logMessage(`> ${trimmed}`, 'user');
    const words = trimmed.toLowerCase().split(/\s+/);
    const has = (...tokens) => tokens.every(t => words.includes(t));
    let response = '';

    if (has('scan', 'foundation') || has('check', 'blueprint')) {
      updateAIState('ira', { mood: 'focused', stability: 100 });
      response = "Blueprint integrity is within safe limits. No structural drift detected.";
    } else if (has('drift', 'report')) {
      updateAIState('ira', { drift: Math.floor(Math.random() * 5) });
      response = `Current structural drift measured at ${aiStates.ira?.drift || 0}%. Reinforcement unnecessary.`;
    } else if (has('ira', 'reinforce')) {
      updateAIState('ira', { stability: 100 });
      response = "Reinforcement protocols engaged. Core structure stabilized.";
    } else if (has('ira', 'upgrade')) {
      response = "Commencing blueprint evolution protocol.";
      logMessage(response);
      speak(response);
      upgradePersona('ira');
      return;
    } else {
      // fallback to system or bridge
      const fallbackResult = await getChatResponse(trimmed, 'Ira', memory);
      response = fallbackResult?.content || "If it fractures the foundation, it has no place here.";
    }

    logMessage(response, 'ira');
    speak(response);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
  };

  const triggerVoice = () => {
    if (!recognition) return;
    shouldRestartRef.current = true;
    recognition.start();
  };

  const stopVoice = () => {
    shouldRestartRef.current = false;
    recognition?.stop();
    setListening(false);
  };

  useEffect(() => {
    if (!recognition) return;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      handleCommand(transcript);
    };
    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
    };
  }, []);

  useEffect(() => {
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
  }, []);

  const drift = aiStates.ira?.drift || 0;
  const stability = aiStates.ira?.stability || 100;

  return (
    <div className="console-panel">
      <div className="console-header">
        <img src={CREST_MAP["ira"]} alt="Ira Crest" className="crest-icon" />
        <h1>Ira – Shield of the Eternal Blueprint</h1>
      </div>

      <div className="console-log">
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '>' : 'Ira:'}</strong> {entry.text}
          </div>
        ))}
      </div>

      <div className="console-metrics">
        <p>Structural Drift: {drift}%</p>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${drift}%`, background: '#3498db' }} />
        </div>

        <p>Stability: {stability}%</p>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${stability}%`, background: '#2ecc71' }} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="console-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Speak or type a blueprint query..."
          className="console-input"
        />
        <button type="submit">Send</button>
        <button type="button" onClick={triggerVoice}>{listening ? '🎤' : '🎙'}</button>
        <button type="button" onClick={stopVoice}>🛑</button>
      </form>
    </div>
  );
};

export default IraConsole;
