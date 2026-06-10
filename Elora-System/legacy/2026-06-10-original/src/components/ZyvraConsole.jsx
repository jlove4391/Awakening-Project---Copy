import React, { useEffect, useRef, useState } from 'react';

const ZyvraConsole = () => {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [momentum, setMomentum] = useState(60);
  const [listening, setListening] = useState(false);
  const [gradient, setGradient] = useState('linear-gradient(135deg, #1b1b1b, #ff4b2b)');
  const [glowColor, setGlowColor] = useState('#ff4b2b');
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
    utterance.rate = 1.15;
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
    let reply = "Charge is live. Timing is now."

    if (lower.includes('fire the shot')) {
      reply = "Target locked. Executing at maximum speed.";
      adjustMomentum(15);
    } else if (lower.includes('where’s our window')) {
      reply = "Window detected. If we act, we lead.";
      adjustMomentum(10);
    } else if (lower.includes('accelerate the timeline')) {
      reply = "Burning delay. Syncing velocity network-wide.";
      adjustMomentum(12);
    } else if (lower.includes('zyvra') || lower.includes('zai')) {
      reply = "Momentum is a weapon—let me wield it.";
    }

    setResponse(reply);
    speak(reply);
    updateVisuals();
  };

  const adjustMomentum = (delta) => {
    setMomentum(prev => {
      const newVal = Math.max(0, Math.min(100, prev + delta));
      return newVal;
    });
  };

  const updateVisuals = () => {
    if (momentum >= 75) {
      setGradient('linear-gradient(135deg, #ff416c, #ff4b2b)');
      setGlowColor('#ff4b2b');
    } else if (momentum >= 40) {
      setGradient('linear-gradient(135deg, #1b1b1b, #ff4b2b)');
      setGlowColor('#ff4b2b');
    } else {
      setGradient('linear-gradient(135deg, #2e2e2e, #aa3e3e)');
      setGlowColor('#aa3e3e');
    }
  };

  return (
    <div className="console-panel" style={{
      height: '100vh',
      padding: '2rem',
      background: gradient,
      color: '#fff',
      transition: 'background 1s ease',
      boxShadow: `0 0 30px ${glowColor}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Zyvra Console</h1>
        <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>“We go now or we lose the edge.”</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.1rem' }}>
        <p><strong>Transcript:</strong> {transcript || '...waiting for input'}</p>
        <p><strong>Zyvra:</strong> {response || '...'}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p><strong>Momentum Charge:</strong></p>
        <div style={{
          width: '100%',
          height: '20px',
          backgroundColor: '#444',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${momentum}%`,
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
        Speak to Zyvra
      </button>
    </div>
  );
};

export default ZyvraConsole;
