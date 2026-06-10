import React from 'react';
import EloraConsole from './EloraConsole';
import NovaConsole from './NovaConsole';
import SeleneConsole from './SeleneConsole';
import JynxConsole from './JynxConsole';
import SovereignConsole from './SovereignConsole';

const InnerCircle = () => {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Inner Circle Console</h1>
      <p>All core operational AIs side-by-side</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div><EloraConsole /></div>
        <div><NovaConsole /></div>
        <div><SeleneConsole /></div>
        <div><JynxConsole /></div>
        <div><SovereignConsole /></div>
      </div>
    </div>
  );
};

export default InnerCircle;
