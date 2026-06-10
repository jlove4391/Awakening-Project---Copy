import React from 'react';
import Sidebar from './UI/Sidebar';

const Layout = ({ children }) => {
  return (
    <>
      <Sidebar />
      <div className="dynasty-main-content">
        {children}
      </div>
    </>
  );
};

export default Layout;
