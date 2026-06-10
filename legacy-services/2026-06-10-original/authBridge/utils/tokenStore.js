// authBridge/utils/tokenStore.js
import fs from 'fs';
import path from 'path';
import { encryptJson, decryptJson } from './crypto.js';

const STORE_PATH = path.resolve('tokens.enc.json');

export function loadAll() {
  if (!fs.existsSync(STORE_PATH)) return {};
  const b64 = fs.readFileSync(STORE_PATH, 'utf8');
  if (!b64.trim()) return {};
  try {
    return decryptJson(b64, process.env.MASTER_KEY);
  } catch {
    // Corrupt/old store fallback
    return {};
  }
}

export function saveAll(obj) {
  const b64 = encryptJson(obj, process.env.MASTER_KEY);
  fs.writeFileSync(STORE_PATH, b64, 'utf8');
}

export function getToken(service) {
  const all = loadAll();
  return all[service] || null;
}

export function setToken(service, tokenObj) {
  const all = loadAll();
  all[service] = tokenObj;
  saveAll(all);
}

export function clearToken(service) {
  const all = loadAll();
  delete all[service];
  saveAll(all);
}
