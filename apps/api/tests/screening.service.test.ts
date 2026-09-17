/**
 * Unit tests for the Module 1 (Advanced Tenant Onboarding) screening
 * service: consent-gated SSN/govt ID encryption and background/credit
 * check orchestration against the (currently mocked) provider client.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    rentalApplication: {
      findFirst: vi.fn(),
    },
    screeningCheck: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../src/services/encryption.service', () => ({
  encryptField: vi.fn((plaintext: string) => `ENC(${plaintext})`),
  decryptField: vi.fn((ciphertext: string) => ciphertext.replace(/^ENC\(|\)$/g, '')),
}));

vi.mock('../src/services/screening-provider.client', () => ({
  getScreeningProviderClient: vi.fn(),
}));

import { prisma } from '@propflow/db';
import { encryptField, decryptField } from '../src/services/encryption.service';
import { getScreeningProviderClient } from '../src/services/screening-provider.client';
import {
  buildScreeningConsentUpdate,
  runScreeningCheck,
  getScreeningForApplication,
} from '../src/services/screening.service';

describe('buildScreeningConsentUpdate', () => {
  it('returns an empty object when no screening input is given and the module is inactive', () => {
    expect(buildScreeningConsentUpdate([], undefined, '127.0.0.1')).toEqual({});
  });

  it('throws SCREENING_CONSENT_REQUIRED when screening input is omitted but the module is active', () => {
    expect(() =>
      buildScreeningConsentUpdate(['advanced_tenant_onboarding'], undefined, '127.0.0.1')
    ).toThrow(expect.objectContaining({ code: 'SCREENING_CONSENT_REQUIRED' }));
  });

  it('throws MODULE_NOT_ACTIVE when consent is given but the module is not active', () => {
    expect(() =>
      buildScreeningConsentUpdate(
        [],
        { consentGiven: true, ssnFull: '123-45-6789', govtIdType: 'drivers_license', govtIdNumber: 'D1234567' },
        '127.0.0.1'
      )
    ).toThrow(expect.objectContaining({ code: 'MODULE_NOT_ACTIVE' }));
  });

  it('throws SCREENING_CONSENT_REQUIRED when consentGiven is not true', () => {
    expect(() =>
      buildScreeningConsentUpdate(
        ['advanced_tenant_onboarding'],
        { consentGiven: false as unknown as true, ssnFull: '123-45-6789', govtIdType: 'drivers_license', govtIdNumber: 'D1234567' },
        '127.0.0.1'
      )
    ).toThrow(expect.objectContaining({ code: 'SCREENING_CONSENT_REQUIRED' }));
  });

  it('encrypts SSN and govt ID and stamps consent when the module is active', () => {
    const result = buildScreeningConsentUpdate(
      ['advanced_tenant_onboarding'],
      { consentGiven: true, ssnFull: '123-45-6789', govtIdType: 'drivers_license', govtIdNumber: 'D1234567' },
      '127.0.0.1'
    );

    expect(encryptField).toHaveBeenCalledWith('123-45-6789');
    expect(encryptField).toHaveBeenCalledWith('D1234567');
    expect(result).toMatchObject({
      screeningConsentIp: '127.0.0.1',
      ssnFullEncrypted: 'ENC(123-45-6789)',
      govtIdType: 'drivers_license',
      govtIdNumber: 'ENC(D1234567)',
    });
    expect(result.screeningConsentAt).toBeInstanceOf(Date);
  });
});

describe('runScreeningCheck', () => {
  const baseApp = {
    id: 'app-1',
    applicantName: 'Jane Tenant',
    applicantEmail: 'jane@example.com',
    dateOfBirth: new Date('1990-01-15'),
    currentAddress: '123 Main St',
    screeningConsentAt: new Date('2026-09-01'),
    ssnFullEncrypted: 'ENC(123-45-6789)',
    govtIdType: 'drivers_license',
    govtIdNumber: 'ENC(D1234567)',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws SCREENING_CONSENT_REQUIRED when consent has not been given', async () => {
    (prisma.rentalApplication.findFirst as any).mockResolvedValue({
      ...baseApp,
      screeningConsentAt: null,
    });

    await expect(runScreeningCheck('org-1', 'app-1', 'user-1')).rejects.toMatchObject({
      code: 'SCREENING_CONSENT_REQUIRED',
    });
    expect(prisma.screeningCheck.create).not.toHaveBeenCalled();
  });

  it('throws SCREENING_DATA_MISSING when SSN/govt ID were never captured', async () => {
    (prisma.rentalApplication.findFirst as any).mockResolvedValue({
      ...baseApp,
      ssnFullEncrypted: null,
    });

    await expect(runScreeningCheck('org-1', 'app-1', 'user-1')).rejects.toMatchObject({
      code: 'SCREENING_DATA_MISSING',
    });
  });

  it('throws APPLICATION_NOT_FOUND when the application does not belong to the org', async () => {
    (prisma.rentalApplication.findFirst as any).mockResolvedValue(null);

    await expect(runScreeningCheck('org-1', 'app-1', 'user-1')).rejects.toMatchObject({
      code: 'APPLICATION_NOT_FOUND',
    });
  });

  it('decrypts SSN/govt ID only in-memory, calls the provider, and stores the result', async () => {
    (prisma.rentalApplication.findFirst as any).mockResolvedValue(baseApp);
    (prisma.screeningCheck.create as any).mockResolvedValue({ id: 'check-1' });
    (prisma.screeningCheck.update as any).mockImplementation(({ data }: any) => ({
      id: 'check-1',
      requestedAt: new Date('2026-09-17'),
      completedAt: data.completedAt,
      status: data.status,
      decision: data.decision,
      reportUrl: data.reportUrl,
      errorMessage: data.errorMessage,
    }));

    const submitCheck = vi.fn().mockResolvedValue({
      providerReferenceId: 'MOCK-123',
      status: 'completed',
      decision: 'recommend',
      reportUrl: null,
    });
    (getScreeningProviderClient as any).mockReturnValue({ submitCheck });

    const result = await runScreeningCheck('org-1', 'app-1', 'user-1');

    expect(decryptField).toHaveBeenCalledWith('ENC(123-45-6789)');
    expect(decryptField).toHaveBeenCalledWith('ENC(D1234567)');
    expect(submitCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Jane Tenant',
        ssnFull: '123-45-6789',
        govtIdNumber: 'D1234567',
      })
    );
    expect(prisma.screeningCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-1', rentalApplicationId: 'app-1', requestedByUserId: 'user-1' }),
      })
    );
    expect(result).toMatchObject({ status: 'completed', decision: 'recommend' });
  });

  it('marks the check failed (without throwing) when the provider call errors', async () => {
    (prisma.rentalApplication.findFirst as any).mockResolvedValue(baseApp);
    (prisma.screeningCheck.create as any).mockResolvedValue({ id: 'check-1' });
    (prisma.screeningCheck.update as any).mockImplementation(({ data }: any) => ({
      id: 'check-1',
      requestedAt: new Date('2026-09-17'),
      completedAt: data.completedAt,
      status: data.status,
      decision: data.decision ?? null,
      reportUrl: data.reportUrl ?? null,
      errorMessage: data.errorMessage,
    }));

    const submitCheck = vi.fn().mockRejectedValue(new Error('provider unreachable'));
    (getScreeningProviderClient as any).mockReturnValue({ submitCheck });

    const result = await runScreeningCheck('org-1', 'app-1', 'user-1');

    expect(result).toMatchObject({ status: 'failed', errorMessage: 'provider unreachable' });
  });
});

describe('getScreeningForApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws APPLICATION_NOT_FOUND when the application does not exist', async () => {
    (prisma.rentalApplication.findFirst as any).mockResolvedValue(null);

    await expect(getScreeningForApplication('org-1', 'app-1')).rejects.toMatchObject({
      code: 'APPLICATION_NOT_FOUND',
    });
  });

  it('returns consent timestamp and null check when none has been run', async () => {
    (prisma.rentalApplication.findFirst as any).mockResolvedValue({ screeningConsentAt: new Date('2026-09-01') });
    (prisma.screeningCheck.findFirst as any).mockResolvedValue(null);

    const result = await getScreeningForApplication('org-1', 'app-1');
    expect(result.check).toBeNull();
    expect(result.screeningConsentAt).toEqual(new Date('2026-09-01'));
  });
});
