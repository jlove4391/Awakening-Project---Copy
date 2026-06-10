import React from 'react';
import './dynasty-ui.css';

const GlowInput = ({ label, value, onChange, placeholder, type = 'text', name, id }) => {
  return (
    <div className="glow-input-group">
      {label && <label htmlFor={id || name} className="glow-input-label">{label}</label>}
      <input
        type={type}
        name={name}
        id={id || name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="glow-input-field"
        autoComplete="off"
      />
    </div>
  );
};

export default GlowInput;
