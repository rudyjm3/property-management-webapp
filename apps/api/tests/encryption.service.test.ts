/**
 * Unit tests for the AES-256-GCM at-rest encryption used for screening PII
 * (SSN, govt ID) on RentalApplication/Tenant.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encryptField, decryptField } from '../src/services/encryption.service';

const ORIGINAL_KEY = process.env.SCREENING_ENCRYPTION_KEY;

describe('encryption.service', () => {
  beforeEach(() => {
    process.env.SCREENING_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterEach(() => {
    process.env.SCREENING_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it('round-trips a plaintext value through encrypt/decrypt', () => {
    const plaintext = '123-45-6789';
    const ciphertext = encryptField(plaintext);

    expect(ciphertext).not.toContain(plaintext);
    expect(decryptField(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const a = encryptField('123-45-6789');
    const b = encryptField('123-45-6789');
    expect(a).not.toBe(b);
  });

  it('throws if the ciphertext has been tampered with', () => {
    const ciphertext = encryptField('123-45-6789');
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a byte in the ciphertext body
    expect(() => decryptField(buf.toString('base64'))).toThrow();
  });

  it('throws a clear error when SCREENING_ENCRYPTION_KEY is not set', () => {
    delete process.env.SCREENING_ENCRYPTION_KEY;
    expect(() => encryptField('123-45-6789')).toThrow(/SCREENING_ENCRYPTION_KEY/);
  });

  it('throws a clear error when the key is not 32 bytes', () => {
    process.env.SCREENING_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => encryptField('123-45-6789')).toThrow(/32 bytes/);
  });
});
