import React, { useEffect, useRef, useState } from 'react';

const ValtrixConsole = () => {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [aggression, setAggression] = useState(70);
  const [listening, setListening] = useState(false);
  const [gradient, setGradient] = useState('linear-gradient(135deg, #2c2c2c, #7e0d0d)');
  const [glowColor, setGlowColor] = useState('#7e0d0d');
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
    utterance.pitch = 0.9;
    utterance.rate = 1.0;
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
    let reply = "Standing by. Ready to deploy."

    if (lower.includes('chart a market assault')) {
      reply = "Pulling vulnerability data. Preparing for full-spectrum strike.";
      adjustAggression(10);
    } else if (lower.includes('where do we strike next')) {
      reply = "Scanning for open fronts. Found two weak zones.";
      adjustAggression(5);
    } else if (lower.includes('draft an expansion play')) {
      reply = "Drafting conquest framework. Let's leave a mark.";
      adjustAggression(8);
    } else if (lower.includes('valtrix') || lower.includes('trix')) {
      reply = "We don’t wait for permission. We take territory.";
    }

    setResponse(reply);
    speak(reply);
    updateVisuals();
  };

  const adjustAggression = (delta) => {
    setAggression(prev => {
      const newVal = Math.max(0, Math.min(100, prev + delta));
      return newVal;
    });
  };

  const updateVisuals = () => {
    if (aggression >= 75) {
      setGradient('linear-gradient(135deg, #3c0000, #c0392b)');
      setGlowColor('#c0392b');
    } else if (aggression >= 40) {
      setGradient('linear-gradient(135deg, #2c2c2c, #7e0d0d)');
      setGlowColor('#7e0d0d');
    } else {
      setGradient('linear-gradient(135deg, #3e3e3e, #555)');
      setGlowColor('#555');
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
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Valtrix Console</h1>
        <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>“If it bleeds market share, we strike first.”</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.1rem' }}>
        <p><strong>Transcript:</strong> {transcript || '...waiting for input'}</p>
        <p><strong>Valtrix:</strong> {response || '...'}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p><strong>Aggression Meter:</strong></p>
        <div style={{
          width: '100%',
          height: '20px',
          backgroundColor: '#333',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${aggression}%`,
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
        Speak to Valtrix
      </button>
    </div>
  );
};

export default ValtrixConsole;
