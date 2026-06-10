import React from 'react';

const routeStatus = [
  { path: '/', label: 'Home dashboard', state: 'active' },
  { path: '/elora', label: 'Elora console', state: 'active shell' },
  { path: '/nexora', label: 'Nexora console', state: 'placeholder' },
  { path: '/settings', label: 'Runtime status', state: 'active' },
  { path: '/status', label: 'Runtime status alias', state: 'active' },
];

const RuntimeStatus = () => (
  <section className="console-panel" aria-labelledby="runtime-status-title">
    <div className="console-header">
      <img src="/assets/icons/override.png" alt="" className="crest-icon" aria-hidden="true" />
      <h1 id="runtime-status-title">Runtime / Config Status</h1>
    </div>

    <div className="console-log">
      <div>
        <strong>System:</strong> Active navigation is limited to the dashboard, Elora, Nexora, and runtime status.
      </div>
      <div>Broader persona council routes and imports are not part of the active application shell.</div>
    </div>

    <div className="console-metrics">
      <p>Application Mode: Minimal route shell</p>
      <p>Legacy Visuals: Stored under legacy only</p>
      <p>Runtime Integrations: Disabled until intentionally rebuilt</p>
    </div>

    <div className="console-log" aria-label="Active routes">
      {routeStatus.map((route) => (
        <div key={route.path}>
          <strong>{route.path}</strong> — {route.label}: {route.state}
        </div>
      ))}
    </div>
  </section>
);

export default RuntimeStatus;
