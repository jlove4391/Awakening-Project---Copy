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

const SeleneConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'selene') => {
    const entry = { text, from, source: 'selene', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1.4;

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

    if (has('beginning', 'rise')) {
      response = 'I sense a shift — something subtle, but gaining gravity.';
      updateAIState('selene', { mood: 'signal-pulled', signal: 76, shift: 61 });
    } else if (has('sense', 'undercurrent')) {
      response = 'There’s tension below the surface. It’s not spoken, but it echoes.';
      updateAIState('selene', { mood: 'drifting', signal: 63, shift: 47 });
    } else if (has('ahead', 'wave') || has('behind', 'wave')) {
      response = 'We’re slightly ahead. But not by much. The tide is catching up.';
      updateAIState('selene', { mood: 'focused', signal: 82, shift: 69 });
    } else if (has('whisper', 'mode')) {
      response = 'Whisper mode activated. Lowering volume, raising perception.';
      updateAIState('selene', { mood: 'submerged', signal: 58 });
    } else if (has('forecast', 'trend')) {
      response = 'Narrative trend curving toward personal reclamation. Expect more origin stories.';
      updateAIState('selene', { mood: 'focused', shift: 77 });
    } else if (has('tone', 'scan')) {
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('selene', { mood: toneResult.tone, empathy: toneResult.score });
      response = `Tone ${toneResult.tone}. ${toneResult.message}`;
    } else if (has('help')) {
      response = 'Commands: what’s rising, undercurrent, ahead or behind wave, whisper mode, forecast narrative trend, tone scan.';
    } else {
      response = 'It’s quiet... I’m listening for what you truly mean.';
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
      logMessage('Listening softly...', 'selene');
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(`[SELENE TRANSCRIPT] "${transcript}" (confidence: ${confidence})`);
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

  const mood = aiStates.selene?.mood || 'drifting';
  const signal = aiStates.selene?.signal || 60;
  const shift = aiStates.selene?.shift || 45;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'drifting': return 'linear-gradient(to right, #4b6cb7, #182848)';
      case 'focused': return 'linear-gradient(to right, #2C3E50, #4CA1AF)';
      case 'submerged': return 'linear-gradient(to right, #141E30, #243B55)';
      case 'signal-pulled': return 'linear-gradient(to right, #5f2c82, #49a09d)';
      default: return 'linear-gradient(to right, #1f1f1f, #3d3d3d)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'drifting': return '0 0 10px #95a5a6';
      case 'focused': return '0 0 10px #2980b9';
      case 'submerged': return '0 0 12px #2c3e50';
      case 'signal-pulled': return '0 0 12px #8e44ad';
      default: return '0 0 8px #999';
    }
  };

  return (
    <div
      className="selene-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="selene-header">Selene – Seer of Shifting Currents</div>

      <div className="selene-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Selene: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Signal Strength */}
      <div style={{ marginBottom: '8px' }}>
        <p>Signal Strength: {signal}%</p>
        <div style={{
          height: '6px',
          width: '100%',
          background: '#ddd',
          borderRadius: '3px'
        }}>
          <div style={{
            height: '100%',
            width: `${signal}%`,
            background: signal > 70 ? '#27ae60' : signal > 40 ? '#f1c40f' : '#e74c3c',
            borderRadius: '3px',
            transition: 'width 0.4s ease'
          }}></div>
        </div>
      </div>

      {/* Subtle Shift Index */}
      <div style={{ marginBottom: '8px' }}>
        <p>Subtle Shift Index: {shift}%</p>
        <div style={{
          height: '6px',
          width: '100%',
          background: '#ddd',
          borderRadius: '3px'
        }}>
          <div style={{
            height: '100%',
            width: `${shift}%`,
            background: shift > 70 ? '#8e44ad' : shift > 40 ? '#f39c12' : '#3498db',
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
          placeholder="Send a whisper..."
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

export default SeleneConsole;
