// /src/utils/authManager.js

const BACKEND_URL = 'http://localhost:5000'; // Change to production when deployed

export async function initiateGoogleOAuth() {
  window.location.href = `${BACKEND_URL}/auth/google`;
}

export async function initiateNotionOAuth() {
  window.location.href = `${BACKEND_URL}/auth/notion`;
}

export async function checkAuthStatus(service) {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/status/${service}`);
    const data = await res.json();
    return data.authenticated;
  } catch (err) {
    console.error(`Error checking ${service} auth status:`, err);
    return false;
  }
}
