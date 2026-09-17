import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import { supabaseAdmin } from '../lib/supabase';
import { sendOwnerPortalInviteEmail } from './email.service';

// ─── Owner CRUD ───────────────────────────────────────────────────────────────

export async function listOwners(organizationId: string) {
  return prisma.owner.findMany({
    where: { organizationId },
    include: {
      propertyOwners: {
        include: {
          property: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getOwner(organizationId: string, ownerId: string) {
  const owner = await prisma.owner.findFirst({
    where: { id: ownerId, organizationId },
    include: {
      propertyOwners: {
        include: {
          property: { select: { id: true, name: true, address: true, city: true, state: true } },
        },
      },
    },
  });
  if (!owner) throw new AppError(404, 'OWNER_NOT_FOUND', 'Owner not found.');
  return owner;
}

export async function createOwner(
  organizationId: string,
  data: {
    name: string;
    email: string;
    phone?: string | null;
    address?: string | null;
    taxId?: string | null;
    notes?: string | null;
  }
) {
  const existing = await prisma.owner.findFirst({
    where: { organizationId, email: data.email },
  });
  if (existing) throw new AppError(409, 'OWNER_EMAIL_CONFLICT', 'An owner with this email already exists.');

  return prisma.owner.create({
    data: {
      organizationId,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      address: data.address ?? null,
      taxId: data.taxId ?? null,
      notes: data.notes ?? null,
    },
  });
}

export async function updateOwner(
  organizationId: string,
  ownerId: string,
  data: Partial<{
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    notes: string | null;
  }>
) {
  await getOwner(organizationId, ownerId);

  if (data.email) {
    const conflict = await prisma.owner.findFirst({
      where: { organizationId, email: data.email, NOT: { id: ownerId } },
    });
    if (conflict) throw new AppError(409, 'OWNER_EMAIL_CONFLICT', 'An owner with this email already exists.');
  }

  return prisma.owner.update({ where: { id: ownerId }, data });
}

export async function deleteOwner(organizationId: string, ownerId: string) {
  await getOwner(organizationId, ownerId);
  await prisma.owner.delete({ where: { id: ownerId } });
}

// ─── Owner Portal Invite ───────────────────────────────────────────────────────

function isAlreadyRegisteredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('already been registered') ||
    lower.includes('already registered') ||
    lower.includes('already exists')
  );
}

async function findSupabaseUserIdByEmail(email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').trim().toLowerCase() === normalizedEmail);
    if (match) return match.id;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

/**
 * Invites an owner to the read-only owner portal — generates a Supabase auth
 * user (if one doesn't already exist for this email) and emails a set-password
 * link. Mirrors the tenant invite-portal / staff invite flows.
 */
export async function inviteOwnerPortal(organizationId: string, ownerId: string) {
  const owner = await getOwner(organizationId, ownerId);

  if (owner.portalStatus === 'active') {
    throw new AppError(409, 'ALREADY_ACTIVE', 'This owner has already activated their portal account.');
  }

  const onboardingNext = encodeURIComponent('/owner-portal/set-password?invited=true');
  const redirectTo = `${process.env.APP_URL}/auth/callback?next=${onboardingNext}`;

  // Resend for an owner who already has a linked Supabase user uses a recovery
  // link instead of a fresh invite — Supabase rejects a second 'invite'
  // generateLink for an already-registered email.
  let supabaseUserId: string | null = owner.supabaseUserId;
  let actionLink: string | undefined;
  let createdNewSupabaseUser = false;

  if (owner.supabaseUserId) {
    const recovery = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: owner.email,
      options: { redirectTo },
    });
    if (recovery.error || !recovery.data.properties?.action_link) {
      throw new AppError(400, 'INVITE_FAILED', recovery.error?.message || 'Failed to generate owner portal invite link.');
    }
    actionLink = recovery.data.properties.action_link;
  } else {
    const invite = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: owner.email,
      options: {
        redirectTo,
        data: { ownerId: owner.id, organizationId },
      },
    });

    if (invite.error) {
      // The owner's email may already have a Supabase account under a different
      // record (e.g. the same person is also a tenant or staff user) — fall back
      // to a recovery link against that existing account instead of failing.
      if (!isAlreadyRegisteredError(invite.error.message)) {
        throw new AppError(400, 'INVITE_FAILED', invite.error.message);
      }

      const existingUserId = await findSupabaseUserIdByEmail(owner.email);
      const recovery = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: owner.email,
        options: { redirectTo },
      });
      if (recovery.error || !recovery.data.properties?.action_link) {
        throw new AppError(400, 'INVITE_FAILED', recovery.error?.message || 'Failed to generate owner portal invite link.');
      }
      actionLink = recovery.data.properties.action_link;
      supabaseUserId = existingUserId;
    } else {
      if (!invite.data.properties?.action_link) {
        throw new AppError(400, 'INVITE_FAILED', 'Failed to generate owner portal invite link.');
      }
      actionLink = invite.data.properties.action_link;
      supabaseUserId = invite.data.user?.id ?? null;
      createdNewSupabaseUser = true;
    }
  }

  try {
    await sendOwnerPortalInviteEmail(owner.email, owner.name, actionLink!);
  } catch (_emailErr) {
    // Only clean up a Supabase user this call created — never delete an
    // already-existing account (the owner's own, or one shared with a tenant/
    // staff record), which would strand that account on retry.
    if (createdNewSupabaseUser && supabaseUserId) {
      await supabaseAdmin.auth.admin.deleteUser(supabaseUserId).catch(() => {});
    }
    throw new AppError(500, 'INVITE_EMAIL_FAILED', 'Failed to send owner portal invite email. Please try again.');
  }

  return prisma.owner.update({
    where: { id: ownerId },
    data: {
      supabaseUserId: supabaseUserId ?? owner.supabaseUserId ?? null,
      portalStatus: 'invited',
      portalInvitedAt: new Date(),
    },
    select: { id: true, email: true, portalStatus: true, portalInvitedAt: true },
  });
}

// ─── Property Ownership ───────────────────────────────────────────────────────

export async function assignPropertyOwner(
  organizationId: string,
  propertyId: string,
  ownerId: string,
  ownershipPct: number
) {
  // Verify property belongs to this org
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });
  if (!property) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found.');

  await getOwner(organizationId, ownerId);

  // Upsert the assignment
  const existing = await prisma.propertyOwner.findUnique({
    where: { propertyId_ownerId: { propertyId, ownerId } },
  });

  if (existing) {
    return prisma.propertyOwner.update({
      where: { id: existing.id },
      data: { ownershipPct },
    });
  }

  return prisma.propertyOwner.create({
    data: { propertyId, ownerId, ownershipPct },
  });
}

export async function removePropertyOwner(
  organizationId: string,
  propertyId: string,
  ownerId: string
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });
  if (!property) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found.');

  const assignment = await prisma.propertyOwner.findUnique({
    where: { propertyId_ownerId: { propertyId, ownerId } },
  });
  if (!assignment) throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Ownership assignment not found.');

  await prisma.propertyOwner.delete({ where: { id: assignment.id } });
}

export async function listPropertyOwners(organizationId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
  });
  if (!property) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found.');

  return prisma.propertyOwner.findMany({
    where: { propertyId },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { owner: { name: 'asc' } },
  });
}

// ─── Owner Statements ─────────────────────────────────────────────────────────

export async function listOwnerStatements(organizationId: string, filters: {
  ownerId?: string;
  propertyId?: string;
}) {
  return prisma.ownerStatement.findMany({
    where: {
      organizationId,
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      property: { select: { id: true, name: true } },
    },
    orderBy: { periodStart: 'desc' },
  });
}

export async function getOwnerStatement(organizationId: string, statementId: string) {
  const stmt = await prisma.ownerStatement.findFirst({
    where: { id: statementId, organizationId },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true, address: true } },
      property: { select: { id: true, name: true, address: true, city: true, state: true } },
    },
  });
  if (!stmt) throw new AppError(404, 'STATEMENT_NOT_FOUND', 'Owner statement not found.');
  return stmt;
}

export async function createOwnerStatement(
  organizationId: string,
  data: {
    propertyId: string;
    ownerId: string;
    periodStart: string;
    periodEnd: string;
    totalIncome: number;
    totalExpenses: number;
    netOperatingIncome: number;
    distributionAmount: number;
    status?: 'draft' | 'sent';
    notes?: string | null;
  }
) {
  // Verify property and owner belong to this org
  const property = await prisma.property.findFirst({ where: { id: data.propertyId, organizationId } });
  if (!property) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found.');

  await getOwner(organizationId, data.ownerId);

  return prisma.ownerStatement.create({
    data: {
      organizationId,
      propertyId: data.propertyId,
      ownerId: data.ownerId,
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
      totalIncome: data.totalIncome,
      totalExpenses: data.totalExpenses,
      netOperatingIncome: data.netOperatingIncome,
      distributionAmount: data.distributionAmount,
      status: data.status ?? 'draft',
      notes: data.notes ?? null,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      property: { select: { id: true, name: true } },
    },
  });
}

export async function updateOwnerStatement(
  organizationId: string,
  statementId: string,
  data: {
    totalIncome?: number;
    totalExpenses?: number;
    netOperatingIncome?: number;
    distributionAmount?: number;
    status?: 'draft' | 'sent';
    notes?: string | null;
  }
) {
  await getOwnerStatement(organizationId, statementId);
  const { totalIncome, totalExpenses, netOperatingIncome, distributionAmount, status, notes } = data;
  return prisma.ownerStatement.update({
    where: { id: statementId },
    data: { totalIncome, totalExpenses, netOperatingIncome, distributionAmount, status, notes },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      property: { select: { id: true, name: true } },
    },
  });
}

export async function deleteOwnerStatement(organizationId: string, statementId: string) {
  await getOwnerStatement(organizationId, statementId);
  await prisma.ownerStatement.delete({ where: { id: statementId } });
}

// ─── Disbursements (Advanced Payments & Accounting / Module 4) ──────────────
// A bookkeeping record only — computes a management-fee deduction against an
// OwnerStatement's distributionAmount and persists the result. There is no
// payout wiring to the owner's bank account: Owner Portal doesn't capture
// owner bank details, so `status` just tracks whether the manager has sent
// the money outside the app.

export async function listDisbursements(organizationId: string, ownerStatementId: string) {
  await getOwnerStatement(organizationId, ownerStatementId);
  return prisma.disbursement.findMany({
    where: { organizationId, ownerStatementId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createDisbursement(
  organizationId: string,
  ownerStatementId: string,
  data: { managementFeePct?: number; referenceNote?: string | null }
) {
  const statement = await getOwnerStatement(organizationId, ownerStatementId);

  // A statement's distributionAmount represents its entire owed payout — an
  // existing pending/completed disbursement already accounts for it, so a
  // second one would double the recorded payout and double-count the
  // management fee in the Schedule E export. Cancelled disbursements don't
  // block a new one (that's how you correct a mistaken disbursement).
  const existingActive = await prisma.disbursement.findFirst({
    where: { organizationId, ownerStatementId, status: { in: ['pending', 'completed'] } },
  });
  if (existingActive) {
    throw new AppError(
      409,
      'DISBURSEMENT_ALREADY_EXISTS',
      'This owner statement already has an active disbursement. Cancel it before creating a new one.'
    );
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { defaultManagementFeePct: true },
  });

  const grossAmount = Number(statement.distributionAmount);
  const managementFeePct = data.managementFeePct ?? Number(org.defaultManagementFeePct);
  const managementFeeAmount = Math.round(grossAmount * managementFeePct) / 100;
  const netDisbursementAmount = Math.round((grossAmount - managementFeeAmount) * 100) / 100;

  return prisma.disbursement.create({
    data: {
      organizationId,
      ownerStatementId,
      ownerId: statement.ownerId,
      propertyId: statement.propertyId,
      grossAmount,
      managementFeePct,
      managementFeeAmount,
      netDisbursementAmount,
      referenceNote: data.referenceNote ?? null,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      property: { select: { id: true, name: true } },
    },
  });
}

export async function updateDisbursement(
  organizationId: string,
  disbursementId: string,
  data: { status: 'pending' | 'completed' | 'cancelled'; referenceNote?: string | null }
) {
  const existing = await prisma.disbursement.findFirst({
    where: { id: disbursementId, organizationId },
  });
  if (!existing) throw new AppError(404, 'DISBURSEMENT_NOT_FOUND', 'Disbursement not found.');

  return prisma.disbursement.update({
    where: { id: disbursementId },
    data: {
      status: data.status,
      referenceNote: data.referenceNote ?? existing.referenceNote,
      disbursedAt: data.status === 'completed' ? new Date() : existing.disbursedAt,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      property: { select: { id: true, name: true } },
    },
  });
}
