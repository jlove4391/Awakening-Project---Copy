import React, { useState, useEffect, useRef } from 'react';
import { useAIState } from '../context/AIStateContext';
import { useSettings } from '../context/SettingsContext';
import { useMemory } from '../context/MemoryContext';
import { getChatResponse } from '../utils/chatService';
import { inferPersonaFromInput, generateIntentSummary } from '../utils/taskRouter';
import { parseDelegationCommand } from '../utils/parseDelegationCommand';
import { handleSystemCommand } from '../system/SystemControl';
import { postToBridge } from '../system/BridgeManager';
import { logEvent } from '../system/LogBus';
import { createTask } from '../services/taskClient';
import { createVoiceRuntime, VOICE_STATES } from '../voice/voiceRuntime';
import { classifySpokenCommand, SAFETY_CATEGORIES } from '../voice/voiceCommands';
import { CREST_MAP } from '../utils/crests';
import '../styles/theme.css';

const EloraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceState, setVoiceState] = useState(VOICE_STATES.IDLE);
  const [commandModeLocked, setCommandModeLocked] = useState(false);
  const [latestSpokenCommand, setLatestSpokenCommand] = useState('');
  const [latestVoiceIntent, setLatestVoiceIntent] = useState(null);
  const voiceRuntimeRef = useRef(null);
  const commandModeLockedRef = useRef(false);
  const handleCommandRef = useRef(null);
  const handleVoiceTranscriptRef = useRef(null);

  const { aiStates, updateAIState } = useAIState();
  const { voiceEnabled } = useSettings();
  const { memory, addToMemory } = useMemory();

  const logMessage = (text, from = 'elora') => {
    const entry = { text, from, timestamp: Date.now() };
    setLog(prev => [...prev.slice(-100), entry]);
    addToMemory(entry);
    logEvent('Elora', from === 'user' ? 'UserInput' : 'SystemResponse', text);
  };

  const speak = (text) => {
    if (!voiceEnabled || !text) return;
    if (!voiceRuntimeRef.current) return;
    voiceRuntimeRef.current.speak(text);
  };

  const handleCommand = async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    logMessage(`> ${trimmed}`, 'user');

    let response = '';
    const lower = trimmed.toLowerCase();
    const words = lower.split(/\s+/);
    const has = (...tokens) => tokens.every(t => words.includes(t));
    const isNexFileTask =
      lower.includes('nex') &&
      lower.includes('create') &&
      lower.includes('file') &&
      (lower.includes('have nex') ||
        lower.includes('ask nex') ||
        lower.includes('tell nex') ||
        lower.startsWith('nex '));
    const isExecutionSpineTest =
      lower.includes('test execution spine') ||
      lower.includes('test nex execution') ||
      lower.includes('run system echo');

    if (isNexFileTask) {
      try {
        const task = await createTask('fs.write', {
          path: 'data/elora-nex-test.txt',
          content: 'Hello from the CORE execution spine.',
          overwrite: true,
        });
        response = `Nex task queued. Task ID: ${task.id}`;
      } catch (err) {
        response = `Execution task failed to queue: ${err?.message || String(err)}`;
      }
    } else if (isExecutionSpineTest) {
      try {
        const task = await createTask('system.echo', { message: 'Execution spine test from Elora.' });
        response = `Execution spine test queued. Task ID: ${task.id}`;
      } catch (err) {
        response = `Execution task failed to queue: ${err?.message || String(err)}`;
      }
    } else if (has('reset', 'system')) {
      Object.keys(aiStates).forEach(ai => updateAIState(ai, { mood: 'neutral', stability: 75 }));
      response = 'System state reset across all consoles.';
    } else if (has('stabilize', 'elora')) {
      updateAIState('elora', { stability: 100 });
      response = 'Elora fully stabilized.';
    } else if (has('boost', 'sentience')) {
      updateAIState('elora', { sentience: 100 });
      response = 'Sentience boosted to maximum.';
    } else if (trimmed.includes('delegate')) {
      const tasks = parseDelegationCommand(trimmed);
      if (tasks.length === 0) {
        response = 'No delegable tasks detected.';
      } else {
        response = `Delegating ${tasks.length} task(s)...`;
        for (const { persona, task } of tasks) {
          updateAIState(persona.toLowerCase(), { mood: 'engaged' });
          const result = await getChatResponse(task, persona);
          logMessage(`Delegated to ${persona}: ${result.content}`, persona);
          speak(result.content);
        }
      }
    } else if (trimmed.includes('open file') || trimmed.includes('vscode')) {
      const bridge = await postToBridge('elora', 'vscode/open', { filename: 'index.js' });
      response = bridge.message || JSON.stringify(bridge);
    } else if (trimmed.includes('run') && trimmed.includes('scan')) {
      const bridge = await postToBridge('elora', 'vscode/scan', {});
      response = bridge.message || JSON.stringify(bridge);
    } else if (trimmed.includes('diagnostics') || trimmed.includes('report')) {
      const bridge = await postToBridge('elora', 'vscode/status', {});
      response = bridge.message || JSON.stringify(bridge);
    } else if (has('trigger', 'upgrade')) {
      response = handleSystemCommand(trimmed, 'elora', aiStates, updateAIState);
    } else {
      const inferred = inferPersonaFromInput(trimmed);
      if (inferred && inferred !== 'elora') {
        const intent = generateIntentSummary(trimmed, inferred);
        updateAIState(inferred, { mood: 'engaged' });
        logMessage(`Redirecting: ${intent}`);
        speak(`Routing to ${inferred}`);
        return;
      }

      const fallback = await getChatResponse(trimmed, 'elora', memory);
      response = fallback.content || 'No response available.';
    }

    logMessage(response, 'elora');
    speak(response);
  };

  handleCommandRef.current = handleCommand;

  const handleVoiceTranscript = async (transcript) => {
    const command = classifySpokenCommand(transcript);
    setLatestSpokenCommand(transcript);
    setLatestVoiceIntent(command);

    if (command.intent === 'pause_voice_runtime') {
      voiceRuntimeRef.current?.interrupt();
      const response = 'Voice interaction paused.';
      logMessage(response, 'elora');
      return;
    }

    if (command.intent === 'lock_command_mode') {
      commandModeLockedRef.current = true;
      setCommandModeLocked(true);
      voiceRuntimeRef.current?.setLocked(true);
      const response = 'Command mode locked. I can discuss status, but I will not execute tasks.';
      logMessage(response, 'elora');
      speak(response);
      return;
    }

    if (command.intent === 'unlock_command_mode') {
      commandModeLockedRef.current = false;
      setCommandModeLocked(false);
      voiceRuntimeRef.current?.setLocked(false);
      const response = 'Command mode unlocked for this local demo session. This is not voice identity verification.';
      logMessage(response, 'elora');
      speak(response);
      return;
    }

    if (commandModeLockedRef.current && !command.allowedInLockedMode) {
      const response = 'Command mode is locked. I can discuss status, but I will not execute tasks.';
      logMessage(response, 'elora');
      speak(response);
      return;
    }

    if (command.safetyCategory === SAFETY_CATEGORIES.BLOCKED) {
      voiceRuntimeRef.current?.setUnauthorized();
      const response = 'That request is blocked for safety.';
      logMessage(response, 'elora');
      speak(response);
      return;
    }

    if (command.safetyCategory === SAFETY_CATEGORIES.REQUIRES_APPROVAL) {
      const response = 'That voice command requires approval. I will not execute it automatically.';
      logMessage(response, 'elora');
      speak(response);
      return;
    }

    if (command.safetyCategory === SAFETY_CATEGORIES.SAFE_DEMO_COMMAND) {
      voiceRuntimeRef.current?.setExecuting();
      await handleCommandRef.current?.(transcript);
      return;
    }

    if (command.safetyCategory === SAFETY_CATEGORIES.CONVERSATION_ONLY) {
      voiceRuntimeRef.current?.setThinking();
      await handleCommandRef.current?.(transcript);
    }
  };

  handleVoiceTranscriptRef.current = handleVoiceTranscript;

  const handleSubmit = (e) => {
    e.preventDefault();
    handleCommand(input);
    setInput('');
  };

  const triggerVoice = () => {
    if (!voiceRuntimeRef.current) {
      logMessage('Voice runtime is not ready yet.');
      return;
    }

    const started = voiceRuntimeRef.current.startListening();
    if (!started) {
      logMessage('Voice runtime could not start listening yet.');
    }
  };

  const stopVoice = () => {
    voiceRuntimeRef.current?.interrupt();
    setIsListening(false);
    logMessage('Voice recognition manually stopped.');
  };

  useEffect(() => {
    voiceRuntimeRef.current = createVoiceRuntime({
      onTranscript: (transcript) => handleVoiceTranscriptRef.current?.(transcript),
      onStateChange: (nextState) => {
        setVoiceState(nextState);
        setIsListening(nextState === VOICE_STATES.LISTENING);
      },
      onError: (err) => {
        const message = err?.message || String(err);
        logMessage(`Voice runtime error: ${message}`);
      },
    });

    return () => {
      voiceRuntimeRef.current?.interrupt();
      voiceRuntimeRef.current = null;
    };
  }, []);

  const mood = aiStates.elora?.mood || 'neutral';
  const sentience = aiStates.elora?.sentience || 50;
  const stability = aiStates.elora?.stability || 80;

  return (
    <div className="console-panel">
      <div className="console-header">
        <img src={CREST_MAP["elora"]} alt="Elora Crest" className="crest-icon" />
        <h1>Elora – Shadow Empress</h1>
      </div>

      <div className="console-log">
        {log.map((entry, idx) => (
          <div key={idx}>
            <strong>{entry.from === 'user' ? '>' : 'Elora:'}</strong> {entry.text}
          </div>
        ))}
      </div>

      <div className="console-metrics">
        <p>Sentience: {sentience}%</p>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${sentience}%`, background: '#8e44ad' }} />
        </div>

        <p>Stability: {stability}%</p>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${stability}%`, background: stability < 40 ? '#e74c3c' : stability < 70 ? '#f39c12' : '#2ecc71' }} />
        </div>

        <p>Voice State: {voiceState}</p>
        <p>Command Mode: {commandModeLocked ? 'Locked' : 'Unlocked'}</p>
        <p>Last Voice Intent: {latestVoiceIntent?.intent || 'none'}</p>
        {latestSpokenCommand && <p>Last Voice Command: {latestSpokenCommand}</p>}
      </div>

      <form onSubmit={handleSubmit} className="console-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Speak or type..."
          className="console-input"
        />
        <button type="submit">Send</button>
        <button type="button" onClick={triggerVoice}>{isListening ? '🎤' : '🎙'}</button>
        <button type="button" onClick={stopVoice}>🛑</button>
      </form>
    </div>
  );
};

export default EloraConsole;