import { prisma, Prisma, EvictionStatus, EvictionNoticeType, EvictionDeliveryMethod, EvictionJudgmentOutcome } from '@propflow/db';
import { STATE_EVICTION_RULES_SEED, STATE_EVICTION_DATA_COMPILED_AT } from '@propflow/shared';
import { AppError } from '../middleware/error-handler';

// Eviction Management (Module 8) — see docs/reference/modules.md "Module 8"
// for the full writeup, including the jurisdiction-data sourcing/disclaimer.
// This is a legally sensitive workflow: the app computes deadlines and
// surfaces reference notice-period data, it does not give legal advice, and
// every computed deadline/state-rule value shown to a manager should carry
// that caveat in the UI.

// ─── Date helpers (UTC, calendar-day math — mirrors maintenance-schedule.
// service.ts's advanceDueDate) ──────────────────────────────────────────────

function addDaysUTC(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(value: string | Date): Date {
  if (typeof value === 'string') {
    // z.string().date() gives "YYYY-MM-DD" — parse as UTC midnight, not local.
    return new Date(`${value}T00:00:00.000Z`);
  }
  return value;
}

// ─── StateEvictionRule (jurisdiction reference table) ──────────────────────

// Lazily seeds the full 50-state + DC reference table the first time it's
// queried, mirroring ensureDefaultTemplate's pattern in
// inspection-template.service.ts — except this table is global (not
// per-organization), so it's seeded once for the whole database rather than
// once per org.
export async function ensureStateEvictionRulesSeeded() {
  const count = await prisma.stateEvictionRule.count();
  if (count > 0) return;

  const lastVerifiedAt = toDateOnly(STATE_EVICTION_DATA_COMPILED_AT);

  await prisma.stateEvictionRule.createMany({
    data: STATE_EVICTION_RULES_SEED.map((row) => ({
      state: row.state,
      noticeType: row.noticeType as EvictionNoticeType,
      noticePeriodDays: row.noticePeriodDays,
      allowedDeliveryMethods: row.allowedDeliveryMethods as EvictionDeliveryMethod[],
      notes: row.notes,
      source: row.source,
      lastVerifiedAt,
    })),
    skipDuplicates: true,
  });
}

export async function listStateEvictionRules(state?: string) {
  await ensureStateEvictionRulesSeeded();
  return prisma.stateEvictionRule.findMany({
    where: state ? { state: state.toUpperCase() } : undefined,
    orderBy: [{ state: 'asc' }, { noticeType: 'asc' }],
  });
}

export async function getStateEvictionRule(id: string) {
  const rule = await prisma.stateEvictionRule.findUnique({ where: { id } });
  if (!rule) {
    throw new AppError(404, 'STATE_EVICTION_RULE_NOT_FOUND', 'No jurisdiction rule found with that ID.');
  }
  return rule;
}

async function lookupStateEvictionRule(state: string, noticeType: EvictionNoticeType) {
  await ensureStateEvictionRulesSeeded();
  return prisma.stateEvictionRule.findUnique({
    where: { state_noticeType: { state: state.toUpperCase(), noticeType } },
  });
}

interface StateEvictionRuleInput {
  state: string;
  noticeType: EvictionNoticeType;
  noticePeriodDays: number;
  allowedDeliveryMethods: EvictionDeliveryMethod[];
  notes?: string | null;
  source: string;
  lastVerifiedAt: string;
}

// Lets a manager correct a seeded reference row once they've actually
// verified it against current law/counsel — the seeded table is a starting
// point, not a claim of ongoing legal review (see modules.md).
export async function createOrUpdateStateEvictionRule(data: StateEvictionRuleInput) {
  await ensureStateEvictionRulesSeeded();
  const state = data.state.toUpperCase();
  return prisma.stateEvictionRule.upsert({
    where: { state_noticeType: { state, noticeType: data.noticeType } },
    create: {
      state,
      noticeType: data.noticeType,
      noticePeriodDays: data.noticePeriodDays,
      allowedDeliveryMethods: data.allowedDeliveryMethods,
      notes: data.notes ?? null,
      source: data.source,
      lastVerifiedAt: toDateOnly(data.lastVerifiedAt),
    },
    update: {
      noticePeriodDays: data.noticePeriodDays,
      allowedDeliveryMethods: data.allowedDeliveryMethods,
      notes: data.notes ?? null,
      source: data.source,
      lastVerifiedAt: toDateOnly(data.lastVerifiedAt),
    },
  });
}

export async function updateStateEvictionRule(id: string, data: Partial<Omit<StateEvictionRuleInput, 'state' | 'noticeType'>>) {
  const existing = await getStateEvictionRule(id);
  return prisma.stateEvictionRule.update({
    where: { id: existing.id },
    data: {
      ...(data.noticePeriodDays !== undefined && { noticePeriodDays: data.noticePeriodDays }),
      ...(data.allowedDeliveryMethods !== undefined && { allowedDeliveryMethods: data.allowedDeliveryMethods }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.source !== undefined && { source: data.source }),
      ...(data.lastVerifiedAt !== undefined && { lastVerifiedAt: toDateOnly(data.lastVerifiedAt) }),
    },
  });
}

// ─── Eviction ───────────────────────────────────────────────────────────────

const evictionInclude = {
  lease: {
    select: {
      id: true,
      status: true,
      rentAmount: true,
      unit: {
        select: {
          id: true,
          unitNumber: true,
          propertyId: true,
          property: { select: { id: true, name: true, address: true, city: true, state: true, organizationId: true } },
        },
      },
      participants: {
        where: { isPrimary: true },
        include: { tenant: { select: { id: true, name: true, email: true, phone: true } } },
      },
    },
  },
  stateRule: true,
  servedBy: { select: { id: true, name: true, email: true } },
};

async function getLeaseForOrg(organizationId: string, leaseId: string) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, deletedAt: null, unit: { property: { organizationId } } },
    include: { unit: { include: { property: { select: { state: true } } } } },
  });
  if (!lease) {
    throw new AppError(404, 'LEASE_NOT_FOUND', 'No lease found with that ID in your organization.');
  }
  return lease;
}

export async function listEvictions(organizationId: string, filters: { leaseId?: string; status?: EvictionStatus } = {}) {
  return prisma.eviction.findMany({
    where: {
      organizationId,
      ...(filters.leaseId && { leaseId: filters.leaseId }),
      ...(filters.status && { status: filters.status }),
    },
    include: evictionInclude,
    orderBy: [{ deadlineDate: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getEviction(organizationId: string, evictionId: string) {
  const eviction = await prisma.eviction.findFirst({
    where: { id: evictionId, organizationId },
    include: evictionInclude,
  });
  if (!eviction) {
    throw new AppError(404, 'EVICTION_NOT_FOUND', 'No eviction found with that ID in your organization.');
  }
  return eviction;
}

interface CreateEvictionData {
  leaseId: string;
  noticeType: EvictionNoticeType;
  noticeDate: string;
  deliveryMethod: EvictionDeliveryMethod;
  deliveryDate?: string | null;
  servedByUserId?: string | null;
  servedByName?: string | null;
  noticePeriodDays?: number | null;
  overrideReason?: string | null;
  notes?: string | null;
}

// Resolves the final notice period + whether an override reason is required,
// given the jurisdiction lookup (or lack of one) and any manager-supplied
// values. Shared by createEviction and updateEviction so the same rule
// applies whichever endpoint changes noticeType/noticePeriodDays/deliveryMethod.
function resolveNoticePeriod(
  rule: { noticePeriodDays: number; allowedDeliveryMethods: EvictionDeliveryMethod[] } | null,
  input: { noticePeriodDays?: number | null; deliveryMethod: EvictionDeliveryMethod; overrideReason?: string | null }
): { noticePeriodDays: number; overrideReason: string | null } {
  if (!rule) {
    if (input.noticePeriodDays == null) {
      throw new AppError(
        400,
        'NOTICE_PERIOD_REQUIRED',
        'No jurisdiction rule is on file for this state/notice type — enter a notice period manually.'
      );
    }
    return {
      noticePeriodDays: input.noticePeriodDays,
      overrideReason: input.overrideReason ?? 'No StateEvictionRule found for this jurisdiction/notice type at creation time.',
    };
  }

  const noticePeriodDays = input.noticePeriodDays ?? rule.noticePeriodDays;
  const periodDiffers = noticePeriodDays !== rule.noticePeriodDays;
  const methodDiffers = !rule.allowedDeliveryMethods.includes(input.deliveryMethod);

  if ((periodDiffers || methodDiffers) && !input.overrideReason) {
    throw new AppError(
      400,
      'OVERRIDE_REASON_REQUIRED',
      'noticePeriodDays or deliveryMethod differs from the jurisdiction rule on file — overrideReason is required.'
    );
  }

  return { noticePeriodDays, overrideReason: input.overrideReason ?? null };
}

export async function createEviction(organizationId: string, data: CreateEvictionData) {
  const lease = await getLeaseForOrg(organizationId, data.leaseId);
  const rule = await lookupStateEvictionRule(lease.unit.property.state, data.noticeType);

  const { noticePeriodDays, overrideReason } = resolveNoticePeriod(rule, {
    noticePeriodDays: data.noticePeriodDays,
    deliveryMethod: data.deliveryMethod,
    overrideReason: data.overrideReason,
  });

  const noticeDate = toDateOnly(data.noticeDate);
  const deadlineDate = addDaysUTC(noticeDate, noticePeriodDays);

  if (data.servedByUserId) {
    const servedBy = await prisma.user.findFirst({ where: { id: data.servedByUserId, organizationId } });
    if (!servedBy) {
      throw new AppError(404, 'USER_NOT_FOUND', 'servedByUserId does not belong to your organization.');
    }
  }

  return prisma.eviction.create({
    data: {
      organizationId,
      leaseId: data.leaseId,
      noticeType: data.noticeType,
      noticeDate,
      stateRuleId: rule?.id ?? null,
      noticePeriodDays,
      deadlineDate,
      overrideReason,
      deliveryMethod: data.deliveryMethod,
      deliveryDate: data.deliveryDate ? toDateOnly(data.deliveryDate) : null,
      servedByUserId: data.servedByUserId ?? null,
      servedByName: data.servedByName ?? null,
      notes: data.notes ?? null,
    },
    include: evictionInclude,
  });
}

interface UpdateEvictionData {
  noticeType?: EvictionNoticeType;
  noticeDate?: string;
  deliveryMethod?: EvictionDeliveryMethod;
  deliveryDate?: string | null;
  servedByUserId?: string | null;
  servedByName?: string | null;
  noticePeriodDays?: number;
  overrideReason?: string | null;
  notes?: string | null;
}

// Notice-serving details (type, date, period, delivery) are only editable
// while the eviction is still at notice_served — once it's been marked
// cured/paid/expired or filed, those fields are historical record.
export async function updateEviction(organizationId: string, evictionId: string, data: UpdateEvictionData) {
  const existing = await getEviction(organizationId, evictionId);

  const changesNoticeFields =
    data.noticeType !== undefined ||
    data.noticeDate !== undefined ||
    data.deliveryMethod !== undefined ||
    data.noticePeriodDays !== undefined;

  if (changesNoticeFields && existing.status !== 'notice_served') {
    throw new AppError(
      400,
      'EVICTION_NOTICE_LOCKED',
      'Notice details can only be edited while the eviction is still at notice_served.'
    );
  }

  const updateData: Prisma.EvictionUncheckedUpdateInput = {
    ...(data.deliveryDate !== undefined && { deliveryDate: data.deliveryDate ? toDateOnly(data.deliveryDate) : null }),
    ...(data.servedByUserId !== undefined && { servedByUserId: data.servedByUserId }),
    ...(data.servedByName !== undefined && { servedByName: data.servedByName }),
    ...(data.notes !== undefined && { notes: data.notes }),
  };

  if (changesNoticeFields) {
    const lease = await getLeaseForOrg(organizationId, existing.leaseId);
    const noticeType = data.noticeType ?? existing.noticeType;
    const deliveryMethod = data.deliveryMethod ?? existing.deliveryMethod;
    const rule = await lookupStateEvictionRule(lease.unit.property.state, noticeType);

    const { noticePeriodDays, overrideReason } = resolveNoticePeriod(rule, {
      noticePeriodDays: data.noticePeriodDays ?? existing.noticePeriodDays,
      deliveryMethod,
      overrideReason: data.overrideReason ?? existing.overrideReason,
    });

    const noticeDate = data.noticeDate ? toDateOnly(data.noticeDate) : existing.noticeDate;

    updateData.noticeType = noticeType;
    updateData.noticeDate = noticeDate;
    updateData.deliveryMethod = deliveryMethod;
    updateData.noticePeriodDays = noticePeriodDays;
    updateData.deadlineDate = addDaysUTC(noticeDate, noticePeriodDays);
    updateData.overrideReason = overrideReason;
    updateData.stateRuleId = rule?.id ?? null;
  }

  return prisma.eviction.update({
    where: { id: existing.id },
    data: updateData,
    include: evictionInclude,
  });
}

export async function deleteEviction(organizationId: string, evictionId: string) {
  const existing = await getEviction(organizationId, evictionId);
  await prisma.eviction.delete({ where: { id: existing.id } });
}

// ─── Lifecycle transitions ─────────────────────────────────────────────────
// notice_served -> (cured | paid | expired) -> filed -> court_date_set ->
// judgment -> writ_issued -> completed, or dismissed at any point once filed.
// Each transition is its own function/endpoint (not a generic status PATCH)
// so the fields that matter for that step are captured at the point of the
// transition, and so a manager can't skip steps by hand-editing status.

export async function resolveEvictionNotice(
  organizationId: string,
  evictionId: string,
  outcome: 'cured' | 'paid' | 'expired',
  resolvedAt?: string | null
) {
  const existing = await getEviction(organizationId, evictionId);

  if (existing.status !== 'notice_served') {
    throw new AppError(400, 'INVALID_STATUS_TRANSITION', `Cannot resolve a notice from status "${existing.status}".`);
  }
  if (outcome === 'cured' && existing.noticeType !== 'cure_or_quit') {
    throw new AppError(400, 'INVALID_OUTCOME', '"cured" only applies to a cure_or_quit notice.');
  }
  if (outcome === 'paid' && existing.noticeType !== 'pay_or_quit') {
    throw new AppError(400, 'INVALID_OUTCOME', '"paid" only applies to a pay_or_quit notice.');
  }

  return prisma.eviction.update({
    where: { id: existing.id },
    data: {
      status: outcome as EvictionStatus,
      resolvedAt: outcome === 'expired' ? null : resolvedAt ? new Date(resolvedAt) : new Date(),
    },
    include: evictionInclude,
  });
}

export async function fileEviction(
  organizationId: string,
  evictionId: string,
  data: { courtCaseNumber: string; courtName?: string | null; filedAt?: string | null }
) {
  const existing = await getEviction(organizationId, evictionId);
  if (existing.status !== 'expired') {
    throw new AppError(400, 'INVALID_STATUS_TRANSITION', 'Only an eviction whose notice period has expired can be filed with the court.');
  }

  return prisma.eviction.update({
    where: { id: existing.id },
    data: {
      status: 'filed',
      courtCaseNumber: data.courtCaseNumber,
      courtName: data.courtName ?? null,
      filedAt: data.filedAt ? new Date(data.filedAt) : new Date(),
    },
    include: evictionInclude,
  });
}

export async function setEvictionCourtDate(organizationId: string, evictionId: string, courtDate: string) {
  const existing = await getEviction(organizationId, evictionId);
  if (existing.status !== 'filed' && existing.status !== 'court_date_set') {
    throw new AppError(400, 'INVALID_STATUS_TRANSITION', 'A court date can only be set once the case has been filed.');
  }

  return prisma.eviction.update({
    where: { id: existing.id },
    data: { status: 'court_date_set', courtDate: new Date(courtDate) },
    include: evictionInclude,
  });
}

export async function recordEvictionJudgment(
  organizationId: string,
  evictionId: string,
  judgmentOutcome: EvictionJudgmentOutcome,
  judgmentAt?: string | null
) {
  const existing = await getEviction(organizationId, evictionId);
  if (existing.status !== 'court_date_set') {
    throw new AppError(400, 'INVALID_STATUS_TRANSITION', 'A judgment can only be recorded once a court date has been set.');
  }

  return prisma.eviction.update({
    where: { id: existing.id },
    data: {
      status: 'judgment',
      judgmentOutcome,
      judgmentAt: judgmentAt ? new Date(judgmentAt) : new Date(),
    },
    include: evictionInclude,
  });
}

export async function recordEvictionWrit(organizationId: string, evictionId: string, writIssuedAt?: string | null) {
  const existing = await getEviction(organizationId, evictionId);
  if (existing.status !== 'judgment' || existing.judgmentOutcome !== 'possession_landlord') {
    throw new AppError(
      400,
      'INVALID_STATUS_TRANSITION',
      'A writ of possession can only be issued after a judgment awarding possession to the landlord.'
    );
  }

  return prisma.eviction.update({
    where: { id: existing.id },
    data: { status: 'writ_issued', writIssuedAt: writIssuedAt ? new Date(writIssuedAt) : new Date() },
    include: evictionInclude,
  });
}

export async function completeEviction(organizationId: string, evictionId: string, completedAt?: string | null) {
  const existing = await getEviction(organizationId, evictionId);
  if (!['expired', 'writ_issued', 'judgment'].includes(existing.status)) {
    throw new AppError(
      400,
      'INVALID_STATUS_TRANSITION',
      'An eviction can only be completed once the notice has expired (voluntary vacate) or possession has been recovered.'
    );
  }

  return prisma.eviction.update({
    where: { id: existing.id },
    data: { status: 'completed', completedAt: completedAt ? new Date(completedAt) : new Date() },
    include: evictionInclude,
  });
}

export async function dismissEviction(
  organizationId: string,
  evictionId: string,
  dismissedReason: string,
  dismissedAt?: string | null
) {
  const existing = await getEviction(organizationId, evictionId);
  if (!['filed', 'court_date_set', 'judgment'].includes(existing.status)) {
    throw new AppError(400, 'INVALID_STATUS_TRANSITION', 'Only a filed case can be dismissed.');
  }

  return prisma.eviction.update({
    where: { id: existing.id },
    data: { status: 'dismissed', dismissedReason, dismissedAt: dismissedAt ? new Date(dismissedAt) : new Date() },
    include: evictionInclude,
  });
}
