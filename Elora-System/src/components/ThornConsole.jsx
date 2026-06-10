import React, { useEffect, useRef, useState } from 'react';

const ThornConsole = () => {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [opportunity, setOpportunity] = useState(40);
  const [listening, setListening] = useState(false);
  const [gradient, setGradient] = useState('linear-gradient(135deg, #1e1e1e, #2e8a59)');
  const [glowColor, setGlowColor] = useState('#2e8a59');
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
    utterance.voice = synthRef.current.getVoices().find(v => v.name.toLowerCase().includes('male')) || null;
    utterance.pitch = 0.95;
    utterance.rate = 0.95;
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
    let reply = "Scanning... something’s brewing under the surface.";

    if (lower.includes('what’s emerging')) {
      reply = "I’ve seen something. It’s early—but it’s real.";
      adjustOpportunity(10);
    } else if (lower.includes('quiet goldmine')) {
      reply = "Quiet paths lead to loud payoffs. I’ll mark it.";
      adjustOpportunity(15);
    } else if (lower.includes('new territory')) {
      reply = "Mapping the fringe... a pulse is forming.";
      adjustOpportunity(7);
    } else if (lower.includes('thorn')) {
      reply = "I don’t guess. I scout. Then I strike.";
    }

    setResponse(reply);
    speak(reply);
    updateVisuals();
  };

  const adjustOpportunity = (delta) => {
    setOpportunity(prev => {
      const newVal = Math.max(0, Math.min(100, prev + delta));
      return newVal;
    });
  };

  const updateVisuals = () => {
    if (opportunity >= 75) {
      setGradient('linear-gradient(135deg, #0c2d26, #54c07a)');
      setGlowColor('#54c07a');
    } else if (opportunity >= 40) {
      setGradient('linear-gradient(135deg, #1e1e1e, #2e8a59)');
      setGlowColor('#2e8a59');
    } else {
      setGradient('linear-gradient(135deg, #2e1f27, #76424d)');
      setGlowColor('#76424d');
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
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Thorn Console</h1>
        <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>“Discovery in silence. Strategy in motion.”</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.1rem' }}>
        <p><strong>Transcript:</strong> {transcript || '...waiting for input'}</p>
        <p><strong>Thorn:</strong> {response || '...'}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p><strong>Opportunity Pulse:</strong></p>
        <div style={{
          width: '100%',
          height: '20px',
          backgroundColor: '#444',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${opportunity}%`,
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
        Speak to Thorn
      </button>
    </div>
  );
};

export default ThornConsole;
