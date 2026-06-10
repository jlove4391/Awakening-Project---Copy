import React, { useMemo, useRef, useState } from 'react';
import '../styles/theme.css';
import '../styles/EloraConsole.css';

const runtimeBaseUrl = process.env.REACT_APP_AGENT_RUNTIME_URL || 'http://localhost:4317';

const initialLog = [
  {
    from: 'elora',
    text: 'Agent runtime shell online. Messages stream through the backend service; execution logic no longer lives in React.',
    timestamp: Date.now(),
  },
];

const parseSseChunk = (chunk) => {
  return chunk
    .split('\n\n')
    .map((frame) => {
      const event = frame.match(/^event: (.+)$/m)?.[1] || 'message';
      const rawData = frame.match(/^data: (.+)$/m)?.[1];
      if (!rawData) return null;
      try {
        return { event, data: JSON.parse(rawData) };
      } catch (error) {
        return { event: 'error', data: { message: error.message } };
      }
    })
    .filter(Boolean);
};

const EloraConsole = () => {
  const [input, setInput] = useState('');
  const [log, setLog] = useState(initialLog);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(() => window.localStorage.getItem('elora-session-id') || undefined);
  const [toolEvents, setToolEvents] = useState([]);
  const [taskStatus, setTaskStatus] = useState('idle');
  const [memoryRefs, setMemoryRefs] = useState([]);
  const activeAssistantIndex = useRef(null);

  const statusText = useMemo(() => (isStreaming ? 'streaming' : 'ready'), [isStreaming]);

  const logMessage = (text, from = 'elora') => {
    setLog((prev) => [...prev.slice(-100), { text, from, timestamp: Date.now() }]);
  };

  const appendAssistantDelta = (text) => {
    setLog((prev) => {
      const next = [...prev];
      const existingIndex = activeAssistantIndex.current;
      if (existingIndex === null || !next[existingIndex]) {
        next.push({ from: 'elora', text, timestamp: Date.now() });
        activeAssistantIndex.current = next.length - 1;
      } else {
        next[existingIndex] = {
          ...next[existingIndex],
          text: `${next[existingIndex].text}${text}`,
        };
      }
      return next.slice(-100);
    });
  };

  const handleRuntimeEvent = ({ event, data }) => {
    if (event === 'session') {
      setSessionId(data.sessionId);
      window.localStorage.setItem('elora-session-id', data.sessionId);
    }

    if (event === 'memory' || event === 'completed') {
      setMemoryRefs(data.references || data.memories || []);
    }

    if (event === 'runtime_event') {
      setToolEvents((prev) => [{ type: data.type || 'runtime_event', at: Date.now() }, ...prev].slice(0, 8));
      setTaskStatus(data.type?.includes('approval') ? 'approval requested' : 'tool activity');
    }

    if (event === 'delta') appendAssistantDelta(data.text);

    if (event === 'completed') {
      activeAssistantIndex.current = null;
      setTaskStatus(data.finalOutput?.taskStatus || 'completed');
      if (data.finalOutput?.visibleReply) logMessage(data.finalOutput.visibleReply);
    }

    if (event === 'error') {
      activeAssistantIndex.current = null;
      setTaskStatus('error');
      logMessage(`Runtime error: ${data.message}`, 'system');
    }
  };

  const sendToRuntime = async (message) => {
    setIsStreaming(true);
    setTaskStatus('running');
    activeAssistantIndex.current = null;

    const response = await fetch(`${runtimeBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Agent runtime returned ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      frames.forEach((frame) => parseSseChunk(`${frame}\n\n`).forEach(handleRuntimeEvent));
    }

    if (buffer.trim()) parseSseChunk(buffer).forEach(handleRuntimeEvent);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    logMessage(`> ${trimmed}`, 'user');
    setInput('');

    try {
      await sendToRuntime(trimmed);
    } catch (error) {
      activeAssistantIndex.current = null;
      setTaskStatus('error');
      logMessage(`Unable to reach Elora runtime: ${error.message}`, 'system');
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="console-panel">
      <div className="console-header">
        <img src="/assets/crests/elora.png" alt="Elora Crest" className="crest-icon" />
        <h1>Elora – Shadow Empress</h1>
      </div>

      <div className="console-log">
        {log.map((entry, idx) => (
          <div key={`${entry.timestamp || 'seed'}-${idx}`}>
            <strong>{entry.from === 'user' ? '>' : entry.from === 'system' ? 'System:' : 'Elora:'}</strong> {entry.text}
          </div>
        ))}
      </div>

      <div className="console-metrics">
        <p>Runtime: {statusText}</p>
        <p>Session: {sessionId || 'pending backend session'}</p>
        <p>Task Status: {taskStatus}</p>
        <p>Tool Calls / Approvals:</p>
        <ul className="runtime-list">
          {toolEvents.length ? toolEvents.map((item) => <li key={`${item.at}-${item.type}`}>{item.type}</li>) : <li>none yet</li>}
        </ul>
        <p>Memory References:</p>
        <ul className="runtime-list">
          {memoryRefs.length ? memoryRefs.map((item) => <li key={item.id}>{item.text}</li>) : <li>none yet</li>}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="console-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message to the Elora agent runtime..."
          className="console-input"
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming}>{isStreaming ? 'Streaming…' : 'Send'}</button>
      </form>
    </div>
  );
};

export default EloraConsole;
