import React from 'react';
import './dynasty-ui.css';

const DynastyCard = ({ title, children, footer, crest }) => {
  return (
    <div className="dynasty-card">
      {crest && (
        <img
          src={crest}
          alt="Crest"
          className="dynasty-card-crest"
        />
      )}
      {title && <h2 className="dynasty-card-title">{title}</h2>}
      <div className="dynasty-card-body">
        {children}
      </div>
      {footer && <div className="dynasty-card-footer">{footer}</div>}
    </div>
  );
};

export default DynastyCard;
