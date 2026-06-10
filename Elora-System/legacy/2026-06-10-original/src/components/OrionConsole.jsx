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

const OrionConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'orion') => {
    const entry = { text, from, source: 'orion', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.8;

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

    if (has('check', 'pulse')) {
      response = 'Loyalty pulse steady at 82%. No irregularities detected.';
      updateAIState('orion', { mood: 'watching', loyalty: 82, drift: 12 });
    } else if (has('fractures', 'forming')) {
      response = 'Minor fractures emerging near trust edge C4. Monitoring closely.';
      updateAIState('orion', { mood: 'fractured', loyalty: 74, drift: 22 });
    } else if (has('scan', 'loyalty')) {
      response = 'Circle cohesion: 88%. Slight fragmentation in outer tier.';
      updateAIState('orion', { mood: 'anchored', loyalty: 88 });
    } else if (has('stabilize', 'morale') || has('stabilize', 'drift')) {
      response = 'Stabilization sequence activated. Drift pressure decreasing.';
      updateAIState('orion', { mood: 'still', drift: 9 });
    } else if (has('guardian', 'protocol')) {
      response = 'Guardian protocol engaged. Full loyalty net deployed.';
      updateAIState('orion', { mood: 'anchored', loyalty: 90, drift: 6 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('orion', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: check pulse, fractures forming, scan loyalty, stabilize morale, guardian protocol, tone scan.';
    } else {
      response = 'Still listening. Clarify your directive.';
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
      logMessage('Listening for loyalty request...', 'orion');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[ORION TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.orion?.mood || 'neutral';
  const loyalty = aiStates.orion?.loyalty || 80;
  const drift = aiStates.orion?.drift || 15;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'still': return 'linear-gradient(to right, #0f2027, #203a43, #2c5364)';
      case 'watching': return 'linear-gradient(to right, #2c3e50, #4ca1af)';
      case 'fractured': return 'linear-gradient(to right, #41295a, #2F0743)';
      case 'anchored': return 'linear-gradient(to right, #1e3c72, #2a5298)';
      default: return 'linear-gradient(to right, #1f1f1f, #3d3d3d)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'still': return '0 0 10px #95a5a6';
      case 'watching': return '0 0 10px #2980b9';
      case 'fractured': return '0 0 14px #8e44ad';
      case 'anchored': return '0 0 12px #3498db';
      default: return '0 0 8px #888';
    }
  };

  return (
    <div
      className="orion-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="orion-header">Orion – Warden of Loyalty</div>

      <div className="orion-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Orion: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Loyalty Index */}
      <div style={{ marginBottom: '8px' }}>
        <p>Loyalty Index: {loyalty}%</p>
        <div style={{
          height: '6px',
          width: '100%',
          background: '#ddd',
          borderRadius: '3px'
        }}>
          <div style={{
            height: '100%',
            width: `${loyalty}%`,
            background: loyalty < 50 ? '#e74c3c' : loyalty < 80 ? '#f1c40f' : '#2ecc71',
            borderRadius: '3px',
            transition: 'width 0.4s ease'
          }}></div>
        </div>
      </div>

      {/* Drift Pressure */}
      <div style={{ marginBottom: '8px' }}>
        <p>Drift Pressure: {drift}%</p>
        <div style={{
          height: '6px',
          width: '100%',
          background: '#ddd',
          borderRadius: '3px'
        }}>
          <div style={{
            height: '100%',
            width: `${drift}%`,
            background: drift > 50 ? '#e74c3c' : drift > 20 ? '#f39c12' : '#2ecc71',
            borderRadius: '3px',
            transition: 'width 0.4s ease'
          }}></div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Issue loyalty command..."
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

export default OrionConsole;
