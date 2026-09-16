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
  // First invite creates the Supabase auth user via type 'invite'; a resend for an
  // owner who already has one (but hasn't activated yet) uses 'recovery' instead,
  // since Supabase rejects a second 'invite' generateLink for an existing user.
  const redirectTo = `${process.env.APP_URL}/auth/callback?next=${onboardingNext}`;
  const {
    data: { user: supabaseUser, properties },
    error,
  } = owner.supabaseUserId
    ? await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: owner.email,
        options: { redirectTo },
      })
    : await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: owner.email,
        options: {
          redirectTo,
          data: { ownerId: owner.id, organizationId },
        },
      });

  if (error || !properties?.action_link) {
    throw new AppError(400, 'INVITE_FAILED', error?.message || 'Failed to generate owner portal invite link.');
  }

  try {
    await sendOwnerPortalInviteEmail(owner.email, owner.name, properties.action_link);
  } catch (_emailErr) {
    if (supabaseUser) {
      await supabaseAdmin.auth.admin.deleteUser(supabaseUser.id).catch(() => {});
    }
    throw new AppError(500, 'INVITE_EMAIL_FAILED', 'Failed to send owner portal invite email. Please try again.');
  }

  return prisma.owner.update({
    where: { id: ownerId },
    data: {
      supabaseUserId: supabaseUser?.id ?? owner.supabaseUserId ?? null,
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
