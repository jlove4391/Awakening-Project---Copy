import React from 'react';

const NexoraConsole = () => (
  <section className="console-panel" aria-labelledby="nexora-title">
    <div className="console-header">
      <img src="/assets/crests/nexora.png" alt="Nexora Crest" className="crest-icon" />
      <h1 id="nexora-title">Nexora – Execution Shell</h1>
    </div>

    <div className="console-log">
      <div>
        <strong>Nexora:</strong> Execution bridge logic is intentionally offline in this clean route shell.
      </div>
      <div>
        The archived Nexora implementation remains in legacy for reference and should be reintroduced only after review.
      </div>
    </div>

    <div className="console-metrics">
      <p>Execution Bridge: Offline</p>
      <div className="bar-bg">
        <div className="bar-fill" style={{ width: '12%', background: '#d1aa64' }} />
      </div>
      <p>Runtime Mode: Placeholder</p>
      <p>Legacy Code: Reference only</p>
    </div>
  </section>
);

export default NexoraConsole;
