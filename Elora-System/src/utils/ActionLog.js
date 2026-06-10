import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', 'elora_logs.json');

export function ensureLogFile() {
  if (!fs.existsSync(LOG_FILE)) {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, JSON.stringify([]));
  }
}

export function appendLog(entry) {
  ensureLogFile();
  const logs = JSON.parse(fs.readFileSync(LOG_FILE));
  logs.push({ ...entry, timestamp: Date.now() });
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

export function getLogs() {
  ensureLogFile();
  return JSON.parse(fs.readFileSync(LOG_FILE));
}

export function clearLogs() {
  fs.writeFileSync(LOG_FILE, JSON.stringify([]));
}
