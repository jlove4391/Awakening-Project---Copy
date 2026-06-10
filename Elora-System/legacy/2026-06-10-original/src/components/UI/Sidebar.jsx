// src/components/UI/Sidebar.jsx

import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/dynasty-ui.css';

const Sidebar = () => {
  return (
    <div className="dynasty-sidebar">
      <Link to="/">
        <img src="/assets/icons/crest.png" alt="Dashboard" className="sidebar-icon" style={{ width: '42px', height: '42px' }} />
      </Link>

      <Link to="/elora">
        <img src="/assets/icons/moon.png" alt="Elora" className="sidebar-icon" style={{ width: '42px', height: '42px' }} />
      </Link>

      {/* ✅ NEW: Single Dev Council button */}
      <Link to="/dev-council">
        <img src="/assets/icons/council.png" alt="Dev Council" className="sidebar-icon" style={{ width: '42px', height: '42px' }} />
      </Link>

      <Link to="/sovereign">
        <img src="/assets/icons/flame.png" alt="Sovereign" className="sidebar-icon" style={{ width: '42px', height: '42px' }} />
      </Link>

      <Link to="/settings">
        <img src="/assets/icons/override.png" alt="Settings" className="sidebar-icon" style={{ width: '42px', height: '42px' }} />
      </Link>
    </div>
  );
};

export default Sidebar;
