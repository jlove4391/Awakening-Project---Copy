// /system/TaskDelegator.js
import { handleVSCodeBridge } from './NexoraHandler';
import { logBus } from './LogBus';

export async function delegateToNexora(task) {
  const { command, file, content } = task;

  let response;
  try {
    switch (command) {
      case 'get-file':
        response = await handleVSCodeBridge('get-file', { relativePath: file });
        break;

      case 'update-file':
        response = await handleVSCodeBridge('update-file', { relativePath: file, content });
        break;

      case 'run-scan':
        response = await handleVSCodeBridge('run-scan', {});
        break;

      default:
        response = { success: false, message: 'Unknown command for Nexora' };
    }
  } catch (error) {
    response = { success: false, message: error.message || 'Unknown error' };
  }

  // Emit result back to Elora log stream
  logBus.emit({
    sender: 'nexora',
    type: 'delegation',
    message: `Task '${command}' processed by Nexora`,
    data: response,
  });

  return response;
}
