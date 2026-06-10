import React from 'react';
import { Navigate } from 'react-router-dom';

// ✅ Secure route wrapper
export default function ProtectedRoute({ isAuthenticated, element, redirectTo = "/" }) {
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }
  return element;
}
