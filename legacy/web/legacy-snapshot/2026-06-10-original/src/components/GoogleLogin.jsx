import React from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const GoogleLoginWrapper = ({ onSuccess }) => {
  const handleSuccess = (credentialResponse) => {
    const token = credentialResponse.credential;
    localStorage.setItem('googleAccessToken', token);
    console.log('✅ Token stored:', token);
    onSuccess?.();
  };

  return (
    <GoogleOAuthProvider clientId="135645140461-cv9h849uruapqcqmhsp6gnah9nb5nqlg.apps.googleusercontent.com">
      <div style={{ marginTop: '100px', textAlign: 'center' }}>
        <h2>Sign in with Google</h2>
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => console.log('Login Failed')}
        />
      </div>
    </GoogleOAuthProvider>
  );
};

export default GoogleLoginWrapper;
