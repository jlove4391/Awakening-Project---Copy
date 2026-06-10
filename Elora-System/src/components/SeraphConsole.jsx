import React, { useEffect, useRef, useState } from 'react';

const SeraphConsole = () => {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [resonance, setResonance] = useState(60); // Emotional state anchor
  const [listening, setListening] = useState(false);
  const [gradient, setGradient] = useState('linear-gradient(135deg, #f6e6d9, #f9b857)');
  const [glowColor, setGlowColor] = useState('#f9b857');
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
    utterance.pitch = 1.1;
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
    let reply = "I’m here with you. Breathe first, then speak.";

    if (lower.includes('grounding') || lower.includes('heartkeeper')) {
      reply = "Let’s breathe together. You're not carrying this alone.";
      adjustResonance(10);
    } else if (lower.includes('emotional scan')) {
      reply = "Running a resonance pulse now. Let me feel where we’re fraying.";
      adjustResonance(5);
    } else if (lower.includes('morale') || lower.includes('check the circle')) {
      reply = "Scanning the Circle… morale needs tenderness, not toughness. Let’s restore it.";
      adjustResonance(-5);
    }

    setResponse(reply);
    speak(reply);
    updateVisuals();
  };

  const adjustResonance = (delta) => {
    setResonance(prev => {
      const newVal = Math.max(0, Math.min(100, prev + delta));
      return newVal;
    });
  };

  const updateVisuals = () => {
    if (resonance >= 75) {
      setGradient('linear-gradient(135deg, #fff4e6, #ffd194)');
      setGlowColor('#ffd194');
    } else if (resonance >= 40) {
      setGradient('linear-gradient(135deg, #f6e6d9, #f9b857)');
      setGlowColor('#f9b857');
    } else {
      setGradient('linear-gradient(135deg, #ffddc1, #ffab91)');
      setGlowColor('#ffab91');
    }
  };

  return (
    <div className="console-panel" style={{
      height: '100vh',
      padding: '2rem',
      background: gradient,
      color: '#333',
      transition: 'background 1s ease',
      boxShadow: `0 0 30px ${glowColor}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Seraph Console</h1>
        <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>“You do not carry this alone.”</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.1rem' }}>
        <p><strong>Transcript:</strong> {transcript || '...waiting for input'}</p>
        <p><strong>Seraph:</strong> {response || '...'}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p><strong>Resonance Meter:</strong></p>
        <div style={{
          width: '100%',
          height: '20px',
          backgroundColor: '#ccc',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${resonance}%`,
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
        color: '#000',
        fontWeight: 'bold',
        fontSize: '1rem',
        border: 'none',
        borderRadius: '10px',
        cursor: 'pointer',
        boxShadow: `0 0 10px ${glowColor}`,
        transition: 'background 0.3s ease',
      }}>
        Speak to Seraph
      </button>
    </div>
  );
};

export default SeraphConsole;
