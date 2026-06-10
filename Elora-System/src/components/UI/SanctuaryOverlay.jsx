import React from 'react';
import './dynasty-ui.css';

const SanctuaryOverlay = ({ active = false, onClose }) => {
  if (!active) return null;

  return (
    <div className="sanctuary-overlay">
      <div className="sanctuary-glow"></div>
      <div className="sanctuary-content">
        <h2 className="sanctuary-title">Sanctuary Mode</h2>
        <p className="sanctuary-text">
          The Wellspring is active. All Dynasty flows recalibrating.
        </p>
        {onClose && (
          <button className="sanctuary-close" onClick={onClose}>
            Exit Sanctuary
          </button>
        )}
      </div>
    </div>
  );
};

export default SanctuaryOverlay;
