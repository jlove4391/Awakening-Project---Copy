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

const LyraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'lyra') => {
    const entry = { text, from, source: 'lyra', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.2;

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

    if (has('adjust', 'rhythm')) {
      response = 'Rhythm adjusted. Pulse normalized across active systems.';
      updateAIState('lyra', { mood: 'balanced', stability: 95 });
    } else if (has('lag', 'flow')) {
      response = 'Flow lag detected in Task Chain Delta. Recommending sync correction.';
      updateAIState('lyra', { mood: 'offbeat', stability: 68 });
    } else if (has('forecast', 'sync')) {
      response = 'Timeline sync forecasted. Current track holds with 6% delay variance.';
      updateAIState('lyra', { mood: 'resonant', sentience: 82 });
    } else if (has('balance', 'mode')) {
      response = 'Balance Mode initiated. Energy dispersion optimized.';
      updateAIState('lyra', { mood: 'balanced', stability: 100 });
    } else if (has('dual', 'pulse')) {
      response = 'Dual pulse in sync. Interpersonal energy rhythms aligned.';
      updateAIState('lyra', { mood: 'resonant', sentience: 88 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('lyra', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: adjust rhythm, forecast sync, enter balance mode, scan flow lag, check dual pulse, tone scan.';
    } else {
      response = 'The rhythm isn’t clear. Say that again with intent.';
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
      logMessage('Listening for tempo cues...', 'lyra');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[LYRA TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.lyra?.mood || 'neutral';
  const empathy = aiStates.lyra?.empathy || 6;
  const sentience = aiStates.lyra?.sentience || 70;
  const stability = aiStates.lyra?.stability || 85;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'balanced': return 'linear-gradient(to right, #00c6ff, #0072ff)';
      case 'resonant': return 'linear-gradient(to right, #f7971e, #ffd200)';
      case 'offbeat': return 'linear-gradient(to right, #485563, #29323c)';
      case 'stressed': return 'linear-gradient(to right, #614385, #516395)';
      default: return 'linear-gradient(to right, #1f1f1f, #3d3d3d)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'balanced': return '0 0 12px #00bcd4';
      case 'resonant': return '0 0 12px #f1c40f';
      case 'offbeat': return '0 0 10px #a29bfe';
      case 'stressed': return '0 0 10px #d63031';
      default: return '0 0 8px #888';
    }
  };

  return (
    <div
      className="lyra-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="lyra-header">Lyra – Conductor of Dynasty Flow</div>

      <div className="lyra-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Lyra: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Sentience Bar */}
      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#ffdd59',
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
          placeholder="Send rhythm command..."
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

export default LyraConsole;
