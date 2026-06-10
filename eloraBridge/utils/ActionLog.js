import fs from 'fs/promises';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', 'elora_logs.json');

export async function ensureLogFile() {
  try {
    const exists = await fs.access(LOG_FILE).then(() => true).catch(() => false);
    if (!exists) {
      await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
      await fs.writeFile(LOG_FILE, JSON.stringify([]));
    }
  } catch (err) {
    console.error('Failed to ensure log file:', err);
  }
}

export async function appendLog(entry) {
  try {
    await ensureLogFile();
    const data = await fs.readFile(LOG_FILE, 'utf8');
    const logs = JSON.parse(data);
    logs.push({ ...entry, timestamp: Date.now() });
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('Failed to append log:', err);
  }
}

export async function getLogs() {
  try {
    await ensureLogFile();
    const data = await fs.readFile(LOG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to get logs:', err);
    return [];
  }
}

export async function clearLogs() {
  try {
    await fs.writeFile(LOG_FILE, JSON.stringify([]));
  } catch (err) {
    console.error('Failed to clear logs:', err);
  }
}
