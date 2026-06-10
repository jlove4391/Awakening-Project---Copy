import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const runtimeBaseUrl = process.env.REACT_APP_AGENT_RUNTIME_URL || 'http://localhost:4317';

const formatExpiry = (expiryDate) => {
  if (!expiryDate) return 'unknown';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(Number(expiryDate)));
  } catch {
    return 'unknown';
  }
};

const normalizeError = (error) => error?.message || 'Unable to reach the agent runtime.';
const runtimeOrigin = new URL(runtimeBaseUrl).origin;

const GoogleConnection = () => {
  const [status, setStatus] = useState({ loading: true, linked: false });
  const [message, setMessage] = useState('Checking Google connection...');
  const [isConnecting, setIsConnecting] = useState(false);
  const popupRef = useRef(null);

  const statusLabel = useMemo(() => {
    if (status.loading) return 'Checking';
    return status.linked ? 'Connected' : 'Not connected';
  }, [status.loading, status.linked]);

  const refreshStatus = useCallback(async () => {
    setStatus((previous) => ({ ...previous, loading: true }));
    try {
      const response = await fetch(`${runtimeBaseUrl}/api/auth/google/status`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Runtime returned ${response.status}`);
      const data = await response.json();
      const google = data.google || { linked: false };
      setStatus({ loading: false, ...google });
      setMessage(google.linked ? 'Google is connected. Elora can use approved Google tools.' : 'Google is not connected yet.');
    } catch (error) {
      setStatus({ loading: false, linked: false, error: normalizeError(error) });
      setMessage(`Google status check failed: ${normalizeError(error)}`);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== runtimeOrigin || event.data?.type !== 'elora.google_oauth_complete') return;
      setIsConnecting(false);
      setMessage(event.data.ok ? 'Google sign-in completed. Refreshing connection status...' : `Google sign-in failed: ${event.data.error || 'Unknown error'}`);
      refreshStatus();
      popupRef.current = null;
    };

    const handleFocus = () => refreshStatus();

    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshStatus]);

  const connectGoogle = async () => {
    setIsConnecting(true);
    setMessage('Opening Google sign-in...');

    const popup = window.open('', 'elora-google-oauth', 'width=520,height=720');
    popupRef.current = popup;

    try {
      const response = await fetch(`${runtimeBaseUrl}/api/auth/google/start`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Runtime returned ${response.status}`);
      const data = await response.json();
      if (!data.url) throw new Error('Runtime did not return a Google auth URL.');

      if (popup && !popup.closed) {
        popup.location.href = data.url;
      } else {
        window.location.assign(data.url);
      }
    } catch (error) {
      setIsConnecting(false);
      setMessage(`Google sign-in could not start: ${normalizeError(error)}`);
      if (popup && !popup.closed) popup.close();
      popupRef.current = null;
    }
  };

  const disconnectGoogle = async () => {
    setMessage('Disconnecting Google...');
    try {
      const response = await fetch(`${runtimeBaseUrl}/api/auth/google/tokens`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`Runtime returned ${response.status}`);
      await refreshStatus();
      setMessage('Google has been disconnected from Elora.');
    } catch (error) {
      setMessage(`Google disconnect failed: ${normalizeError(error)}`);
    }
  };

  return (
    <section className="google-connection-card" aria-labelledby="google-connection-title">
      <div>
        <p className="core-card-label">Provider Access</p>
        <h2 id="google-connection-title" className="core-card-title">Google Workspace</h2>
        <p className="core-card-copy">
          Connect Calendar, Gmail, Drive, and Sheets to the backend agent runtime. Tokens stay encrypted on the server and are never stored in React.
        </p>
      </div>

      <div className="google-connection-status" aria-live="polite">
        <span className={`status-pill google-status-pill ${status.linked ? 'google-status-linked' : 'google-status-unlinked'}`}>
          {statusLabel}
        </span>
        <p className="core-card-copy">{message}</p>
        {status.linked && (
          <ul className="google-connection-meta">
            <li>Token expires: {formatExpiry(status.expiry_date)}</li>
            <li>Granted scopes: {status.scope || 'available after Google reports scope metadata'}</li>
          </ul>
        )}
      </div>

      <div className="google-connection-actions">
        <button type="button" className="google-action-button" onClick={connectGoogle} disabled={isConnecting}>
          {status.linked ? 'Reconnect Google' : 'Connect Google'}
        </button>
        <button type="button" className="google-action-button google-secondary-button" onClick={refreshStatus} disabled={status.loading}>
          Refresh Status
        </button>
        {status.linked && (
          <button type="button" className="google-action-button google-danger-button" onClick={disconnectGoogle}>
            Disconnect
          </button>
        )}
      </div>
    </section>
  );
};

export default GoogleConnection;
