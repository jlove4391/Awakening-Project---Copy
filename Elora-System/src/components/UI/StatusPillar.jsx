import React from 'react';
import './dynasty-ui.css';

const StatusPillar = ({ label, value, max = 100, color = '#ffd700' }) => {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <div className="status-pillar">
      <div className="status-label">{label}</div>
      <div className="status-bar-outer">
        <div
          className="status-bar-inner"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        ></div>
      </div>
      <div className="status-value">{value}/{max}</div>
    </div>
  );
};

export default StatusPillar;
