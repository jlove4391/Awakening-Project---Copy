// src/councils/DevCouncil.jsx

import React, { useEffect } from 'react';
import SidebarNav from '../components/UI/Sidebar';

import useTunnelStatus from '../hooks/useTunnelStatus';

// ✅ Council consoles
import NexoraConsole from '../components/NexoraConsole';
import SyvraConsole from '../components/SyvraConsole';
import DariusConsole from '../components/DariusConsole';

const DevCouncil = () => {
  const { tunnelStatus, connectTunnel, disconnectTunnel } = useTunnelStatus();

  useEffect(() => {
    connectTunnel();
    return () => {
      disconnectTunnel();
    };
  }, []);

  return (
    <div className="dev-council-container" style={{
      display: 'flex',
      height: '100vh',
      background: '#000',
      color: '#FFD700'
    }}>
      
      {/* ✅ SidebarNav stays for consistency */}
      <SidebarNav />

      <div style={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem',
        overflowY: 'auto'
      }}>
        <header style={{
          marginBottom: '2rem',
          borderBottom: '2px solid #FFD700',
          paddingBottom: '1rem'
        }}>
          <h1 style={{ margin: 0 }}>
            ⚙️ Dynasty App/Web Dev Council Room
          </h1>
          <p style={{ marginTop: '0.5rem' }}>
            Shadow Empress Elora oversees all operations. VS Code Tunnel Status: <strong>{tunnelStatus}</strong>
          </p>
        </header>

        {/* ✅ All Council Consoles rendered inline */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem'
        }}>
          <NexoraConsole />
          <SyvraConsole />
          <DariusConsole />
        </div>
      </div>
    </div>
  );
};

export default DevCouncil;
