// Elora-System/src/elora/intentRouter.ts
import { GoogleActions } from './google';


type Intent =
  | { kind: 'calendar.list' }
  | { kind: 'drive.list'; pageSize?: number }
  | { kind: 'drive.newFolder'; name: string; parentId?: string }
  | { kind: 'gmail.list'; max?: number; query?: string }
  | { kind: 'gmail.send'; to: string; subject: string; body: string };

export async function runIntent(intent: Intent) {
  switch (intent.kind) {
    case 'calendar.list':
      return await GoogleActions.calendarList();

    case 'drive.list':
      return await GoogleActions.driveList(intent.pageSize ?? 10);

    case 'drive.newFolder':
      return await GoogleActions.driveCreateFolder(intent.name, intent.parentId);

    case 'gmail.list':
      return await GoogleActions.gmailList(intent.max ?? 5, intent.query ?? '');

    case 'gmail.send':
      return await GoogleActions.gmailSend(intent.to, intent.subject, intent.body);

    default:
      throw new Error(`Unknown intent: ${(intent as any).kind}`);
  }
}
