// src/hooks/useTunnelStatus.js

import { useState } from 'react';

const useTunnelStatus = () => {
  const [tunnelStatus, setTunnelStatus] = useState('Disconnected');

  const connectTunnel = () => {
    // This is placeholder logic — hook to your real ngrok or Tailscale calls.
    console.log('[Tunnel] Connecting...');
    setTunnelStatus('Connected');
  };

  const disconnectTunnel = () => {
    console.log('[Tunnel] Disconnecting...');
    setTunnelStatus('Disconnected');
  };

  return { tunnelStatus, connectTunnel, disconnectTunnel };
};

export default useTunnelStatus;
