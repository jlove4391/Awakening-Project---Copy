import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/NavBar.css';

const NavBar = () => {
  return (
    <nav className="navbar">
      <div className="nav-title">VIREON CORE</div>
      <ul className="nav-links">
        <li><Link to="/">Dashboard</Link></li>
        <li><Link to="/settings">Settings</Link></li>
        <li><Link to="/elora">Elora</Link></li>
        <li><Link to="/synq">Synq</Link></li>
        <li><Link to="/cipher">Cipher</Link></li>
        <li><Link to="/inner-circle">Inner Circle</Link></li>
        {/* Add more AI routes as needed */}
      </ul>
    </nav>
  );
};

export default NavBar;
