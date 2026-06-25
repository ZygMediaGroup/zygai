import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.warn('ENCRYPTION_KEY environment variable is not set. Chat data will NOT be encrypted.');
}

// Derive a 256-bit key from the environment variable
const deriveKey = (keyStr) => {
  if (!keyStr) return null;
  const hash = createHash('sha256');
  hash.update(keyStr);
  return hash.digest();
};

const getKey = () => {
  if (!ENCRYPTION_KEY) return null;
  return deriveKey(ENCRYPTION_KEY);
};

export const encryptMessage = (data) => {
  const key = getKey();
  if (!key) {
    throw new Error('Encryption key not configured. Set ENCRYPTION_KEY environment variable.');
  }

  const iv = randomBytes(16); // 128-bit IV for AES-GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

export const decryptMessage = (encrypted, ivHex, authTagHex) => {
  const key = getKey();
  if (!key) {
    throw new Error('Encryption key not configured. Set ENCRYPTION_KEY environment variable.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
};

export const isEncryptionEnabled = () => !!ENCRYPTION_KEY;
