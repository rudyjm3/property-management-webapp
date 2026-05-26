import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@propflow/db', () => ({
  prisma: {
    payment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    ledgerEntry: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
    tenant: {
      update: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    // Handle both: $transaction(fn) callback form AND $transaction([...promises]) batch form
    $transaction: vi.fn().mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(mockTx);
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      return Promise.resolve();
    }),
  },
}));

vi.mock('../src/services/stripe.service', () => ({
  syncAccountStatus: vi.fn(),
  deriveConnectStatus: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  expressErrorHandler: vi.fn(() => (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next()),
  init: vi.fn(),
  setupExpressErrorHandler: vi.fn(),
}));

// Stripe constructor mock — bypasses real HMAC verification.
// Must use a regular function (not arrow) so `new Stripe()` works.
vi.mock('stripe', () => {
  const mockConstructEvent = vi.fn();
  return {
    // eslint-disable-next-line prefer-arrow-callback
    default: vi.fn().mockImplementation(function mockStripeConstructor() {
      return { webhooks: { constructEvent: mockConstructEvent } };
    }),
    __mockConstructEvent: mockConstructEvent,
  };
});

import { prisma } from '@propflow/db';
import stripeWebhookHandler from '../src/webhooks/stripe';
import { createLedgerEntry } from '../src/services/ledger.service';

// ─── Mock transaction proxy ────────────────────────────────────────────────────

const mockTx = {
  ledgerEntry: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  payment: {
    updateMany: vi.fn(),
  },
  $executeRaw: vi.fn().mockResolvedValue(undefined),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEvent(type: string, piOverrides: Partial<Stripe.PaymentIntent> = {}): Stripe.Event {
  return {
    id: 'evt_test_' + Math.random().toString(36).slice(2, 10),
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: {
      object: {
        id: 'pi_test_abc123',
        object: 'payment_intent',
        status: 'succeeded',
        amount: 150000,
        currency: 'usd',
        metadata: { paymentIds: 'payment-1' },
        ...piOverrides,
      } as Stripe.PaymentIntent,
    },
  } as Stripe.Event;
}

function buildMockReq(event: Stripe.Event) {
  return {
    body: Buffer.from(JSON.stringify(event)),
    headers: { 'stripe-signature': 'mock_sig' },
  } as any;
}

function buildMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const mockPaymentWithLease = {
  id: 'payment-1',
  leaseId: 'lease-1',
  tenantId: 'tenant-1',
  amount: 1500,
  type: 'rent',
  status: 'pending',
  stripePaymentIntentId: 'pi_test_abc123',
  lease: {
    id: 'lease-1',
    unit: {
      property: {
        organizationId: 'org-1',
      },
    },
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Stripe Webhook — ACH smoke test', () => {
  let constructEventMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import stripe mock to access __mockConstructEvent
    const stripeMod = await import('stripe') as any;
    constructEventMock = stripeMod.__mockConstructEvent ?? new stripeMod.default().webhooks.constructEvent;
    // Make constructEvent return the event passed in (test bypass)
    constructEventMock.mockImplementation((_body: unknown, _sig: unknown, _secret: unknown) => {
      throw new Error('constructEvent must be set per test');
    });

    // Set required env vars
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  });

  describe('payment_intent.succeeded', () => {
    it('marks payment completed and creates ledger credit', async () => {
      const event = buildEvent('payment_intent.succeeded');
      constructEventMock.mockReturnValue(event);

      (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockPaymentWithLease]);
      (prisma.payment.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockPaymentWithLease, status: 'completed' });
      (mockTx.ledgerEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockTx.ledgerEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockTx.ledgerEntry.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ledger-1', type: 'credit', amount: 1500, balanceAfter: 1500,
      });

      const req = buildMockReq(event);
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);

      // Must respond 200 immediately
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ received: true });

      // Allow async processing to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
      );
    });

    it('uses the correct stripeEventId suffix for each payment in a multi-payment intent', async () => {
      const event = buildEvent('payment_intent.succeeded', {
        id: 'pi_multi',
        metadata: { paymentIds: 'payment-1,payment-2' },
      });
      constructEventMock.mockReturnValue(event);

      const payment2 = { ...mockPaymentWithLease, id: 'payment-2' };
      (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockPaymentWithLease, payment2]);
      (prisma.payment.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockTx.ledgerEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockTx.ledgerEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockTx.ledgerEntry.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l', balanceAfter: 0 });

      const req = buildMockReq(event);
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);
      await new Promise((r) => setTimeout(r, 50));

      // Ledger creation is called via $transaction for each payment
      // The stripeEventId should be "evt_id:payment-id"
      expect(mockTx.ledgerEntry.create).toHaveBeenCalledTimes(2);
      const calls = (mockTx.ledgerEntry.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].data.stripeEventId).toMatch(/^evt_test_.*:payment-1$/);
      expect(calls[1][0].data.stripeEventId).toMatch(/^evt_test_.*:payment-2$/);
    });

    it('is idempotent — skips ledger creation if stripeEventId already exists', async () => {
      const event = buildEvent('payment_intent.succeeded');
      constructEventMock.mockReturnValue(event);

      (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockPaymentWithLease]);
      (prisma.payment.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      // Simulate: ledger entry already exists for this stripeEventId
      (mockTx.ledgerEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing-ledger' });

      const req = buildMockReq(event);
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockTx.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it('does nothing when metadata has no paymentIds or paymentId', async () => {
      const event = buildEvent('payment_intent.succeeded', { metadata: {} });
      constructEventMock.mockReturnValue(event);

      const req = buildMockReq(event);
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);
      await new Promise((r) => setTimeout(r, 50));

      expect(prisma.payment.findMany).not.toHaveBeenCalled();
      expect(mockTx.ledgerEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('marks matching payments as failed', async () => {
      const event = buildEvent('payment_intent.payment_failed', {
        status: 'requires_payment_method',
        metadata: { paymentIds: 'payment-1' },
      });
      constructEventMock.mockReturnValue(event);
      (prisma.payment.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      const req = buildMockReq(event);
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);
      await new Promise((r) => setTimeout(r, 50));

      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['payment-1'] } }),
          data: expect.objectContaining({ status: 'failed' }),
        })
      );
    });
  });

  describe('setup_intent.succeeded', () => {
    it('updates tenant autopay fields when setup completes', async () => {
      const setupEvent: Stripe.Event = {
        id: 'evt_setup_test',
        object: 'event',
        api_version: '2025-02-24.acacia',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: null,
        type: 'setup_intent.succeeded',
        data: {
          object: {
            id: 'seti_test',
            object: 'setup_intent',
            status: 'succeeded',
            payment_method: 'pm_test_bank_123',
            metadata: { tenantId: 'tenant-1', orgId: 'org-1' },
          } as Stripe.SetupIntent,
        },
      } as Stripe.Event;
      constructEventMock.mockReturnValue(setupEvent);
      (prisma.tenant.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const req = buildMockReq(setupEvent);
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);
      await new Promise((r) => setTimeout(r, 50));

      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          data: expect.objectContaining({
            stripeDefaultPaymentMethodId: 'pm_test_bank_123',
            autopayEnabled: true,
          }),
        })
      );
    });
  });

  describe('webhook handler — guard rails', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      const req: any = { body: Buffer.from('{}'), headers: {} };
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when signature verification fails', async () => {
      constructEventMock.mockImplementation(() => { throw new Error('Invalid signature'); });
      const req = buildMockReq(buildEvent('payment_intent.succeeded'));
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 200 and ignores unhandled event types', async () => {
      const event = { ...buildEvent('payment_intent.succeeded'), type: 'customer.created' } as Stripe.Event;
      constructEventMock.mockReturnValue(event);
      const req = buildMockReq(event);
      const res = buildMockRes();
      await stripeWebhookHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(prisma.payment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('ledger.service.createLedgerEntry', () => {
    it('accumulates running balance across credits', async () => {
      (mockTx.ledgerEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockTx.ledgerEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        balanceAfter: 1500,
      });
      (mockTx.ledgerEntry.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'l2', type: 'credit', amount: 500, balanceAfter: 2000,
      });

      await createLedgerEntry({
        organizationId: 'org-1',
        paymentId: 'payment-2',
        type: 'credit',
        amount: 500,
        description: 'Rent received',
        stripeEventId: 'evt_new_credit',
      });

      expect(mockTx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'credit',
            amount: 500,
            balanceAfter: 2000,
          }),
        })
      );
    });

    it('decrements running balance on debit', async () => {
      (mockTx.ledgerEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockTx.ledgerEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        balanceAfter: 1500,
      });
      (mockTx.ledgerEntry.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'l3', type: 'debit', amount: 200, balanceAfter: 1300,
      });

      await createLedgerEntry({
        organizationId: 'org-1',
        paymentId: 'payment-1',
        type: 'debit',
        amount: 200,
        description: 'Refund issued',
        stripeEventId: 'evt_refund',
      });

      expect(mockTx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'debit',
            amount: 200,
            balanceAfter: 1300,
          }),
        })
      );
    });

    it('returns existing entry without creating duplicate on replay', async () => {
      const existing = { id: 'existing', type: 'credit', amount: 1500, balanceAfter: 1500 };
      (mockTx.ledgerEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      const result = await createLedgerEntry({
        organizationId: 'org-1',
        paymentId: 'payment-1',
        type: 'credit',
        amount: 1500,
        description: 'Duplicate event',
        stripeEventId: 'evt_already_processed',
      });

      expect(result).toBe(existing);
      expect(mockTx.ledgerEntry.create).not.toHaveBeenCalled();
    });
  });
});
