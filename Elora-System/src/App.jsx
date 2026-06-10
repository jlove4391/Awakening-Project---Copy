import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

import Sidebar from './components/UI/Sidebar';
import HomeDashboard from './components/HomeDashboard';
import EloraConsole from './components/EloraConsole';
import NexoraConsole from './components/NexoraConsole';
import RuntimeStatus from './components/RuntimeStatus';

import './styles/dynasty-ui.css';
import './styles/HomeDashboard.css';
import './styles/EloraConsole.css';
import './styles/nexoraConsole.css';

const NotFound = () => (
  <section className="console-panel" aria-labelledby="not-found-title">
    <div className="console-header">
      <img src="/assets/icons/scroll.png" alt="" className="crest-icon" aria-hidden="true" />
      <h1 id="not-found-title">Route not found</h1>
    </div>
    <div className="console-log">
      <div>
        <strong>System:</strong> This path is outside the minimal Elora route tree.
      </div>
      <div>
        Return to the <Link to="/">dashboard</Link>, or open <Link to="/elora">Elora</Link>,{' '}
        <Link to="/nexora">Nexora</Link>, or <Link to="/status">status</Link>.
      </div>
    </div>
  </section>
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
            <Route path="/nexora" element={<NexoraConsole />} />
            <Route path="/settings" element={<RuntimeStatus />} />
            <Route path="/status" element={<RuntimeStatus />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
