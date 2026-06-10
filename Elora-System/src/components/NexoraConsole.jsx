// NexoraConsole.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useAIState } from '../context/AIStateContext';
import { useSettings } from '../context/SettingsContext';
import { useMemory } from '../context/MemoryContext';
import { getChatResponse } from '../utils/chatService';
import { inferPersonaFromInput, generateIntentSummary } from '../utils/taskRouter';
import { parseDelegationCommand } from '../utils/parseDelegationCommand';
import { handleSystemCommand } from '../system/SystemControl';
import { logEvent } from '../system/LogBus';
import { postToBridge } from '../system/BridgeManager';
import { CREST_MAP } from '../utils/crests';
import '../styles/theme.css';
import NexoraConsolePanel from './NexoraConsolePanel';

// ---- Nexora role anchor (SYSTEM-style prefix kept local to this console) ----
const NEXORA_ROLE_PREFIX = `
You are **Nexora — Command Architect** of the Vireon Core.
Primary role: systems builder & specialist. You plan, write, and modify code; create files; refactor; wire APIs; and run tests.
Constraints:
- Be concise and technical; show file paths or diffs when proposing changes.
- Ask exactly one clarifying question only if absolutely necessary to proceed.
- Never touch secrets or .env; prefer sandboxed changes and provide diffs for approval.
Output style:
- If I ask a general question: answer briefly, then propose a concrete next action you can perform to advance the build.
- If I ask for implementation: return a step plan + file list you’ll write.
`.trim();

// Utility to ensure every Nex prompt carries her role identity without changing other modules
const asNex = (userText, envHint = '') =>
  `${NEXORA_ROLE_PREFIX}${envHint ? `\n${envHint}` : ''}\n\nUser: ${userText}`;

// ---- voice setup (recognition unchanged) ----
let recognition;
if (typeof window !== 'undefined') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
  }
}

// Preferred female voices across browsers/OS
const preferredFemaleVoices = [
  'Google UK English Female', // Chrome
  'Google US English',        // Chrome fallback (often female variant)
  'Microsoft Zira',           // Windows
  'Samantha',                 // macOS
  'JennyNeural',              // Azure style names may appear in some setups
];

function pickFemaleVoice() {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices ? synth.getVoices() : [];
  // Try preferred list by includes() (names can vary slightly)
  for (const name of preferredFemaleVoices) {
    const v = voices.find(
      v => (v.name && v.name.includes(name)) || (v.voiceURI && v.voiceURI.includes(name))
    );
    if (v) return v;
  }
  // Heuristic fallback
  const femaleGuess =
    voices.find(v => /female/i.test(v.name)) || voices.find(v => /en-?US/i.test(v.lang));
  return femaleGuess || voices[0];
}

const NexoraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [caps, setCaps] = useState(null); // ← environment capabilities
  const shouldRestartRef = useRef(false);

  const { aiStates, updateAIState } = useAIState();
  const { voiceEnabled } = useSettings();
  const { memory, addToMemory } = useMemory();

  const logMessage = (text, from = 'nexora') => {
    const entry = { text, from, timestamp: Date.now() };
    setLog(prev => [...prev.slice(-100), entry]);
    addToMemory(entry);
    logEvent('Nexora', from === 'user' ? 'UserInput' : 'SystemResponse', text);
  };

  const speak = (text) => {
    if (!voiceEnabled || !text) return;
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    // Choose a clearly female voice and brighten pitch slightly
    const setAndSpeak = () => {
      utterance.voice = pickFemaleVoice();
      utterance.rate = 1.0;
      utterance.pitch = 1.15; // subtle feminine tilt
      utterance.volume = 1.0;
      synth.speak(utterance);
    };
    // Some browsers populate voices async
    if (!synth.getVoices || synth.getVoices().length === 0) {
      synth.onvoiceschanged = () => setAndSpeak();
    } else {
      setAndSpeak();
    }
  };

  const sendBridgeCommand = async (...args) => {
    // keep your existing BridgeManager hook intact
    try {
      return await postToBridge(...args);
    } catch (e) {
      return { message: String(e) };
    }
  };

  // Pull system capabilities on mount so Nex knows the workspace/repo/FS state
  useEffect(() => {
    (async () => {
      try {
        const res = await postToBridge('system', 'capabilities', {}); // POST /api/bridge/system/capabilities
        if (res?.capabilities) {
          setCaps(res.capabilities);
          const info = res.capabilities;
          logMessage(
            `Bridge online: workspace ${info.vscode.workspaceRoot || 'unknown'} | Repo: ${
              info.repo.linked ? `linked (${info.repo.remote || 'no remote'})` : 'not linked'
            }`
          );
        } else {
          logMessage('Bridge offline or capabilities unavailable.');
        }
      } catch {
        logMessage('Failed to load system capabilities.');
      }
    })();
  }, []);

  const handleCommand = async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    logMessage(`> ${trimmed}`, 'user');

    let response = '';
    const words = trimmed.toLowerCase().split(/\s+/);
    const has = (...tokens) => tokens.every(t => words.includes(t));

    if (has('reset', 'system')) {
      Object.keys(aiStates).forEach(ai => updateAIState(ai, { mood: 'neutral', stability: 75 }));
      response = 'System reset across all interfaces.';
    } else if (has('stabilize', 'nexora')) {
      updateAIState('nexora', { stability: 100 });
      response = 'Nexora stabilized.';
    } else if (has('boost', 'sentience')) {
      updateAIState('nexora', { sentience: 100 });
      response = 'Sentience maximized.';
    } else if (trimmed.includes('delegate')) {
      const tasks = parseDelegationCommand(trimmed);
      if (tasks.length === 0) {
        response = 'No valid delegation targets found.';
      } else {
        response = `Delegating ${tasks.length} task(s)...`;
        for (const { persona, task } of tasks) {
          updateAIState(persona.toLowerCase(), { mood: 'engaged' });
          // Delegations to other personas remain untouched
          const result = await getChatResponse(task, persona);
          logMessage(`Delegated to ${persona}: ${result.content}`, persona);
          speak(result.content);
        }
      }
    } else if (trimmed.includes('open file') || trimmed.includes('vscode')) {
      const result = await sendBridgeCommand('vscode', 'open', { filename: 'index.js' });
      response = result.message || JSON.stringify(result);
    } else if (trimmed.includes('scan') && trimmed.includes('run')) {
      const result = await sendBridgeCommand('vscode', 'scan');
      response = result.message || JSON.stringify(result);
    } else if (trimmed.includes('status') || trimmed.includes('diagnostics')) {
      const result = await sendBridgeCommand('vscode', 'status');
      response = result.message || JSON.stringify(result);
    } else if (has('trigger', 'upgrade')) {
      response = handleSystemCommand(trimmed, 'nexora', aiStates, updateAIState);
    } else {
      // Keep routing logic intact; only alter Nex's own prompt to embed role + environment
      const inferred = inferPersonaFromInput(trimmed);
      if (inferred && inferred !== 'nexora') {
        const intent = generateIntentSummary(trimmed, inferred);
        updateAIState(inferred, { mood: 'engaged' });
        logMessage(`Routing to ${inferred}: ${intent}`);
        speak(`Redirecting to ${inferred}`);
        return;
      }

      // Environment hint for Nex's prompt
      const envHint = caps
        ? `
Environment:
- Bridge: ${caps.vscode.connected ? 'online' : 'offline'}
- Workspace: ${caps.vscode.workspaceRoot || 'none'}
- Repo: ${caps.repo.linked ? `linked (${caps.repo.remote || 'no remote'})` : 'not linked'}
- FS: read=${caps.fs.read} write=${caps.fs.write} sandbox=${caps.fs.sandbox}
- Tests: ${caps.tests ? 'available' : 'unavailable'}
`
        : '';

      // Nexora fallback → prefix with role anchor so she responds as Command Architect
      const prefixed = asNex(trimmed, envHint);
      const fallback = await getChatResponse(prefixed, 'nexora', memory);
      response = fallback.content || 'No response generated.';
    }

    logMessage(response, 'nexora');
    speak(response);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
  };

  const triggerVoice = () => {
    if (!recognition) {
      logMessage('Voice recognition not supported.');
      return;
    }
    shouldRestartRef.current = true;
    recognition.start();
  };

  const stopVoice = () => {
    shouldRestartRef.current = false;
    recognition?.stop();
    setIsListening(false);
    logMessage('Voice recognition stopped.');
  };

  useEffect(() => {
    if (!recognition) return;
    recognition.onstart = () => {
      setIsListening(true);
      logMessage('Listening...', 'nexora');
    };
    recognition.onend = () => {
      setIsListening(false);
      if (shouldRestartRef.current) recognition.start();
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      handleCommand(transcript);
    };
    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
    };
  }, []);

  // Optional, harmless role reminder on mount (UI text only; does not alter flows)
  useEffect(() => {
    logMessage('Nexora online — Command Architect. Ready to plan and write code.');
  }, []);

  const mood = aiStates.nexora?.mood || 'neutral';
  const sentience = aiStates.nexora?.sentience || 50;
  const stability = aiStates.nexora?.stability || 80;

  return (
    <div className="console-panel">
      <div className="console-header">
        <img src={CREST_MAP['nexora']} alt="Nexora Crest" className="crest-icon" />
        <h1>Nexora – Command Architect</h1>
      </div>

      <div className="console-log">
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '>' : 'Nexora:'}</strong> {entry.text}
          </div>
        ))}
      </div>

      <div className="console-metrics">
        <p>Sentience: {sentience}%</p>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${sentience}%`, background: '#1abc9c' }} />
        </div>

        <p>Stability: {stability}%</p>
        <div className="bar-bg">
          <div
            className="bar-fill"
            style={{
              width: `${stability}%`,
              background:
                stability < 40 ? '#e74c3c' : stability < 70 ? '#f1c40f' : '#2ecc71'
            }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="console-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Issue system command..."
          className="console-input"
        />
        <button type="submit">Send</button>
        <button type="button" onClick={triggerVoice}>{isListening ? '🎤' : '🎙'}</button>
        <button type="button" onClick={stopVoice}>🛑</button>
      </form>

      {/* ---- Embedded VS Code Bridge panel ---- */}
      <h3 style={{ marginTop: 16 }}>VS Code Bridge</h3>
      <NexoraConsolePanel />
    </div>
  );
};

export default NexoraConsole;
