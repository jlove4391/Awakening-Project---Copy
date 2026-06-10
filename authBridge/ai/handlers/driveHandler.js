// authBridge/ai/handlers/driveHandler.js
import { google } from 'googleapis';
import { getOAuth2Client } from '../../utils/googleClient.js';

const MODE = (process.env.INTEGRATIONS_MODE || 'live').toLowerCase();

/**
 * Body shape:
 * {
 *   action: "listFiles" | "createFolder",
 *   data?: {
 *     // listFiles:
 *     pageSize?: number,
 *     query?: string,
 *     fields?: string, // optional fields override
 *     // createFolder:
 *     folderName?: string,
 *     parentId?: string
 *   }
 * }
 */
export async function handleDriveTask(req, res) {
  const { action, data = {} } = req.body || {};

  try {
    // Mock mode short-circuits external calls for plumbing tests
    if (MODE === 'mock') {
      switch (action) {
        case 'listFiles':
          return res.json({
            ok: true,
            mode: 'mock',
            files: [
              { id: 'mock-file-1', name: 'Mock Doc 1' },
              { id: 'mock-file-2', name: 'Mock Sheet 2' }
            ]
          });
        case 'createFolder':
          return res.json({
            ok: true,
            mode: 'mock',
            folderId: 'mock-folder-123'
          });
        default:
          return res.status(400).json({ ok: false, mode: 'mock', error: `Unknown Drive action: ${action}` });
      }
    }

    // Live mode
    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });

    switch (action) {
      case 'listFiles': {
        const pageSize = data.pageSize ?? 10;
        const q = data.query ?? ''; // e.g., "name contains 'Budget'"
        const fields = data.fields ?? 'files(id, name, mimeType, modifiedTime, parents)';

        const resp = await drive.files.list({
          pageSize,
          q,
          fields
        });
        return res.json({ ok: true, mode: 'live', files: resp.data.files || [] });
      }

      case 'createFolder': {
        const metadata = {
          name: data.folderName || 'New Folder',
          mimeType: 'application/vnd.google-apps.folder',
          ...(data.parentId ? { parents: [data.parentId] } : {})
        };
        const resp = await drive.files.create({
          requestBody: metadata,
          fields: 'id, name'
        });
        return res.json({ ok: true, mode: 'live', folderId: resp.data.id, name: resp.data.name });
      }

      default:
        return res.status(400).json({ ok: false, mode: 'live', error: `Unknown Drive action: ${action}` });
    }
  } catch (err) {
    // Google errors often carry response.data with details
    const provider = err?.response?.data;
    console.error('Drive task failed:', provider || err);
    const status = err?.response?.status || 500;
    return res.status(status).json({
      ok: false,
      mode: MODE,
      error: err.message || 'drive_error',
      provider
    });
  }
}
