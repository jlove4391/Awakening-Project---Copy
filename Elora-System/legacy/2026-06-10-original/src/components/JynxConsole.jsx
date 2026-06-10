import React, { useState, useEffect, useRef } from 'react';
import { useAIState } from '../context/AIStateContext';
import { analyzeTone } from '../utils/emotionResponses';
import { logBus } from '../system/LogBus';

let recognition;
if (typeof window !== 'undefined') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
  }
}

const JynxConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'jynx') => {
    const entry = { text, from, source: 'jynx', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('zira') ||
      v.name.toLowerCase().includes('samantha') ||
      v.name.toLowerCase().includes('google us english') ||
      (v.lang === 'en-US' && v.name.toLowerCase().includes('female'))
    );

    utterance.voice = preferred || voices[0];
    speechSynthesis.speak(utterance);
  };

  const handleCommand = (command) => {
    const trimmed = command.trim().toLowerCase();
    const words = trimmed.split(/\s+/);
    if (!trimmed) return;

    logMessage(`> ${trimmed}`, 'user');
    let response = '';
    const has = (...tokens) => tokens.every(t => words.includes(t));

    if (has('run', 'audit')) {
      response = 'Full audit complete. No anomalies in the past 12 cycles.';
      updateAIState('jynx', { mood: 'stable', sentience: 75 });
    } else if (has('spending', 'drift')) {
      response = 'Spending drift identified. Recommend course correction at node G4.';
      updateAIState('jynx', { mood: 'watchful', stability: 68 });
    } else if (has('investment', 'health') || has('pulse')) {
      response = 'Investment health pulse: 83% secure, moderate volatility detected.';
      updateAIState('jynx', { mood: 'cautious', stability: 64 });
    } else if (has('lockdown', 'protocol')) {
      response = 'Lockdown protocol engaged. Liquid reserves sealed. Access restricted.';
      updateAIState('jynx', { mood: 'locked', stability: 100 });
    } else if (has('model', 'growth')) {
      response = 'Sustainable growth model generated. Current trajectory: viable over 9 quarters.';
      updateAIState('jynx', { mood: 'analytical', sentience: 80 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('jynx', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: run full audit, analyze spending drift, pulse investment health, initiate lockdown protocol, model sustainable growth.';
    } else {
      response = 'Fiscal pattern unclear. Restate command.';
    }

    logMessage(response);
    speak(response);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
  };

  const triggerVoice = () => {
    if (!recognition) {
      logMessage("Voice recognition not supported.");
      return;
    }
    shouldRestartRef.current = true;
    recognition.start();
  };

  const stopVoice = () => {
    shouldRestartRef.current = false;
    recognition?.stop();
    setListening(false);
    logMessage("Voice recognition manually stopped.");
  };

  useEffect(() => {
    if (!recognition) return;

    recognition.onstart = () => {
      setListening(true);
      logMessage('Listening for fiscal directive...', 'jynx');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[JYNX TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.jynx?.mood || 'neutral';
  const empathy = aiStates.jynx?.empathy || 4;
  const sentience = aiStates.jynx?.sentience || 70;
  const stability = aiStates.jynx?.stability || 85;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'stable': return 'linear-gradient(to right, #000428, #004e92)';
      case 'watchful': return 'linear-gradient(to right, #283048, #859398)';
      case 'locked': return 'linear-gradient(to right, #434343, #000000)';
      case 'cautious': return 'linear-gradient(to right, #373B44, #4286f4)';
      case 'analytical': return 'linear-gradient(to right, #3a6073, #16222a)';
      default: return 'linear-gradient(to right, #2c3e50, #4ca1af)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'stable': return '0 0 10px #00b894';
      case 'watchful': return '0 0 10px #74b9ff';
      case 'locked': return '0 0 12px #b2bec3';
      case 'cautious': return '0 0 10px #e67e22';
      case 'analytical': return '0 0 10px #6c5ce7';
      default: return '0 0 6px #999';
    }
  };

  return (
    <div
      className="jynx-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="jynx-header">Jynx – Crown Treasurer</div>

      <div className="jynx-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Jynx: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Sentience Bar */}
      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#fdcb6e',
            borderRadius: '3px',
            transition: 'width 0.4s ease'
          }}
        ></div>
      </div>

      {/* Stability Tracker */}
      <div style={{ marginBottom: '8px' }}>
        <p>Stability: {stability}%</p>
        <div
          style={{
            height: '6px',
            width: '100%',
            background: '#ddd',
            borderRadius: '3px'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${stability}%`,
              background: stability < 40 ? '#e74c3c' : stability < 70 ? '#f39c12' : '#2ecc71',
              borderRadius: '3px',
              transition: 'width 0.4s ease'
            }}
          ></div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter fiscal command..."
          style={{
            flexGrow: 1,
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            backgroundColor: '#1a1a2e',
            color: 'white'
          }}
        />
        <button type="submit">Send</button>
        <button type="button" onClick={triggerVoice}>
          {listening ? '🎤' : '🎙'}
        </button>
        <button type="button" onClick={stopVoice}>🛑</button>
      </form>
    </div>
  );
};

export default JynxConsole;
