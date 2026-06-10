import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Sidebar from './components/UI/Sidebar';
import HomeDashboard from './components/HomeDashboard';
import EloraConsole from './components/EloraConsole';

import './styles/dynasty-ui.css';
import './styles/HomeDashboard.css';
import './styles/EloraConsole.css';
import './styles/nexoraConsole.css';

const NexoraShell = () => (
  <div className="console-panel">
    <div className="console-header">
      <img src="/assets/crests/nexora.png" alt="Nexora Crest" className="crest-icon" />
      <h1>Nexora – Execution Shell</h1>
    </div>
    <div className="console-log">
      <div>
        <strong>Nexora:</strong> Backend bridge logic has been archived. This route now serves as a visual placeholder for the next implementation pass.
      </div>
    </div>
    <div className="console-metrics">
      <p>Execution Bridge: Archived</p>
      <div className="bar-bg">
        <div className="bar-fill" style={{ width: '12%', background: '#d1aa64' }} />
      </div>
      <p>Review archived code before reconnecting services.</p>
    </div>
  </div>
);

const SettingsStatusShell = () => (
  <div className="console-panel">
    <div className="console-header">
      <img src="/assets/icons/override.png" alt="Settings" className="crest-icon" />
      <h1>Settings / Status</h1>
    </div>
    <div className="console-log">
      <div>
        <strong>System:</strong> The new app is a visual shell. Archived integrations are reference-only until reviewed and rebuilt.
      </div>
    </div>
    <div className="console-metrics">
      <p>Visual shell: Active</p>
      <p>Legacy imports: Disabled</p>
      <p>Routes: Dashboard, Elora, Nexora, Settings/Status</p>
    </div>
  </div>
);

function App() {
  return (
    <Router>
      <div className="app-wrapper">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomeDashboard />} />
            <Route path="/elora" element={<EloraConsole />} />
            <Route path="/nexora" element={<NexoraShell />} />
            <Route path="/settings" element={<SettingsStatusShell />} />
            <Route path="/status" element={<SettingsStatusShell />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
