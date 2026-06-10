import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/dynasty-ui.css';
import ExecutionReceiptsPanel from './ExecutionReceiptsPanel';
import '../styles/HomeDashboard.css';

const routeCards = [
  {
    key: 'dashboard',
    title: 'Home Dashboard',
    copy: 'Minimal command overview for the cleaned Elora system shell.',
    status: 'Online',
    to: '/',
  },
  {
    key: 'elora',
    title: 'Elora Console',
    copy: 'Primary conversational surface preserved without council route dependencies.',
    status: 'Active shell',
    to: '/elora',
  },
  {
    key: 'nexora',
    title: 'Nexora Console',
    copy: 'Placeholder execution shell ready for a future reviewed bridge implementation.',
    status: 'Placeholder',
    to: '/nexora',
  },
  {
    key: 'status',
    title: 'Runtime Status',
    copy: 'Configuration summary for the reduced route tree and archived integrations.',
    status: 'Active',
    to: '/status',
  },
];

const RouteCard = ({ route }) => (
  <Link to={route.to} className="dynasty-card-link">
    <article className="dynasty-card">
      <h3>{route.title}</h3>
      <p>{route.copy}</p>
      <p>
        Status: <span className="status-pill">{route.status}</span>
      </p>
    </article>
  </Link>
);

const HomeDashboard = () => {
  return (
    <div className="dynasty-bg-dark dynasty-gold-text" style={{ padding: '2rem' }}>
      <div className="dynasty-header dynasty-border core-watermark-panel">
        <div className="crest-watermark"></div>
        <div className="header-text">
          <h1 className="crest-title">Welcome to Vireon Core</h1>
          <p className="header-subtext">Minimal Elora system shell for the next clean implementation pass</p>
        </div>
      </div>

      <section className="core-dashboard-grid" aria-label="Minimal route tree">
        <div className="core-command-card core-executive-card">
          <img src="/assets/crests/elora.png" alt="Elora Crest" className="core-executive-crest" />
          <div>
            <p className="core-card-label">Primary Console</p>
            <h2 className="core-card-title">Elora</h2>
            <p className="core-card-copy">
              The active application now keeps only the dashboard, Elora, Nexora, and status surfaces mounted.
            </p>
            <p className="core-card-copy">Current mode: visual shell</p>
          </div>
        </div>

        <div className="core-command-card core-status-card">
          <p className="core-card-label">Route Tree</p>
          <h2 className="core-card-title">Reduced</h2>
          <p className="core-card-copy">
            Broader persona council screens are removed from active routing and remain available only in legacy archives.
          </p>
        </div>

        <div className="core-command-card core-status-card">
          <p className="core-card-label">Runtime Policy</p>
          <h2 className="core-card-title">Reference Only</h2>
          <p className="core-card-copy">
            Legacy code should be reviewed, copied intentionally, and adapted before it is imported into the new app.
          </p>
        </div>
      </section>

      <ExecutionReceiptsPanel />

      <section className="dynasty-section" aria-labelledby="route-card-title">
        <h2 id="route-card-title" className="section-title">Active Routes</h2>
        <div className="dynasty-console-block">
          {routeCards.map((route) => (
            <RouteCard key={route.key} route={route} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomeDashboard;
