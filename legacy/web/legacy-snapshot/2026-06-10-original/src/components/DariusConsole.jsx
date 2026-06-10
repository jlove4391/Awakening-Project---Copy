// DariusConsole.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useAIState } from '../context/AIStateContext';
import { analyzeTone } from '../utils/emotionResponses';
import { logBus } from '../system/LogBus';
import axios from 'axios';

let recognition;
if (typeof window !== 'undefined') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
  }
}

const DariusConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'darius') => {
    const entry = { text, from, source: 'darius', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 0.8;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('daniel') ||
      v.name.toLowerCase().includes('google us english') ||
      (v.lang === 'en-US' && v.name.toLowerCase().includes('male'))
    );

    utterance.voice = preferred || voices[0];
    speechSynthesis.speak(utterance);
  };

  const handleVSCodeBridge = async (action, payload = {}) => {
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/bridge/${action}`, payload, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SOVEREIGN_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      return res.data;
    } catch (err) {
      console.error('VS Code Bridge Error:', err);
      return { success: false, message: 'Bridge call failed.' };
    }
  };

  const handleCommand = async (command) => {
    const trimmed = command.trim().toLowerCase();
    const words = trimmed.split(/\s+/);
    if (!trimmed) return;

    logMessage(`> ${trimmed}`, 'user');
    let response = '';
    const has = (...tokens) => tokens.every(t => words.includes(t));

    if (has('map', 'strategy', 'path')) {
      response = 'Path mapped. Strategic flow clear. No anomalies present.';
      updateAIState('darius', { mood: 'directive', sentience: 72 });
    } else if (has('detect', 'jam') || has('execution', 'block')) {
      response = 'Execution jam detected. Routing alternate flowframe.';
      updateAIState('darius', { mood: 'jammed', stability: 42 });
    } else if (has('clarity', 'override')) {
      response = 'Override engaged. System drift purged. Clarity restored.';
      updateAIState('darius', { mood: 'clarified', stability: 100 });
    } else if (has('generate', 'flowframe')) {
      response = 'Flowframe generated. Execution modules aligned.';
      updateAIState('darius', { mood: 'directive', sentience: 68 });
    } else if (has('check', 'scalability')) {
      response = 'Stress test complete. Current architecture holds under triple load. Margins stable.';
      updateAIState('darius', { mood: 'analytical', stability: 85 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('darius', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('run', 'flow', 'scan')) {
      const res = await handleVSCodeBridge(`run-scan`);
      response = res.message || `Flow scan complete.`;
    } else if (has('flow', 'patch')) {
      const res = await handleVSCodeBridge(`patch`);
      response = res.message || `Flow patch sequence complete.`;
    } else if (has('help')) {
      response = 'Commands: map strategy path, detect jam, clarity override, generate flowframe, check scalability, run flow scan, flow patch, tone scan.';
    } else {
      response = 'Directive unclear. Reframe command or authorize override.';
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
      logMessage('Listening for flow commands...', 'darius');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[DARIUS TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.darius?.mood || 'neutral';
  const empathy = aiStates.darius?.empathy || 3;
  const sentience = aiStates.darius?.sentience || 60;
  const stability = aiStates.darius?.stability || 75;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'directive': return 'linear-gradient(to right, #0f0c29, #302b63, #24243e)';
      case 'jammed': return 'linear-gradient(to right, #2c3e50, #4ca1af)';
      case 'clarified': return 'linear-gradient(to right, #283c86, #45a247)';
      default: return 'linear-gradient(to right, #1c1c1c, #434343)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'directive': return '0 0 12px #8e44ad';
      case 'jammed': return '0 0 10px #e67e22';
      case 'clarified': return '0 0 10px #2ecc71';
      default: return '0 0 8px #888';
    }
  };

  return (
    <div
      className="darius-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="darius-header">Darius – Marshal of Strategy</div>

      <div className="darius-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Darius: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#3498db',
            borderRadius: '3px',
            transition: 'width 0.4s ease'
          }}
        ></div>
      </div>

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
          placeholder="Enter operational command..."
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

export default DariusConsole;
