// NexoraHandler.js
import axios from 'axios';

// ⚡️ HARD-CODED local bridge for local dev — bulletproof:
const BRIDGE_URL = 'http://localhost:4000';  
const BRIDGE_SECRET = 'YourSuperSecureToken';

export async function handleVSCodeBridge(action, payload) {
  if (!BRIDGE_URL) {
    console.error('❌ Bridge URL missing.');
    throw new Error('Bridge URL is missing.');
  }
  if (!BRIDGE_SECRET) {
    console.error('❌ Bridge secret missing.');
    throw new Error('Bridge secret is missing.');
  }

  const response = await axios.post(`${BRIDGE_URL}/api/bridge/${action}`, payload, {
    headers: {
      Authorization: `Bearer ${BRIDGE_SECRET}`,
    },
  });

  return response.data;
}
