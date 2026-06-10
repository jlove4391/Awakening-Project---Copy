import React from 'react';
import './dynasty-ui.css';

const CrestHeader = ({
  title,
  subtitle,
  crest = '/assets/crests/house-of-love-crest.png',
  size = 'md',
}) => {
  const sizeClass = {
    sm: 'crest-sm',
    md: 'crest-md',
    lg: 'crest-lg',
  }[size] || 'crest-md';

  return (
    <div className="crest-header">
      <img
        src={crest}
        alt={`${title || 'Dynasty'} Crest`}
        className={`crest-img ${sizeClass}`}
      />
      {title && <h1 className="crest-title">{title}</h1>}
      {subtitle && <p className="crest-subtitle">{subtitle}</p>}
    </div>
  );
};

export default CrestHeader;
