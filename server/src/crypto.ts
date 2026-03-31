import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getMasterKey(): Buffer | null {
  const hex = process.env.GTM_MASTER_KEY;
  if (!hex) return null;
  if (hex.length !== 64) {
    console.warn('[crypto] GTM_MASTER_KEY must be a 64-char hex string (32 bytes). Encryption disabled.');
    return null;
  }
  return Buffer.from(hex, 'hex');
}

export function encryptionEnabled(): boolean {
  return getMasterKey() !== null;
}

export function isEncrypted(value: string): boolean {
  // Format: "iv:authTag:ciphertext" all hex, iv=24 chars, authTag=32 chars
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === IV_LENGTH * 2 && parts[1].length === AUTH_TAG_LENGTH * 2;
}

export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const key = getMasterKey();
  if (!key) return ciphertext;
  if (!isEncrypted(ciphertext)) return ciphertext;

  const parts = ciphertext.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
