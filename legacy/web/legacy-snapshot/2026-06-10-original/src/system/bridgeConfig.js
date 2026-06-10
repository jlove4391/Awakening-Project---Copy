// bridgeConfig.js

// ✅ Works in Node AND React safely.
export const BRIDGE_URL =
  process.env.VITE_API_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5001';

export const BRIDGE_SECRET =
  process.env.VITE_SOVEREIGN_API_TOKEN ||
  process.env.REACT_APP_SOVEREIGN_API_TOKEN ||
  'changeme';

console.log('[bridgeConfig.js] BRIDGE_URL:', BRIDGE_URL);
console.log('[bridgeConfig.js] BRIDGE_SECRET:', BRIDGE_SECRET);
