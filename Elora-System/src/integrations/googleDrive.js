// /src/integrations/googleDrive.js

const BACKEND_URL = 'http://localhost:4000';

export async function listDriveFiles() {
  try {
    const res = await fetch(`${BACKEND_URL}/google/drive/files`);
    return await res.json();
  } catch (err) {
    console.error('Failed to list drive files:', err);
    return [];
  }
}
