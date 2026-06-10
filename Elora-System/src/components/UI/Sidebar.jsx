import React from 'react';
import { NavLink } from 'react-router-dom';
import '../../styles/dynasty-ui.css';

const iconStyle = { width: '42px', height: '42px' };

const navigationItems = [
  { to: '/', label: 'Dashboard', icon: '/assets/icons/crest.png', end: true },
  { to: '/elora', label: 'Elora', icon: '/assets/icons/moon.png' },
  { to: '/nexora', label: 'Nexora', icon: '/assets/icons/flame.png' },
  { to: '/status', label: 'Status', icon: '/assets/icons/override.png' },
];

const Sidebar = () => {
  return (
    <nav className="dynasty-sidebar" aria-label="Primary navigation">
      {navigationItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}
          aria-label={item.label}
          title={item.label}
        >
          <img src={item.icon} alt="" className="sidebar-icon" style={iconStyle} aria-hidden="true" />
        </NavLink>
      ))}
    </nav>
  );
};

export default Sidebar;
