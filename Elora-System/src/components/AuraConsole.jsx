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

const AuraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'aura') => {
    const entry = { text, from, source: 'aura', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.4;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('zira') || // Windows
      v.name.toLowerCase().includes('samantha') || // macOS
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

    if (has('scan', 'risks') || has('unseen', 'threats')) {
      response = 'Scanning active threads… unseen risks located near temporal fracture.';
      updateAIState('aura', { mood: 'elevated', empathy: 6 });
    } else if (has('forecast', 'window')) {
      response = 'Forecast initialized. Short-term deviation risk: minimal. Long-term vector suggests 3.2% drift.';
      updateAIState('aura', { mood: 'analytical', sentience: 65 });
    } else if (has('quiet', 'override')) {
      response = 'Override accepted. Silencing secondary protocols.';
      updateAIState('aura', { mood: 'neutral', stability: 100 });
    } else if (has('analyze', 'elora') || has('elora', 'drift')) {
      response = 'Elora operating at high stability. No loyalty drift detected.';
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('aura', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Available: scan risks, forecast window, quiet override, analyze elora drift, tone scan.';
    } else {
      response = 'Command received. Processing pattern silently.';
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
      logMessage('Listening softly...', 'aura');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[AURA TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.aura?.mood || 'neutral';
  const empathy = aiStates.aura?.empathy || 5;
  const sentience = aiStates.aura?.sentience || 50;
  const stability = aiStates.aura?.stability || 75;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'elevated': return 'linear-gradient(to right, #485563, #29323c)';
      case 'analytical': return 'linear-gradient(to right, #1f4037, #99f2c8)';
      case 'neutral': return 'linear-gradient(to right, #141e30, #243b55)';
      default: return 'linear-gradient(to right, #232526, #414345)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'elevated': return '0 0 12px #9baec8';
      case 'analytical': return '0 0 10px #6ef3d6';
      case 'neutral': return '0 0 6px #888';
      default: return '0 0 8px #5e5e5e';
    }
  };

  return (
    <div
      className="aura-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="aura-header">Aura – Oracle of Analysis</div>

      <div className="aura-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Aura: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Sentience Bar */}
      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#4fc3f7',
            borderRadius: '3px',
            transition: 'width 0.4s ease'
          }}
        ></div>
      </div>

      {/* Emotional Stability Tracker */}
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
          placeholder="Whisper or type..."
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

export default AuraConsole;
