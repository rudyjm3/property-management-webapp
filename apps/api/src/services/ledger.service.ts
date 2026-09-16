import { prisma } from '@propflow/db';

// ─── Create ledger entry (internal — called by webhook handler only) ──────────

interface CreateLedgerEntryInput {
  organizationId: string;
  paymentId?: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  stripeEventId?: string;
}

// Prisma's transaction-client type — accepted by the *Tx variants below so they
// can run inside a caller-owned transaction (e.g. payment.service's void flow)
// instead of opening a new one.
type PrismaTx = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;

async function createLedgerEntryTx(tx: PrismaTx, input: CreateLedgerEntryInput) {
  // Idempotency guard: skip if this Stripe event was already processed
  if (input.stripeEventId) {
    const existing = await tx.ledgerEntry.findUnique({
      where: { stripeEventId: input.stripeEventId },
    });
    if (existing) return existing;
  }

  // Serialize all writes per org — advisory lock covers the empty-table case
  // where SELECT FOR UPDATE would lock nothing and allow duplicate zero-balance reads.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.organizationId})::bigint)`;

  const latest = await tx.ledgerEntry.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { createdAt: 'desc' },
  });

  const currentBalance = latest ? Number(latest.balanceAfter) : 0;
  const delta = input.type === 'credit' ? input.amount : -input.amount;
  const balanceAfter = currentBalance + delta;

  return tx.ledgerEntry.create({
    data: {
      organizationId: input.organizationId,
      paymentId: input.paymentId ?? null,
      type: input.type,
      amount: input.amount,
      balanceAfter,
      description: input.description,
      stripeEventId: input.stripeEventId ?? null,
    },
  });
}

export async function createLedgerEntry(input: CreateLedgerEntryInput) {
  return prisma.$transaction((tx) => createLedgerEntryTx(tx, input));
}

// ─── Void reversal (internal — called by payment.service.voidPayment) ────────

/**
 * Reverses whatever a payment already posted to the ledger, inside the
 * caller's transaction. Nets all prior entries for the payment (credits minus
 * debits) rather than assuming a single entry, so a payment that also had a
 * partial refund reversed still balances to zero. No-ops if the payment never
 * posted anything (e.g. a cash payment that was never routed through Stripe).
 */
export async function reverseLedgerEntriesForPayment(
  tx: PrismaTx,
  organizationId: string,
  paymentId: string,
  description: string
) {
  const entries = await tx.ledgerEntry.findMany({
    where: { organizationId, paymentId },
  });

  if (entries.length === 0) return null;

  const netPosted = entries.reduce(
    (sum, e) => sum + (e.type === 'credit' ? Number(e.amount) : -Number(e.amount)),
    0
  );

  if (netPosted === 0) return null;

  return createLedgerEntryTx(tx, {
    organizationId,
    paymentId,
    type: netPosted > 0 ? 'debit' : 'credit',
    amount: Math.abs(netPosted),
    description,
  });
}

// ─── List ledger entries (paginated, newest first) ────────────────────────────

interface ListLedgerOptions {
  paymentId?: string;
  type?: string;
  cursor?: string;
  limit?: number;
}

export async function listLedgerEntries(
  organizationId: string,
  opts: ListLedgerOptions = {}
) {
  const { paymentId, type, cursor, limit = 25 } = opts;

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      organizationId,
      ...(paymentId ? { paymentId } : {}),
      ...(type ? { type: type as 'credit' | 'debit' } : {}),
      // Cursor is a createdAt ISO string — must match the orderBy key to avoid
      // skipping or duplicating entries across pages (UUIDs are not time-ordered).
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return {
    data: entries,
    nextCursor:
      entries.length === limit
        ? entries[entries.length - 1].createdAt.toISOString()
        : null,
  };
}
