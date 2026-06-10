// BridgeManager.js
import axios from 'axios';
import { logEvent } from './LogBus';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json'
};

/**
 * Generic POST to a specific bridge endpoint.
 * @param {string} persona - AI persona name (e.g., 'elora', 'nexora')
 * @param {string} action - The backend route action (e.g., 'openFile', 'summarize')
 * @param {Object} payload - Optional data to send
 * @returns {Object} - { success, message, data }
 */
export async function postToBridge(persona, action, payload = {}) {
  const token = localStorage.getItem('bridgeToken') || `${persona}-dev`;

  try {
    const response = await axios.post(
      `http://localhost:5001/${persona}/${action}`,
      payload,
      {
        headers: {
          ...DEFAULT_HEADERS,
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = response.data;

    if (!data.success) {
      logEvent(persona, 'BridgeFailure', `Bridge ${action} failed: ${data.message}`);
    } else {
      logEvent(persona, 'BridgeSuccess', `Bridge ${action} succeeded`);
    }

    return data;
  } catch (err) {
    console.error(`[BridgeManager] ${persona} → ${action} failed:`, err.message);
    logEvent(persona, 'BridgeError', err.message);
    return {
      success: false,
      message: 'Bridge request failed. Check backend connection.',
      error: err.message
    };
  }
}

/**
 * Ping a bridge for status check.
 * @param {string} persona
 * @returns {boolean}
 */
export async function pingBridge(persona) {
  try {
    const res = await axios.get(`http://localhost:5001/${persona}/ping`);
    return res.data?.status === 'ok';
  } catch (err) {
    console.warn(`[BridgeManager] ${persona} bridge unreachable.`);
    return false;
  }
}

/**
 * Batch bridge tasks if needed.
 * @param {Array} tasks - [{ persona, action, payload }]
 * @returns {Array} of results
 */
export async function batchBridgeRequests(tasks) {
  const results = [];

  for (const { persona, action, payload } of tasks) {
    const result = await postToBridge(persona, action, payload);
    results.push({ persona, action, result });
  }

  return results;
}
