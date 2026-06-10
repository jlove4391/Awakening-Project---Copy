import React, { useEffect, useState } from 'react';
import { listenForTaskEvents } from '../services/taskClient';

const MAX_EVENTS = 10;

const TaskFeed = () => {
  const [events, setEvents] = useState([]);
  const [connectionError, setConnectionError] = useState('');

  const rememberEvent = (event) => {
    setEvents(prev => [event, ...prev].slice(0, MAX_EVENTS));
  };

  useEffect(() => {
    // Open one live connection to the backend task event stream.
    const cleanup = listenForTaskEvents({
      onUpdate: (task) => {
        setConnectionError('');
        rememberEvent({ ...task, eventType: 'update', receivedAt: Date.now() });
      },
      onFinished: (task) => {
        setConnectionError('');
        rememberEvent({ ...task, eventType: 'finished', receivedAt: Date.now() });
      },
      onError: () => {
        setConnectionError('Task feed connection error. Is authBridge running?');
      },
    });

    // Close the EventSource when this component leaves the screen.
    return cleanup;
  }, []);

  return (
    <div style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid #444' }}>
      <h3 style={{ marginTop: 0 }}>Execution Task Feed</h3>

      {connectionError && (
        <p style={{ color: '#e74c3c' }}>{connectionError}</p>
      )}

      {events.length === 0 ? (
        <p>No task events yet.</p>
      ) : (
        <ul style={{ paddingLeft: '1.25rem' }}>
          {events.map((event, index) => (
            <li key={`${event.id || 'task'}-${event.eventType}-${event.receivedAt}-${index}`} style={{ marginBottom: '0.75rem' }}>
              <div><strong>Task:</strong> {event.id || 'unknown'}</div>
              <div><strong>Status:</strong> {event.status || 'unknown'}</div>
              {event.receipt?.summary && (
                <div><strong>Receipt:</strong> {event.receipt.summary}</div>
              )}
              {event.audit?.status && (
                <div><strong>Audit:</strong> {event.audit.status}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TaskFeed;
