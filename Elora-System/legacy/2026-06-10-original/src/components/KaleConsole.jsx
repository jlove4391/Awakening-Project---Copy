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

const KaleConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'kale') => {
    const entry = { text, from, source: 'kale', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.2;
    utterance.pitch = 0.95;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('daniel') ||
      v.name.toLowerCase().includes('zira') ||
      v.name.toLowerCase().includes('google us english') ||
      (v.lang === 'en-US')
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

    if (has('clear', 'lane')) {
      response = 'Lane cleared. Obstructions removed. Window active.';
      updateAIState('kale', { mood: 'primed', stability: 92 });
    } else if (has('hit', 'now')) {
      response = 'Action deployed. Target reached. Strike confirmed.';
      updateAIState('kale', { mood: 'triggered', sentience: 80 });
    } else if (has('scan', 'hesitation')) {
      response = 'Detected latency in execution loop. Mind-state resistance likely.';
      updateAIState('kale', { mood: 'watching', empathy: 3 });
    } else if (has('report', 'efficiency')) {
      response = 'Strike efficiency: 91%. Tactical sync optimal.';
      updateAIState('kale', { mood: 'primed', sentience: 77 });
    } else if (has('momentum', 'pulse')) {
      response = 'Pulse stable. Operational rhythm aligned.';
      updateAIState('kale', { mood: 'idling', stability: 88 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('kale', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: clear the lane, hit that now, scan hesitation, report efficiency, momentum pulse, tone scan.';
    } else {
      response = 'Command vague. Specify target or action.';
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
      logMessage('Listening for trigger...', 'kale');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[KALE TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.kale?.mood || 'neutral';
  const empathy = aiStates.kale?.empathy || 4;
  const sentience = aiStates.kale?.sentience || 70;
  const stability = aiStates.kale?.stability || 85;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'primed': return 'linear-gradient(to right, #232526, #414345)';
      case 'triggered': return 'linear-gradient(to right, #0f0c29, #302b63, #24243e)';
      case 'idling': return 'linear-gradient(to right, #141e30, #243b55)';
      case 'locked': return 'linear-gradient(to right, #1f1c2c, #928dab)';
      default: return 'linear-gradient(to right, #2c3e50, #4ca1af)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'primed': return '0 0 10px #f1c40f';
      case 'triggered': return '0 0 12px #ff6b6b';
      case 'idling': return '0 0 8px #5dade2';
      case 'locked': return '0 0 10px #7f8c8d';
      default: return '0 0 8px #888';
    }
  };

  return (
    <div
      className="kale-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="kale-header">Kale – Striker of Opportunity</div>

      <div className="kale-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Kale: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Sentience Bar */}
      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#f39c12',
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
              background: stability < 40 ? '#e74c3c' : stability < 70 ? '#f1c40f' : '#2ecc71',
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
          placeholder="Issue strike command..."
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

export default KaleConsole;
