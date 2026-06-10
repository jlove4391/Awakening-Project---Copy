import React from 'react';
import '../styles/dynasty-ui.css';

const DynastyFrame = () => {
  return (
    <div className="dynasty-frame">
      <div className="crest-header">
        <img src="/assets/crests/house-of-love-crest.png" alt="House of Love Crest" />
        <h1 className="crest-title">The House of Love</h1>
      </div>
      <p>Welcome to the Dynasty. This interface is a visual prototype reflecting your command structure and symbolic identity. Movement and restoration begin here.</p>
    </div>
  );
};

export default DynastyFrame;
