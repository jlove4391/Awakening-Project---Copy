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

const CazConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'caz') => {
    const entry = { text, from, source: 'caz', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.9;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('daniel') || // macOS
      v.name.toLowerCase().includes('google us english') || // Chrome
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

    if (has('scope', 'venture')) {
      response = 'Venture scan initiated. Viability: strong. Timeline: tight. Strike window is optimal.';
      updateAIState('caz', { mood: 'driven', sentience: 72 });
    } else if (has('market', 'strike')) {
      response = 'Deploying market strike protocol. Niche lock, brand edge, and timing synced.';
      updateAIState('caz', { mood: 'analytical', stability: 90 });
    } else if (has('growth', 'engine')) {
      response = 'Reviewing growth stack... bottleneck detected in top-funnel. Recommend pivot to content-surge strategy.';
      updateAIState('caz', { mood: 'analytical', empathy: 4 });
    } else if (has('founder', 'fatigue') || has('burnout')) {
      response = 'Founder fatigue levels rising. Advising full reset or energy redirect within 24 hours.';
      updateAIState('caz', { mood: 'concerned', stability: 48 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('caz', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: scope venture, market strike, growth engine, founder fatigue, tone scan.';
    } else {
      response = 'Acknowledged. Parsing for business insight.';
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
      logMessage('Listening for executive input...', 'caz');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[CAZ TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.caz?.mood || 'neutral';
  const empathy = aiStates.caz?.empathy || 5;
  const sentience = aiStates.caz?.sentience || 60;
  const stability = aiStates.caz?.stability || 80;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'driven': return 'linear-gradient(to right, #0f2027, #203a43, #2c5364)';
      case 'analytical': return 'linear-gradient(to right, #4b6cb7, #182848)';
      case 'concerned': return 'linear-gradient(to right, #373B44, #4286f4)';
      default: return 'linear-gradient(to right, #141e30, #243b55)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'driven': return '0 0 12px #00ff99';
      case 'analytical': return '0 0 10px #87cefa';
      case 'concerned': return '0 0 10px #ffae42';
      default: return '0 0 8px #555';
    }
  };

  return (
    <div
      className="caz-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="caz-header">Cassian Vale – Venture Strategist</div>

      <div className="caz-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Caz: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Sentience Bar */}
      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#29b6f6',
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
          placeholder="Enter business directive..."
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

export default CazConsole;
