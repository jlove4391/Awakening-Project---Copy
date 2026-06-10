// Elora-System/src/elora/actions/google.ts
import { AuthBridge } from '../../clients/authBridge';

export const GoogleActions = {
  ensureLinked: async (): Promise<boolean> => {
    const { google } = await AuthBridge.getStatus();
    if (google?.linked) return true;
    const { url } = await AuthBridge.getAuthStartUrl();
    // Open OAuth in a new tab/window for the user to complete
    window.open(url, '_blank', 'noopener,noreferrer');
    return false;
  },

  calendarList: async () => {
    if (!(await GoogleActions.ensureLinked())) throw new Error('Google not linked yet. Finish OAuth and retry.');
    const { events } = await AuthBridge.listEvents();
    return events;
  },

  driveList: async (pageSize = 10) => {
    if (!(await GoogleActions.ensureLinked())) throw new Error('Google not linked yet.');
    const { files } = await AuthBridge.driveList(pageSize);
    return files;
  },

  driveCreateFolder: async (name: string, parentId?: string) => {
    if (!(await GoogleActions.ensureLinked())) throw new Error('Google not linked yet.');
    const { folderId } = await AuthBridge.driveCreateFolder(name, parentId);
    return folderId;
  },

  gmailList: async (max = 5, query = '') => {
    if (!(await GoogleActions.ensureLinked())) throw new Error('Google not linked yet.');
    const { messages } = await AuthBridge.gmailList(max, query);
    return messages;
  },

  gmailSend: async (to: string, subject: string, body: string) => {
    if (!(await GoogleActions.ensureLinked())) throw new Error('Google not linked yet.');
    const res = await AuthBridge.gmailSend(to, subject, body);
    return res.message;
  },
};

