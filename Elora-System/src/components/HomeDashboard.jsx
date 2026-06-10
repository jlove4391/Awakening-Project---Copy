import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/dynasty-ui.css';
import '../styles/HomeDashboard.css';

const personaGroups = [
  {
    title: '👑 Shadow Empress',
    personas: [{ key: 'elora', mood: 'watchful', empathy: 88, status: 'Visual shell' }],
  },
  {
    title: '🛡 Active Shell Routes',
    personas: [
      { key: 'dashboard', mood: 'ready', empathy: 92, status: 'Online', to: '/' },
      { key: 'nexora', mood: 'archived', empathy: 18, status: 'Placeholder', to: '/nexora' },
      { key: 'settings', mood: 'steady', empathy: 65, status: 'Shell only', to: '/settings' },
    ],
  },
  {
    title: '📦 Archived Implementation',
    personas: [
      { key: 'bridges', mood: 'reference', empathy: 25, status: 'Legacy services' },
      { key: 'contexts', mood: 'review', empathy: 20, status: 'Archived' },
      { key: 'voice', mood: 'paused', empathy: 15, status: 'Archived' },
    ],
  },
];

const PersonaBlock = ({ title, personas }) => (
  <section className="dynasty-section">
    <h2 className="section-title">{title}</h2>
    <div className="dynasty-console-block">
      {personas.map((persona) => {
        const card = (
          <div className="dynasty-card">
            <h3>{persona.key.toUpperCase()}</h3>
            <p>
              Mood: <span className="mood-pill">{persona.mood}</span>
            </p>
            <div className="mood-bar">
              <div className="fill" style={{ width: `${persona.empathy}%` }} />
            </div>
            <p>Status: <span className="status-pill">{persona.status}</span></p>
          </div>
        );

        return persona.to ? (
          <Link to={persona.to} key={persona.key} className="dynasty-card-link">
            {card}
          </Link>
        ) : (
          <div key={persona.key}>{card}</div>
        );
      })}
    </div>
  </section>
);

const HomeDashboard = () => {
  return (
    <div className="dynasty-bg-dark dynasty-gold-text" style={{ padding: '2rem' }}>
      <div className="dynasty-header dynasty-border core-watermark-panel">
        <div className="crest-watermark"></div>
        <div className="header-text">
          <h1 className="crest-title">Welcome to Vireon Core</h1>
          <p className="header-subtext">House of Love visual shell for the next clean implementation pass</p>
        </div>
      </div>

      <section className="core-dashboard-grid">
        <div className="core-command-card core-executive-card">
          <img src="/assets/crests/elora.png" alt="Elora Crest" className="core-executive-crest" />
          <div>
            <p className="core-card-label">Executive Persona</p>
            <h2 className="core-card-title">Elora</h2>
            <p className="core-card-copy">
              Shadow Empress visual surface preserved while command, bridge, and voice logic are archived for review.
            </p>
            <p className="core-card-copy">Current mode: visual shell</p>
          </div>
        </div>

        <div className="core-command-card core-status-card">
          <p className="core-card-label">CORE Execution</p>
          <h2 className="core-card-title">Disconnected by Design</h2>
          <p className="core-card-copy">
            Runtime integrations were moved into legacy archives so the new app can rebuild from a clean shell.
          </p>
        </div>

        <div className="core-command-card core-status-card">
          <p className="core-card-label">Archive Policy</p>
          <h2 className="core-card-title">Reference Only</h2>
          <p className="core-card-copy">
            Legacy code should be reviewed, copied intentionally, and adapted before it is imported into the new app.
          </p>
        </div>
      </section>

      {personaGroups.map((group) => (
        <PersonaBlock key={group.title} title={group.title} personas={group.personas} />
      ))}
    </div>
  );
};

export default HomeDashboard;
