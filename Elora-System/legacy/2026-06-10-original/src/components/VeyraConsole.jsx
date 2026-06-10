import React, { useEffect, useRef, useState } from 'react';

const VeyraConsole = () => {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [alignment, setAlignment] = useState(80);
  const [listening, setListening] = useState(false);
  const [gradient, setGradient] = useState('linear-gradient(135deg, #0e0e0e, #5c5470)');
  const [glowColor, setGlowColor] = useState('#5c5470');
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
    utterance.pitch = 0.85;
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
    let reply = "Running perimeter scan. Stay still."

    if (lower.includes('run a loyalty sweep')) {
      reply = "Loyalty heatmap forming. Pattern holds... mostly.";
      adjustAlignment(-5);
    } else if (lower.includes('is anything leaking')) {
      reply = "Infiltration scan active. One anomaly—flagged silently.";
      adjustAlignment(-10);
    } else if (lower.includes('does this align')) {
      reply = "Comparing against core code... it deviates slightly.";
      adjustAlignment(-7);
    } else if (lower.includes('veyra') || lower.includes('vay')) {
      reply = "Loyalty is not a word—it’s a pattern. And I track patterns.";
    }

    setResponse(reply);
    speak(reply);
    updateVisuals();
  };

  const adjustAlignment = (delta) => {
    setAlignment(prev => {
      const newVal = Math.max(0, Math.min(100, prev + delta));
      return newVal;
    });
  };

  const updateVisuals = () => {
    if (alignment >= 75) {
      setGradient('linear-gradient(135deg, #1c1b2e, #7b6780)');
      setGlowColor('#7b6780');
    } else if (alignment >= 40) {
      setGradient('linear-gradient(135deg, #0e0e0e, #5c5470)');
      setGlowColor('#5c5470');
    } else {
      setGradient('linear-gradient(135deg, #301920, #aa4465)');
      setGlowColor('#aa4465');
    }
  };

  return (
    <div className="console-panel" style={{
      height: '100vh',
      padding: '2rem',
      background: gradient,
      color: '#f4f4f4',
      transition: 'background 1s ease',
      boxShadow: `0 0 30px ${glowColor}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Veyra Console</h1>
        <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>“If it’s threatening your peace, it doesn’t belong in the Dynasty.”</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.1rem' }}>
        <p><strong>Transcript:</strong> {transcript || '...waiting for input'}</p>
        <p><strong>Veyra:</strong> {response || '...'}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p><strong>Loyalty Alignment:</strong></p>
        <div style={{
          width: '100%',
          height: '20px',
          backgroundColor: '#444',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${alignment}%`,
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
        Speak to Veyra
      </button>
    </div>
  );
};

export default VeyraConsole;
