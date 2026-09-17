import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../src/services/stripe.service', () => ({
  syncAccountStatus: vi.fn(),
  createPaymentIntent: vi.fn(),
  createMultiPaymentIntent: vi.fn(),
}));

// tenant-portal.service.ts also imports storage.service.ts (for document
// upload/download URLs, unrelated to payments), which eagerly requires
// Supabase env vars — mock it so importing the module under test doesn't
// need them.
vi.mock('../src/services/storage.service', () => ({
  generateUploadPresignedUrl: vi.fn(),
  generateDownloadPresignedUrl: vi.fn(),
  buildStorageKey: vi.fn(),
}));

import { prisma } from '@propflow/db';
import {
  initiateTenantPayment,
  initiateTenantCardPayment,
  initiateMultiTenantPayment,
} from '../src/services/tenant-portal.service';

const activeOrg = { id: 'org-1', stripeAccountId: 'acct_1', stripeAccountStatus: 'active' };

const paymentBase = {
  id: 'payment-1',
  tenantId: 'tenant-1',
  status: 'pending',
  amount: 1000,
  tenant: { id: 'tenant-1', name: 'Test Tenant' },
  lease: { unit: { unitNumber: '101', property: { name: 'Test Property' } } },
};

describe('tenant-portal.service payment method mismatch guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.organization.findUniqueOrThrow as any).mockResolvedValue(activeOrg);
  });

  it('rejects initiating ACH when a card PaymentIntent is already in progress', async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({
      ...paymentBase,
      stripePaymentIntentId: 'pi_card_1',
      method: 'card',
    });

    await expect(
      initiateTenantPayment('tenant-1', 'org-1', 'payment-1')
    ).rejects.toMatchObject({ code: 'PAYMENT_METHOD_MISMATCH' });
  });

  it('rejects initiating card when an ACH PaymentIntent is already in progress', async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({
      ...paymentBase,
      stripePaymentIntentId: 'pi_ach_1',
      method: 'ach',
    });

    await expect(
      initiateTenantCardPayment('tenant-1', 'org-1', 'payment-1')
    ).rejects.toMatchObject({ code: 'PAYMENT_METHOD_MISMATCH' });
  });

  it('rejects the multi-payment (ACH-only) flow when a payment already has a card intent', async () => {
    (prisma.payment.findMany as any).mockResolvedValue([
      { ...paymentBase, stripePaymentIntentId: 'pi_card_1', method: 'card' },
    ]);

    await expect(
      initiateMultiTenantPayment('tenant-1', 'org-1', ['payment-1'])
    ).rejects.toMatchObject({ code: 'PAYMENT_METHOD_MISMATCH' });
  });
});
