import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import GoogleLoginWrapper from './components/Auth/GoogleLoginWrapper';
import Sidebar from './components/UI/Sidebar';
import HomeDashboard from './components/HomeDashboard';
import InnerCircle from './components/InnerCircle';
import SovereignConsole from './components/SovereignConsole';
import SettingsPanel from './components/SettingsPanel';
import LogBusViewer from './components/LogBusViewer';

// ✅ PERSONAS
import EloraConsole from './components/EloraConsole';
import AuraConsole from './components/AuraConsole';
import CassianConsole from './components/CassianConsole';
import DariusConsole from './components/DariusConsole';
import GalenConsole from './components/GalenConsole';
import IraConsole from './components/IraConsole';
import JynxConsole from './components/JynxConsole';
import KaleConsole from './components/KaleConsole';
import LyraConsole from './components/LyraConsole';
import NexoraConsole from './components/NexoraConsole';
import NovaConsole from './components/NovaConsole';
import NovaraConsole from './components/NovaraConsole';
import NymeraConsole from './components/NymeraConsole';
import OrionConsole from './components/OrionConsole';
import SeleneConsole from './components/SeleneConsole';
import SeraphConsole from './components/SeraphConsole';
import SylvarisConsole from './components/SylvarisConsole';
import SyvraConsole from './components/SyvraConsole';
import ThornConsole from './components/ThornConsole';
import ValtrixConsole from './components/ValtrixConsole';
import VelvraConsole from './components/VelvraConsole';
import VeyraConsole from './components/VeyraConsole';
import ZyvraConsole from './components/ZyvraConsole';
import CipherConsole from './components/CipherConsole';
import SynqConsole from './components/SynqConsole';

// ✅ SPECIAL ENVOYS
import SoreinConsole from './components/SoreinConsole';
import ValenConsole from './components/ValenConsole';

// ✅ DEV COUNCIL
import DevCouncil from './councils/DevCouncil';

// ✅ Nexora VS Code panel
import NexoraConsolePanel from './components/NexoraConsolePanel.jsx';

import './styles/dynasty-ui.css';
import './styles/nexoraConsole.css';

function App() {
  return (
    <Router>
      <div className="app-wrapper">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route
              path="/login"
              element={<GoogleLoginWrapper onSuccess={() => window.location.replace('/')} />}
            />
            <Route path="/" element={<HomeDashboard />} />

            {/* Consoles */}
            <Route path="/elora" element={<EloraConsole />} />
            <Route path="/aura" element={<AuraConsole />} />
            <Route path="/cassian" element={<CassianConsole />} />
            <Route path="/darius" element={<DariusConsole />} />
            <Route path="/galen" element={<GalenConsole />} />
            <Route path="/ira" element={<IraConsole />} />
            <Route path="/jynx" element={<JynxConsole />} />
            <Route path="/kale" element={<KaleConsole />} />
            <Route path="/lyra" element={<LyraConsole />} />
            <Route path="/nexora" element={<NexoraConsole />} />
            <Route path="/nova" element={<NovaConsole />} />
            <Route path="/novara" element={<NovaraConsole />} />
            <Route path="/nymera" element={<NymeraConsole />} />
            <Route path="/orion" element={<OrionConsole />} />
            <Route path="/selene" element={<SeleneConsole />} />
            <Route path="/seraph" element={<SeraphConsole />} />
            <Route path="/sylvaris" element={<SylvarisConsole />} />
            <Route path="/syvra" element={<SyvraConsole />} />
            <Route path="/thorn" element={<ThornConsole />} />
            <Route path="/valtrix" element={<ValtrixConsole />} />
            <Route path="/velvra" element={<VelvraConsole />} />
            <Route path="/veyra" element={<VeyraConsole />} />
            <Route path="/zyvra" element={<ZyvraConsole />} />
            <Route path="/cipher" element={<CipherConsole />} />
            <Route path="/synq" element={<SynqConsole />} />

            {/* Special Envoys */}
            <Route path="/sorein" element={<SoreinConsole />} />
            <Route path="/valen" element={<ValenConsole />} />

            {/* Dev Council */}
            <Route path="/dev-council/*" element={<DevCouncil />} />

            {/* System */}
            <Route path="/inner-circle" element={<InnerCircle />} />
            <Route path="/sovereign" element={<SovereignConsole />} />
            <Route path="/settings" element={<SettingsPanel />} />
            <Route path="/logbus" element={<LogBusViewer />} />

            {/* Nexora VS Code panel */}
            <Route path="/nexora-console" element={<>
              <h2 style={{ marginTop: 16 }}>Nexora Console</h2>
              <NexoraConsolePanel />
            </>} />

            <Route
              path="*"
              element={<h1 style={{ color: 'white', padding: '2rem' }}>Console not found.</h1>}
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
