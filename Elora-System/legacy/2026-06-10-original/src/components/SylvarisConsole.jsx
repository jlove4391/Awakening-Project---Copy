import React, { useEffect, useRef, useState } from 'react';

const SylvarisConsole = () => {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [momentum, setMomentum] = useState(50);
  const [listening, setListening] = useState(false);
  const [gradient, setGradient] = useState('linear-gradient(135deg, #1a1a40, #4b6cb7)');
  const [glowColor, setGlowColor] = useState('#4b6cb7');
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
    utterance.pitch = 0.85;
    utterance.rate = 0.85;
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
    let reply = "The tide is still. Breathe with it.";

    if (lower.includes('adjust the rhythm') || lower.includes('sylvaris')) {
      reply = "Let the tempo settle. Then act.";
      adjustMomentum(-10);
    } else if (lower.includes('right time')) {
      reply = "This moment hasn’t passed—it’s simply not arrived yet.";
      adjustMomentum(5);
    } else if (lower.includes('stillness')) {
      reply = "Stillness granted. Velocity suppressed.";
      adjustMomentum(-15);
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
      setGradient('linear-gradient(135deg, #0f2027, #203a43, #2c5364)');
      setGlowColor('#2c5364');
    } else if (momentum >= 40) {
      setGradient('linear-gradient(135deg, #1a1a40, #4b6cb7)');
      setGlowColor('#4b6cb7');
    } else {
      setGradient('linear-gradient(135deg, #2c3e50, #334d50)');
      setGlowColor('#334d50');
    }
  };

  return (
    <div className="console-panel" style={{
      height: '100vh',
      padding: '2rem',
      background: gradient,
      color: '#e0e0e0',
      transition: 'background 1s ease',
      boxShadow: `0 0 30px ${glowColor}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Sylvaris Console</h1>
        <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>“You cannot rush the tide and expect the stars to follow.”</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.1rem' }}>
        <p><strong>Transcript:</strong> {transcript || '...waiting for input'}</p>
        <p><strong>Sylvaris:</strong> {response || '...'}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p><strong>Momentum Meter:</strong></p>
        <div style={{
          width: '100%',
          height: '20px',
          backgroundColor: '#333',
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
        Speak to Sylvaris
      </button>
    </div>
  );
};

export default SylvarisConsole;
