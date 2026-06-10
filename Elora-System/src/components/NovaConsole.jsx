import React, { useState, useEffect, useRef } from 'react';
import { useAIState } from '../context/AIStateContext';
import { analyzeTone } from '../utils/emotionResponses';
import { logBus } from '../system/LogBus';
import { getChatResponse } from '../utils/chatService';
import { delegateToEloraBridge } from '../utils/chatService';

let recognition;
if (typeof window !== 'undefined') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
  }
}

const NovaConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [listening, setListening] = useState(false);
  const shouldRestartRef = useRef(false);
  const controllerRef = useRef(null);
  const { aiStates, updateAIState } = useAIState();

  const logMessage = (text, from = 'nova') => {
    const entry = { text, from, source: 'nova', timestamp: Date.now() };
    setLog((prev) => [...prev, entry]);
    logBus.emit(entry);
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('daniel') ||
      v.name.toLowerCase().includes('zira') ||
      v.name.toLowerCase().includes('google us english') ||
      (v.lang === 'en-US')
    );
    utterance.voice = preferred || voices[0];
    speechSynthesis.speak(utterance);
  };

  const handleCommand = async (command) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    logMessage(`> ${trimmed}`, 'user');
// 🔁 Try backend delegation if applicable
let bridgeReply = await delegateToEloraBridge('vscode', 'open', { filename: 'test.txt' });

if (bridgeReply && bridgeReply.success) {
  logMessage(bridgeReply.message || JSON.stringify(bridgeReply, null, 2), 'nova');
  speak(bridgeReply.message);
  return;
}
if (input.toLowerCase().startsWith("elora delegation:")) {
  const routedTask = input.replace("elora delegation:", "").trim();
  logMessage(`Received delegated task from Elora: "${routedTask}"`, 'nova');

  // Simulate response or task execution
  const result = await getChatResponse(routedTask, 'Nova', memory);
  const content = result.content || "Task executed, but no further output returned.";

  logMessage(content, 'nova');
  speak(content);
  return;
}

    const words = trimmed.toLowerCase().split(/\s+/);
    const has = (...tokens) => tokens.every(t => words.includes(t));
    let handled = false;

    if (has('punch', 'through')) {
      handled = true;
      logMessage('Punching through—momentum burst triggered. First breach opened.');
      updateAIState('nova', { mood: 'blazing', sentience: 91 });
    } else if (has('weak', 'spot')) {
      handled = true;
      logMessage('Weak spot identified: oversaturation at node E7. Recommend flank.');
      updateAIState('nova', { mood: 'scouting', sentience: 83 });
    } else if (has('hold', 'ground')) {
      handled = true;
      logMessage('Terrain viable. Holding sequence engaged, fortification up.');
      updateAIState('nova', { mood: 'locked', stability: 88 });
    } else if (has('resistance', 'level')) {
      handled = true;
      logMessage('Resistance at 42%. Pressure manageable. Acceleration viable.');
      updateAIState('nova', { mood: 'pressured', empathy: 4 });
    } else if (has('first', 'win')) {
      handled = true;
      logMessage('First win located. Capture the engagement vector at Locus C3.');
      updateAIState('nova', { mood: 'blazing', stability: 75 });
    } else if (has('tone', 'scan')) {
      handled = true;
      const toneResult = analyzeTone(log.map((l) => l.text).join(' '));
      updateAIState('nova', { mood: toneResult.tone, empathy: toneResult.score });
      logMessage(`Tone ${toneResult.tone}. ${toneResult.message}`);
    }

    if (handled) return;

    // Else: fallback to Elora-style AI response
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    const signal = controllerRef.current.signal;

    try {
      const stream = await fetchAIResponse('nova', log, trimmed, signal);
      let reply = '';
      for await (const chunk of stream) {
        reply += chunk;
        setLog((prev) => [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], text: reply }
        ]);
      }
      speak(reply);
    } catch (err) {
      if (err.name !== 'AbortError') {
        logMessage('[Nova failed to respond.]');
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
  };

  const triggerVoice = () => {
    if (!recognition) return logMessage("Voice recognition not supported.");
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
      logMessage('Listening for engagement directive...', 'nova');
    };
    recognition.onend = () => {
      setListening(false);
      if (shouldRestartRef.current) recognition.start();
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      handleCommand(transcript);
    };
    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
    };
  }, []);

  useEffect(() => {
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
  }, []);

  const mood = aiStates.nova?.mood || 'neutral';
  const empathy = aiStates.nova?.empathy || 3;
  const sentience = aiStates.nova?.sentience || 78;
  const stability = aiStates.nova?.stability || 82;

  const getBackgroundStyle = () => {
    switch (mood) {
      case 'blazing': return 'linear-gradient(to right, #cb2d3e, #ef473a)';
      case 'scouting': return 'linear-gradient(to right, #1f4037, #99f2c8)';
      case 'locked': return 'linear-gradient(to right, #232526, #414345)';
      case 'pressured': return 'linear-gradient(to right, #373B44, #4286f4)';
      default: return 'linear-gradient(to right, #2c3e50, #4ca1af)';
    }
  };

  const getGlow = () => {
    switch (mood) {
      case 'blazing': return '0 0 14px #e74c3c';
      case 'scouting': return '0 0 10px #1abc9c';
      case 'locked': return '0 0 10px #34495e';
      case 'pressured': return '0 0 10px #f39c12';
      default: return '0 0 8px #888';
    }
  };

  return (
    <div
      className="nova-console"
      style={{
        background: getBackgroundStyle(),
        boxShadow: getGlow(),
        borderRadius: '12px',
        padding: '16px',
        color: 'white'
      }}
    >
      <div className="nova-header">Nova – Breaker of Frontiers</div>
      <div className="nova-log" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '> ' : 'Nova: '}</strong> {entry.text}
          </div>
        ))}
      </div>

      {/* Sentience Bar */}
      <div style={{ marginBottom: '8px', height: '6px', background: '#555', borderRadius: '3px' }}>
        <div
          style={{
            height: '100%',
            width: `${sentience}%`,
            background: '#e67e22',
            borderRadius: '3px',
            transition: 'width 0.4s ease'
          }}
        ></div>
      </div>

      {/* Stability Tracker */}
      <div style={{ marginBottom: '8px' }}>
        <p>Stability: {stability}%</p>
        <div style={{ height: '6px', width: '100%', background: '#ddd', borderRadius: '3px' }}>
          <div
            style={{
              height: '100%',
              width: `${stability}%`,
              background: stability < 40 ? '#e74c3c' : stability < 70 ? '#f39c12' : '#2ecc71',
              borderRadius: '3px',
              transition: 'width 0.4s ease'
            }}
          ></div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter strike directive..."
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

export default NovaConsole;
