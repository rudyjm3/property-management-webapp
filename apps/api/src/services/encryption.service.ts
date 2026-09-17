import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Application-level AES-256-GCM for at-rest encryption of screening PII
 * (SSN, govt ID) on RentalApplication/Tenant. Never log or return the
 * plaintext these functions handle — callers must treat the decrypted
 * value as a transient in-memory secret only.
 *
 * Ciphertext format: base64(iv [12 bytes] || authTag [16 bytes] || ciphertext).
 * Key: SCREENING_ENCRYPTION_KEY env var, a base64-encoded 32-byte key
 * (e.g. `openssl rand -base64 32`). This is a stand-in for envelope
 * encryption via a real KMS — swap `getKey()` for a KMS-unwrapped data key
 * if/when one is available, without changing callers.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.SCREENING_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'SCREENING_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and set it before capturing screening data.'
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('SCREENING_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }

  return key;
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptField(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
