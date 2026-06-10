import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/dynasty-ui.css';

const iconStyle = { width: '42px', height: '42px' };

const Sidebar = () => {
  return (
    <div className="dynasty-sidebar">
      <Link to="/">
        <img src="/assets/icons/crest.png" alt="Dashboard" className="sidebar-icon" style={iconStyle} />
      </Link>

      <Link to="/elora">
        <img src="/assets/icons/moon.png" alt="Elora" className="sidebar-icon" style={iconStyle} />
      </Link>

      <Link to="/nexora">
        <img src="/assets/icons/flame.png" alt="Nexora" className="sidebar-icon" style={iconStyle} />
      </Link>

      <Link to="/settings">
        <img src="/assets/icons/override.png" alt="Settings" className="sidebar-icon" style={iconStyle} />
      </Link>
    </div>
  );
};

export default Sidebar;
