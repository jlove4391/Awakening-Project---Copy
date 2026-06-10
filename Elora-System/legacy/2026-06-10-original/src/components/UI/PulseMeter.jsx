import React from 'react';
import './dynasty-ui.css';

const PulseMeter = ({ value = 50, label = 'Pulse', max = 100 }) => {
  const percentage = Math.min(Math.max(value, 0), max);
  const meterWidth = (percentage / max) * 100;

  return (
    <div className="pulse-meter-container">
      <div className="pulse-meter-label">{label}</div>
      <div className="pulse-meter-bar">
        <div
          className="pulse-meter-fill"
          style={{ width: `${meterWidth}%` }}
        ></div>
      </div>
    </div>
  );
};

export default PulseMeter;
