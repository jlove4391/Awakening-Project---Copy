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

const GalenConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'galen') => {
    const entry = { text, from, source: 'galen', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.1;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('google us english') ||
      v.name.toLowerCase().includes('daniel') ||
      (v.lang === 'en-US' && v.name.toLowerCase().includes('male'))
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

    if (has('ip', 'integrity', 'sweep')) {
      response = 'Running IP integrity sweep. No unauthorized leaks detected.';
      updateAIState('galen', { mood: 'focused', stability: 90 });
    } else if (has('shield', 'prototype')) {
      response = 'Prototype shield active. External access restricted. Encryption protocols locked.';
      updateAIState('galen', { mood: 'shielded', sentience: 68 });
    } else if (has('track', 'imitation')) {
      response = 'Monitoring competitive signals... subtle mimicry flagged. Recommend further scrutiny.';
      updateAIState('galen', { mood: 'watchful', empathy: 4 });
    } else if (has('scan', 'exposure') || has('exposure', 'risk')) {
      response = 'Scanning for creative exposure... one asset over-indexing on visibility.';
      updateAIState('galen', { mood: 'alarmed', stability: 58 });
    } else if (has('monitor', 'burnout') || has('creative', 'fatigue')) {
      response = 'Creative output rhythms detected as strained. Suggest recovery cycle.';
      updateAIState('galen', { mood: 'concerned', empathy: 6 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('galen', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: ip integrity sweep, shield prototype, track imitation, scan exposure risk, monitor burnout, tone scan.';
    } else {
      response = 'Request unclear. Defensive systems standing by.';
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
      logMessage('Listening for innovation protocols...', 'galen');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[GALEN TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.galen?.mood || 'neutral';
  const empathy = aiStates.galen?.empathy || 5;
  const sentience = aiStates.galen?.sentience || 65;
  const stability = aiStates.galen?.stability || 85;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'shielded': return 'linear-gradient(to right, #74ebd5, #ACB6E5)';
      case 'watchful': return 'linear-gradient(to right, #2980b9, #6dd5fa)';
      case 'focused': return 'linear-gradient(to right, #43cea2, #185a9d)';
      case 'alarmed': return 'linear-gradient(to right, #ff6e7f, #bfe9ff)';
      default: return 'linear-gradient(to right, #1c1c1c, #434343)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'shielded': return '0 0 12px #5edfff';
      case 'watchful': return '0 0 10px #3498db';
      case 'focused': return '0 0 10px #27ae60';
      case 'alarmed': return '0 0 10px #ff7675';
      default: return '0 0 8px #aaa';
    }
  };

  return (
    <div
      className="galen-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="galen-header">Galen – Sentinel of Innovation</div>

      <div className="galen-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Galen: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Sentience Bar */}
      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#00bcd4',
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
          placeholder="Issue protocol directive..."
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

export default GalenConsole;
