import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';

/**
 * Read-only owner-facing portal service — Module 9. Every query is scoped to
 * ownerId so an owner can never see another owner's properties or statements,
 * even within the same organization.
 */

export async function getOwnerProfile(ownerId: string) {
  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      organizationId: true,
      organization: { select: { id: true, name: true, timezone: true } },
    },
  });
  if (!owner) throw new AppError(404, 'OWNER_NOT_FOUND', 'Owner not found.');
  return owner;
}

async function getOwnedPropertyIds(ownerId: string): Promise<string[]> {
  const rows = await prisma.propertyOwner.findMany({
    where: { ownerId },
    select: { propertyId: true },
  });
  return rows.map((r) => r.propertyId);
}

export async function getOwnerProperties(ownerId: string) {
  const propertyOwners = await prisma.propertyOwner.findMany({
    where: { ownerId },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          type: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          unitCount: true,
          units: { select: { id: true, status: true } },
        },
      },
    },
    orderBy: { property: { name: 'asc' } },
  });

  return propertyOwners.map((po) => {
    const occupied = po.property.units.filter((u) => u.status === 'occupied').length;
    const total = po.property.units.length;
    return {
      propertyId: po.property.id,
      name: po.property.name,
      type: po.property.type,
      address: po.property.address,
      city: po.property.city,
      state: po.property.state,
      zip: po.property.zip,
      ownershipPct: Number(po.ownershipPct),
      unitCount: total || po.property.unitCount,
      occupiedUnits: occupied,
      occupancyPct: total > 0 ? Math.round((occupied / total) * 100) : 0,
    };
  });
}

// Owners only ever see statements that a manager has marked 'sent' — a
// 'draft' statement is a manager-side working document, not yet finalized
// for owner viewing (mirrors how draft invoices aren't shown to customers).
export async function getOwnerStatements(ownerId: string, filters: { propertyId?: string } = {}) {
  return prisma.ownerStatement.findMany({
    where: {
      ownerId,
      status: 'sent',
      ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
    },
    include: {
      property: { select: { id: true, name: true, address: true, city: true, state: true } },
    },
    orderBy: { periodStart: 'desc' },
  });
}

export async function getOwnerStatement(ownerId: string, statementId: string) {
  const stmt = await prisma.ownerStatement.findFirst({
    where: { id: statementId, ownerId, status: 'sent' },
    include: {
      property: { select: { id: true, name: true, address: true, city: true, state: true } },
    },
  });
  if (!stmt) throw new AppError(404, 'STATEMENT_NOT_FOUND', 'Statement not found.');
  return stmt;
}

export async function getOwnerDashboard(ownerId: string) {
  const propertyIds = await getOwnedPropertyIds(ownerId);
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);

  const [properties, recentStatements, ytdStatements] = await Promise.all([
    getOwnerProperties(ownerId),
    prisma.ownerStatement.findMany({
      where: { ownerId, status: 'sent' },
      orderBy: { periodStart: 'desc' },
      take: 5,
      include: { property: { select: { id: true, name: true } } },
    }),
    // Separate, unlimited query — YTD must sum every current-year statement,
    // not just whatever happens to land in the take:5 recent-statements list
    // (an owner with several properties can easily have more than 5 for the year).
    prisma.ownerStatement.findMany({
      where: { ownerId, status: 'sent', periodStart: { gte: yearStart, lt: yearEnd } },
      select: { distributionAmount: true },
    }),
  ]);

  const totalUnits = properties.reduce((sum, p) => sum + p.unitCount, 0);
  const occupiedUnits = properties.reduce((sum, p) => sum + p.occupiedUnits, 0);

  const ytdDistributions = ytdStatements.reduce((sum, s) => sum + Number(s.distributionAmount), 0);

  return {
    propertyCount: properties.length,
    totalUnits,
    occupiedUnits,
    portfolioOccupancyPct: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
    ytdDistributions,
    recentStatements,
    properties,
    ownedPropertyIds: propertyIds,
  };
}
