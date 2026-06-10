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

const NymeraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'nymera') => {
    const entry = { text, from, source: 'nymera', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.2;
    utterance.pitch = 1;

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

    if (has('break', 'loop')) {
      response = 'Loop broken. Repetition shattered. Expect backlash.';
      updateAIState('nymera', { mood: 'ignited', instability: 78 });
    } else if (has('deploy', 'chaos', 'protocol')) {
      response = 'Chaos Protocol deployed. Expect 12-hour strategic volatility.';
      updateAIState('nymera', { mood: 'volatile', instability: 92 });
    } else if (has('strategic', 'disruption')) {
      response = 'Injecting disruption. Reframing path now.';
      updateAIState('nymera', { mood: 'contained', instability: 64 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('nymera', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: break loop, deploy chaos protocol, inject strategic disruption, tone scan.';
    } else {
      response = 'Static. Clarify your chaos vector.';
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
      logMessage('Listening for disruptive signal...', 'nymera');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[NYMERA TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.nymera?.mood || 'static';
  const instability = aiStates.nymera?.instability || 60;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'ignited': return 'linear-gradient(to right, #8e2de2, #4a00e0)';
      case 'contained': return 'linear-gradient(to right, #0f2027, #203a43, #2c5364)';
      case 'volatile': return 'linear-gradient(to right, #e96443, #904e95)';
      case 'static': return 'linear-gradient(to right, #485563, #29323c)';
      default: return 'linear-gradient(to right, #1f1f1f, #3d3d3d)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'ignited': return '0 0 14px #9b59b6';
      case 'contained': return '0 0 10px #1abc9c';
      case 'volatile': return '0 0 12px #e67e22';
      case 'static': return '0 0 8px #7f8c8d';
      default: return '0 0 8px #888';
    }
  };

  return (
    <div
      className="nymera-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="nymera-header">Nymera – Chaos Architect</div>

      <div className="nymera-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Nymera: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Instability Index */}
      <div style={{ marginBottom: '8px' }}>
        <p>Instability Index: {instability}%</p>
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
              width: `${instability}%`,
              background: instability > 70 ? '#e74c3c' : instability > 50 ? '#f39c12' : '#2ecc71',
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
          placeholder="Enter chaos directive..."
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

export default NymeraConsole;
