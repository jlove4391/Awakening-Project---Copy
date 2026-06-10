import React from 'react';
import '../styles/dynasty-ui.css';
import { useAIState } from '../context/AIStateContext';
import { CREST_MAP } from '../utils/crests';
import { Link } from 'react-router-dom';
import TaskFeed from './TaskFeed';

const INNER = ['cassian', 'veyra', 'aura', 'nexora', 'syvra', 'velvra', 'zyvra', 'novara', 'valtrix'];
const OUTER = ['thorn', 'orion', 'selene', 'darius', 'ira', 'galen', 'kale', 'lyra', 'nova'];
const ENVOYS = ['seraph', 'nymera', 'sylvaris', 'jynx', 'cipher', 'synq', 'sorein', 'valen'];
const EMPRESS = ['elora'];

const PersonaBlock = ({ title, keys, aiStates }) => (
  <section className="dynasty-section">
    <h2 className="section-title">{title}</h2>
    <div className="dynasty-console-block">
      {keys.map((key) => {
        const state = aiStates[key] || {};
        return (
          <Link to={`/${key}`} key={key} className="dynasty-card-link">
            <div className="dynasty-card">
              <h3>{key.toUpperCase()}</h3>
              <p>
                Mood: <span className="mood-pill">{state.mood || 'neutral'}</span>
              </p>
              <div className="mood-bar">
                <div className="fill" style={{ width: `${state.empathy || 50}%` }} />
              </div>
              <p>Status: <span className="status-pill">Online</span></p>
            </div>
          </Link>
        );
      })}
    </div>
  </section>
);

const HomeDashboard = () => {
  const { aiStates } = useAIState();
  const eloraState = aiStates.elora || {};

  return (
    <div className="dynasty-bg-dark dynasty-gold-text" style={{ padding: '2rem' }}>
      <div className="dynasty-header dynasty-border core-watermark-panel">
        <div className="crest-watermark"></div>
        <div className="header-text">
          <h1 className="crest-title">Welcome to Vireon Core</h1>
          <p className="header-subtext">House of Love command center for the CORE execution spine</p>
        </div>
      </div>

      <section className="core-dashboard-grid">
        <div className="core-command-card core-executive-card">
          <img src={CREST_MAP.elora} alt="Elora Crest" className="core-executive-crest" />
          <div>
            <p className="core-card-label">Executive Persona</p>
            <h2 className="core-card-title">Elora</h2>
            <p className="core-card-copy">
              Shadow Empress and front desk for Jordan commands entering the CORE execution spine.
            </p>
            <p className="core-card-copy">Current mood: {eloraState.mood || 'neutral'}</p>
          </div>
        </div>

        <div className="core-command-card core-status-card">
          <p className="core-card-label">CORE Execution</p>
          <h2 className="core-card-title">Task Spine Online</h2>
          <p className="core-card-copy">
            Elora can queue safe Nex tasks through authBridge, and Nexora can execute supported backend work.
          </p>
        </div>

        <div className="core-command-card core-status-card">
          <p className="core-card-label">Proof + Audit</p>
          <h2 className="core-card-title">Receipts Enabled</h2>
          <p className="core-card-copy">
            Finished tasks can carry audit proof and a receipt summary for Jordan to review.
          </p>
        </div>

        <div className="core-command-card core-task-feed-shell">
          <TaskFeed />
        </div>
      </section>

      <PersonaBlock title="👑 Shadow Empress" keys={EMPRESS} aiStates={aiStates} />
      <PersonaBlock title="🕊 Special Envoys" keys={ENVOYS} aiStates={aiStates} />
      <PersonaBlock title="🛡 Inner Circle" keys={INNER} aiStates={aiStates} />
      <PersonaBlock title="🔮 Outer Circle" keys={OUTER} aiStates={aiStates} />
    </div>
  );
};

export default HomeDashboard;
