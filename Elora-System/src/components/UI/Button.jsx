import React from 'react';
import './dynasty-ui.css';

const Button = ({ label, onClick, type = 'primary', disabled = false }) => {
  const buttonClass = `dynasty-button ${type} ${disabled ? 'disabled' : ''}`;

  return (
    <button
      className={buttonClass}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
};

export default Button;

