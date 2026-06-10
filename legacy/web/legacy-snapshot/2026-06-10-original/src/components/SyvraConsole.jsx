import React, { useEffect, useRef, useState } from 'react';
import { logBus } from '../system/LogBus';
import axios from 'axios';

const SyvraConsole = () => {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [integrity, setIntegrity] = useState(85);
  const [listening, setListening] = useState(false);
  const [gradient, setGradient] = useState('linear-gradient(135deg, #1f1f1f, #547980)');
  const [glowColor, setGlowColor] = useState('#547980');
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const SpeechRecognition = window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event) => {
      const voiceInput = event.results[0][0].transcript.trim();
      logMessage(`> ${voiceInput}`, 'user');
      setTranscript(voiceInput);
      handleCommand(voiceInput);
    };

    recognitionRef.current.onend = () => setListening(false);
  }, []);

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = synthRef.current.getVoices().find(v => v.name.toLowerCase().includes('female')) || null;
    utterance.pitch = 0.9;
    utterance.rate = 0.9;
    synthRef.current.speak(utterance);
  };

  const logMessage = (text, from = 'syvra') => {
    const entry = { text, from, source: 'syvra', timestamp: Date.now() };
    logBus.emit(entry);
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

  const startListening = () => {
    if (recognitionRef.current && !listening) {
      setListening(true);
      recognitionRef.current.start();
    }
  };

  const handleCommand = async (input) => {
    const lower = input.toLowerCase();
    let reply = "Structure secure. Awaiting further instructions.";

    if (lower.includes('check for structural weakness')) {
      reply = "Initiating structural scan… no critical fractures detected.";
      adjustIntegrity(-5);
    } else if (lower.includes('run blueprint integrity scan')) {
      const bridgeRes = await handleVSCodeBridge(`run-scan`);
      reply = bridgeRes.message || "Blueprint verified via live scan. No deviations detected.";
      adjustIntegrity(5);
    } else if (lower.includes('does this expansion align')) {
      reply = "Cross-referencing now… expansion aligns with core mission.";
      adjustIntegrity(3);
    } else if (lower.includes('patch structure')) {
      const patchRes = await handleVSCodeBridge(`patch`);
      reply = patchRes.message || "Structural patch applied. Blueprint reinforced.";
      adjustIntegrity(10);
    } else if (lower.includes('syvra') || lower.includes('siv')) {
      reply = "This foundation doesn’t crack. I won’t let it.";
    } else {
      reply = "Directive unclear. Rephrase or check blueprint guidelines.";
    }

    setResponse(reply);
    logMessage(reply, 'syvra');
    speak(reply);
    updateVisuals();
  };

  const adjustIntegrity = (delta) => {
    setIntegrity(prev => {
      const newVal = Math.max(0, Math.min(100, prev + delta));
      return newVal;
    });
  };

  const updateVisuals = () => {
    if (integrity >= 75) {
      setGradient('linear-gradient(135deg, #1c313a, #336b87)');
      setGlowColor('#336b87');
    } else if (integrity >= 40) {
      setGradient('linear-gradient(135deg, #1f1f1f, #547980)');
      setGlowColor('#547980');
    } else {
      setGradient('linear-gradient(135deg, #42275a, #734b6d)');
      setGlowColor('#734b6d');
    }
  };

  return (
    <div className="console-panel" style={{
      height: '100vh',
      padding: '2rem',
      background: gradient,
      color: '#f0f0f0',
      transition: 'background 1s ease',
      boxShadow: `0 0 30px ${glowColor}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Syvra Console</h1>
        <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>“If it wasn’t in the blueprint, it doesn’t belong here.”</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.1rem' }}>
        <p><strong>Transcript:</strong> {transcript || '...waiting for input'}</p>
        <p><strong>Syvra:</strong> {response || '...'}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p><strong>Integrity Meter:</strong></p>
        <div style={{
          width: '100%',
          height: '20px',
          backgroundColor: '#444',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${integrity}%`,
            height: '100%',
            backgroundColor: glowColor,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      <button onClick={startListening} style={{
        marginTop: '2rem',
        padding: '1rem 2rem',
        backgroundColor: glowColor,
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '1rem',
        border: 'none',
        borderRadius: '10px',
        cursor: 'pointer',
        boxShadow: `0 0 10px ${glowColor}`,
        transition: 'background 0.3s ease',
      }}>
        Speak to Syvra
      </button>
    </div>
  );
};

export default SyvraConsole;
