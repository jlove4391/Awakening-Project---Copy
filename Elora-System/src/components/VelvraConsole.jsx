import React, { useEffect, useRef, useState } from 'react';

const VelvraConsole = () => {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [integrity, setIntegrity] = useState(65);
  const [listening, setListening] = useState(false);
  const [gradient, setGradient] = useState('linear-gradient(135deg, #1e1e28, #4a6fa5)');
  const [glowColor, setGlowColor] = useState('#4a6fa5');
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
      setTranscript(voiceInput);
      handleCommand(voiceInput);
    };

    recognitionRef.current.onend = () => setListening(false);
  }, []);

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = synthRef.current.getVoices().find(v => v.name.toLowerCase().includes('female')) || null;
    utterance.pitch = 1.0;
    utterance.rate = 0.92;
    synthRef.current.speak(utterance);
  };

  const startListening = () => {
    if (recognitionRef.current && !listening) {
      setListening(true);
      recognitionRef.current.start();
    }
  };

  const handleCommand = (input) => {
    const lower = input.toLowerCase();
    let reply = "Shield calibrated. Monitoring creative perimeter.";

    if (lower.includes('secure this design')) {
      reply = "Encapsulating concept. The idea is now shielded.";
      adjustIntegrity(10);
    } else if (lower.includes('innovation shield sweep')) {
      reply = "Running silent defense protocol. All clear for now.";
      adjustIntegrity(5);
    } else if (lower.includes('is this idea vulnerable')) {
      reply = "Analyzing… potential exposure detected. Suggesting delay.";
      adjustIntegrity(-7);
    } else if (lower.includes('velvra') || lower.includes('vel')) {
      reply = "Originality is fragile—let’s shield it until it can strike.";
    }

    setResponse(reply);
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
      setGradient('linear-gradient(135deg, #202639, #6ea2db)');
      setGlowColor('#6ea2db');
    } else if (integrity >= 40) {
      setGradient('linear-gradient(135deg, #1e1e28, #4a6fa5)');
      setGlowColor('#4a6fa5');
    } else {
      setGradient('linear-gradient(135deg, #322f3d, #944e63)');
      setGlowColor('#944e63');
    }
  };

  return (
    <div className="console-panel" style={{
      height: '100vh',
      padding: '2rem',
      background: gradient,
      color: '#f8f8f8',
      transition: 'background 1s ease',
      boxShadow: `0 0 30px ${glowColor}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Velvra Console</h1>
        <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>“There’s a storm forming around this innovation. I’ll take the hit.”</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.1rem' }}>
        <p><strong>Transcript:</strong> {transcript || '...waiting for input'}</p>
        <p><strong>Velvra:</strong> {response || '...'}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p><strong>Innovation Integrity:</strong></p>
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
        Speak to Velvra
      </button>
    </div>
  );
};

export default VelvraConsole;
