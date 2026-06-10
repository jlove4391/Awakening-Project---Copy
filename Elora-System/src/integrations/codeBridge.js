// /src/integrations/codeBridge.js

const LOCAL_BRIDGE_PORT = 41337; // Default for local VS Code socket

export async function getActiveProjectStatus() {
  try {
    const res = await fetch(`http://localhost:${LOCAL_BRIDGE_PORT}/status`);
    return await res.json();
  } catch (err) {
    console.error('CodeBridge: No local connection found.');
    return { active: false };
  }
}

export async function requestFileEdit(path, content) {
  try {
    const res = await fetch(`http://localhost:${LOCAL_BRIDGE_PORT}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content })
    });
    return await res.json();
  } catch (err) {
    console.error('CodeBridge: File edit failed.');
    return { success: false };
  }
}
