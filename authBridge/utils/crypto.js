// authBridge/utils/crypto.js
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

export function encryptJson(obj, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyFromEnv(key), iv);
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptJson(b64, key) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, keyFromEnv(key), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

function keyFromEnv(k) {
  const key = (k || process.env.MASTER_KEY || '').trim();
  if (key.length < 32) throw new Error('MASTER_KEY must be at least 32 chars');
  // Use first 32 bytes
  return Buffer.from(key).subarray(0, 32);
}
