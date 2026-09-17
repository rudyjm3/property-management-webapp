/**
 * The real TransUnion SmartMove call is not wired up in any environment
 * yet (no credentials) — getScreeningProviderClient() must always fall
 * back to the mock unless both TRANSUNION_API_KEY and
 * TRANSUNION_API_BASE_URL are set.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getScreeningProviderClient,
  MockTransUnionSmartMoveClient,
  TransUnionSmartMoveClient,
} from '../src/services/screening-provider.client';

const ORIGINAL_KEY = process.env.TRANSUNION_API_KEY;
const ORIGINAL_URL = process.env.TRANSUNION_API_BASE_URL;

describe('getScreeningProviderClient', () => {
  beforeEach(() => {
    delete process.env.TRANSUNION_API_KEY;
    delete process.env.TRANSUNION_API_BASE_URL;
  });

  afterEach(() => {
    process.env.TRANSUNION_API_KEY = ORIGINAL_KEY;
    process.env.TRANSUNION_API_BASE_URL = ORIGINAL_URL;
  });

  it('returns the mock client when no TransUnion credentials are configured', () => {
    expect(getScreeningProviderClient()).toBeInstanceOf(MockTransUnionSmartMoveClient);
  });

  it('returns the real client when both credentials are configured', () => {
    process.env.TRANSUNION_API_KEY = 'test-key';
    process.env.TRANSUNION_API_BASE_URL = 'https://example.com';
    expect(getScreeningProviderClient()).toBeInstanceOf(TransUnionSmartMoveClient);
  });
});

describe('MockTransUnionSmartMoveClient', () => {
  it('resolves a completed, recommend result without making a network call', async () => {
    const client = new MockTransUnionSmartMoveClient();
    const result = await client.submitCheck({
      fullName: 'Jane Tenant',
      email: 'jane@example.com',
      dateOfBirth: '1990-01-15',
      currentAddress: '123 Main St',
      ssnFull: '123-45-6789',
      govtIdType: 'drivers_license',
      govtIdNumber: 'D1234567',
    });

    expect(result.status).toBe('completed');
    expect(result.decision).toBe('recommend');
    expect(result.providerReferenceId).toMatch(/^MOCK-/);
  });
});
