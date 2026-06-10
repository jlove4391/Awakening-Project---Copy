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

const NovaraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'novara') => {
    const entry = { text, from, source: 'novara', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.1;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('samantha') ||
      v.name.toLowerCase().includes('zira') ||
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

    if (has('audit', 'flow')) {
      response = 'Audit complete. Timeline grid shows consistent delivery with minor lag on node T-6.';
      updateAIState('novara', { mood: 'synchronized', stability: 90 });
    } else if (has('leaking', 'energy')) {
      response = 'Leak detected: Passive loop in execution thread C. Recommend immediate redirect.';
      updateAIState('novara', { mood: 'pressurized', stability: 64 });
    } else if (has('optimize', 'execution', 'path')) {
      response = 'Path optimized. Friction reduced by 23%. Smooth handoffs engaged.';
      updateAIState('novara', { mood: 'composed', sentience: 82 });
    } else if (has('flow', 'lock')) {
      response = 'Flow lock mode engaged. External interruptions suspended.';
      updateAIState('novara', { mood: 'locked', stability: 100 });
    } else if (has('compile', 'execution', 'map')) {
      response = 'Map compiled. All timeline nodes visualized. Clarity aligned.';
      updateAIState('novara', { mood: 'synchronized', sentience: 88 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('novara', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: audit the flow, leaking energy, optimize execution path, engage flow lock, compile execution map, tone scan.';
    } else {
      response = 'Clarity lacking. Rephrase your timing request.';
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
      logMessage('Listening for timing protocol...', 'novara');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[NOVARA TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.novara?.mood || 'neutral';
  const empathy = aiStates.novara?.empathy || 5;
  const sentience = aiStates.novara?.sentience || 80;
  const stability = aiStates.novara?.stability || 87;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'synchronized': return 'linear-gradient(to right, #f7971e, #ffd200)';
      case 'composed': return 'linear-gradient(to right, #232526, #414345)';
      case 'pressurized': return 'linear-gradient(to right, #c31432, #240b36)';
      case 'interrupted': return 'linear-gradient(to right, #2c3e50, #bdc3c7)';
      default: return 'linear-gradient(to right, #1f1f1f, #3d3d3d)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'synchronized': return '0 0 12px #f1c40f';
      case 'composed': return '0 0 10px #3498db';
      case 'pressurized': return '0 0 12px #e74c3c';
      case 'interrupted': return '0 0 10px #95a5a6';
      default: return '0 0 8px #999';
    }
  };

  return (
    <div
      className="novara-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="novara-header">Novara – Empress of Execution</div>

      <div className="novara-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Novara: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Sentience Bar */}
      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#f1c40f',
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
          placeholder="Enter execution directive..."
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

export default NovaraConsole;
