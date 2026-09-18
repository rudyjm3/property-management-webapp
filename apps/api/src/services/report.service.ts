import { prisma, UnitStatus } from '@propflow/db';
import { WORK_ORDER_LOCATION_TYPES } from '@propflow/shared';
import { AppError } from '../middleware/error-handler';

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push(cur.toISOString().slice(0, 7));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

interface FinancialSummaryFilters {
  periodStart: string;
  periodEnd: string;
  propertyId?: string;
}

export interface PropertyFinancialSummary {
  propertyId: string;
  propertyName: string;
  address: string;
  totalIncome: number;
  totalExpenses: number;
  netOperatingIncome: number;
  incomeBreakdown: {
    rent: number;
    lateFees: number;
    deposits: number;
    other: number;
  };
  owners: Array<{
    ownerId: string;
    ownerName: string;
    ownershipPct: number;
    ownerShare: number;
  }>;
}

export async function getFinancialSummary(
  organizationId: string,
  filters: FinancialSummaryFilters
): Promise<{
  periodStart: string;
  periodEnd: string;
  properties: PropertyFinancialSummary[];
  totals: {
    totalIncome: number;
    totalExpenses: number;
    netOperatingIncome: number;
  };
}> {
  const start = new Date(filters.periodStart);
  const end = new Date(filters.periodEnd);
  // Include full last day
  end.setHours(23, 59, 59, 999);

  const properties = await prisma.property.findMany({
    where: {
      organizationId,
      ...(filters.propertyId ? { id: filters.propertyId } : {}),
    },
    include: {
      units: {
        include: {
          leases: {
            include: {
              payments: {
                where: {
                  status: 'completed',
                  paidAt: { gte: start, lte: end },
                  deletedAt: null,
                },
                select: {
                  amount: true,
                  type: true,
                },
              },
            },
          },
          workOrders: {
            where: {
              status: { in: ['completed', 'closed'] },
              completedAt: { gte: start, lte: end },
              totalCost: { not: null },
            },
            select: {
              totalCost: true,
            },
          },
        },
      },
      // Property-level (common area) work orders — unitId null so unit-scoped
      // orders, which also carry propertyId, are not double-counted.
      workOrders: {
        where: {
          unitId: null,
          status: { in: ['completed', 'closed'] },
          completedAt: { gte: start, lte: end },
          totalCost: { not: null },
        },
        select: {
          totalCost: true,
        },
      },
      propertyOwners: {
        include: {
          owner: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const result: PropertyFinancialSummary[] = properties.map((property) => {
    let rent = 0;
    let lateFees = 0;
    let deposits = 0;
    let other = 0;
    let totalExpenses = 0;

    for (const unit of property.units) {
      for (const lease of unit.leases) {
        for (const payment of lease.payments) {
          const amt = Number(payment.amount);
          if (payment.type === 'rent') rent += amt;
          else if (payment.type === 'late_fee') lateFees += amt;
          else if (payment.type === 'deposit' || payment.type === 'pet_deposit') deposits += amt;
          else if (payment.type === 'credit') other -= amt; // credits reduce income
          else other += amt;
        }
      }
      for (const wo of unit.workOrders) {
        totalExpenses += Number(wo.totalCost ?? 0);
      }
    }

    for (const wo of property.workOrders) {
      totalExpenses += Number(wo.totalCost ?? 0);
    }

    const totalIncome = rent + lateFees + deposits + other;
    const netOperatingIncome = totalIncome - totalExpenses;

    const owners = property.propertyOwners.map((po) => ({
      ownerId: po.owner.id,
      ownerName: po.owner.name,
      ownershipPct: Number(po.ownershipPct),
      ownerShare: (netOperatingIncome * Number(po.ownershipPct)) / 100,
    }));

    return {
      propertyId: property.id,
      propertyName: property.name,
      address: `${property.address}, ${property.city}, ${property.state}`,
      totalIncome,
      totalExpenses,
      netOperatingIncome,
      incomeBreakdown: { rent, lateFees, deposits, other },
      owners,
    };
  });

  const totals = result.reduce(
    (acc, p) => ({
      totalIncome: acc.totalIncome + p.totalIncome,
      totalExpenses: acc.totalExpenses + p.totalExpenses,
      netOperatingIncome: acc.netOperatingIncome + p.netOperatingIncome,
    }),
    { totalIncome: 0, totalExpenses: 0, netOperatingIncome: 0 }
  );

  return {
    periodStart: filters.periodStart,
    periodEnd: filters.periodEnd,
    properties: result,
    totals,
  };
}

export async function getRevenueTrend(
  organizationId: string,
  filters: { periodStart: string; periodEnd: string; propertyId?: string }
) {
  const start = new Date(filters.periodStart);
  const end = new Date(filters.periodEnd);
  end.setHours(23, 59, 59, 999);

  const payments = await prisma.payment.findMany({
    where: {
      status: 'completed',
      paidAt: { gte: start, lte: end },
      deletedAt: null,
      lease: {
        unit: {
          property: {
            organizationId,
            ...(filters.propertyId ? { id: filters.propertyId } : {}),
          },
        },
      },
    },
    select: { amount: true, type: true, paidAt: true },
  });

  const workOrders = await prisma.workOrder.findMany({
    where: {
      status: { in: ['completed', 'closed'] },
      completedAt: { gte: start, lte: end },
      totalCost: { not: null },
      OR: [
        {
          unit: {
            property: {
              organizationId,
              ...(filters.propertyId ? { id: filters.propertyId } : {}),
            },
          },
        },
        {
          unitId: null,
          property: {
            organizationId,
            ...(filters.propertyId ? { id: filters.propertyId } : {}),
          },
        },
      ],
    },
    select: { totalCost: true, completedAt: true },
  });

  const allMonths = monthsBetween(start, end);

  const incomeByMonth = new Map<string, { rent: number; lateFees: number; deposits: number; other: number }>();
  const expensesByMonth = new Map<string, number>();
  for (const m of allMonths) {
    incomeByMonth.set(m, { rent: 0, lateFees: 0, deposits: 0, other: 0 });
    expensesByMonth.set(m, 0);
  }

  for (const p of payments) {
    const m = (p.paidAt as Date).toISOString().slice(0, 7);
    if (!incomeByMonth.has(m)) continue;
    const bucket = incomeByMonth.get(m)!;
    const amt = Number(p.amount);
    if (p.type === 'rent') bucket.rent += amt;
    else if (p.type === 'late_fee') bucket.lateFees += amt;
    else if (p.type === 'deposit' || p.type === 'pet_deposit') bucket.deposits += amt;
    else if (p.type === 'credit') bucket.other -= amt;
    else bucket.other += amt;
  }

  for (const wo of workOrders) {
    const m = (wo.completedAt as Date).toISOString().slice(0, 7);
    if (!expensesByMonth.has(m)) continue;
    expensesByMonth.set(m, (expensesByMonth.get(m) ?? 0) + Number(wo.totalCost ?? 0));
  }

  const months = allMonths.map((m) => {
    const inc = incomeByMonth.get(m)!;
    const totalIncome = inc.rent + inc.lateFees + inc.deposits + inc.other;
    const totalExpenses = expensesByMonth.get(m) ?? 0;
    const [year, mo] = m.split('-');
    const label = new Date(Number(year), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return {
      month: m,
      label,
      totalIncome,
      totalExpenses,
      netOperatingIncome: totalIncome - totalExpenses,
      incomeBreakdown: inc,
    };
  });

  return { months, periodStart: filters.periodStart, periodEnd: filters.periodEnd };
}

export async function getRentRoll(
  organizationId: string,
  filters: { propertyId?: string; status?: string }
) {
  const units = await prisma.unit.findMany({
    where: {
      property: {
        organizationId,
        ...(filters.propertyId ? { id: filters.propertyId } : {}),
      },
      ...(filters.status ? { status: filters.status as UnitStatus } : {}),
    },
    include: {
      property: { select: { id: true, name: true, address: true, city: true, state: true } },
      leases: {
        where: { status: { in: ['active', 'month_to_month', 'notice_given'] }, deletedAt: null },
        orderBy: { startDate: 'desc' },
        take: 1,
        include: {
          participants: {
            where: { isPrimary: true },
            include: { tenant: { select: { name: true, email: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
  });

  const rows = units.map((unit) => {
    const lease = unit.leases[0] ?? null;
    const participant = lease?.participants[0] ?? null;
    const tenant = participant?.tenant ?? null;

    let daysVacant: number | null = null;
    if (unit.status === 'vacant') {
      const ref = unit.updatedAt ?? unit.createdAt;
      daysVacant = Math.floor((Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      propertyId: unit.property.id,
      propertyName: unit.property.name,
      status: unit.status,
      rentAmount: Number(unit.rentAmount ?? 0),
      sqFt: unit.sqFt,
      leaseId: lease?.id ?? null,
      leaseStatus: lease?.status ?? null,
      leaseStart: lease?.startDate ? (lease.startDate as Date).toISOString().slice(0, 10) : null,
      leaseEnd: lease?.endDate ? (lease.endDate as Date).toISOString().slice(0, 10) : null,
      tenantName: tenant?.name ?? null,
      tenantEmail: tenant?.email ?? null,
      daysVacant,
    };
  });

  const totalUnits = rows.length;
  const occupiedUnits = rows.filter((r) => r.status === 'occupied').length;
  const vacantUnits = rows.filter((r) => r.status === 'vacant').length;
  const totalScheduledRent = rows.filter((r) => r.status === 'occupied').reduce((s, r) => s + r.rentAmount, 0);

  return {
    asOf: new Date().toISOString().slice(0, 10),
    rows,
    summary: {
      totalUnits,
      occupiedUnits,
      vacantUnits,
      occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
      totalScheduledRent,
    },
  };
}

export async function getVacancySnapshot(
  organizationId: string,
  filters: { propertyId?: string }
) {
  const properties = await prisma.property.findMany({
    where: {
      organizationId,
      ...(filters.propertyId ? { id: filters.propertyId } : {}),
    },
    include: {
      units: {
        select: { status: true, updatedAt: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const byStatus = { occupied: 0, vacant: 0, notice: 0, maintenance: 0, unlisted: 0 };
  let totalUnits = 0;

  const propertySummaries = properties.map((prop) => {
    let propOccupied = 0, propVacant = 0, propNotice = 0;
    let vacantDaysSum = 0, vacantCount = 0;

    for (const unit of prop.units) {
      totalUnits++;
      const s = unit.status as keyof typeof byStatus;
      if (s in byStatus) byStatus[s]++;

      if (unit.status === 'occupied') propOccupied++;
      else if (unit.status === 'vacant') {
        propVacant++;
        const days = Math.floor((Date.now() - new Date(unit.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
        vacantDaysSum += days;
        vacantCount++;
      } else if (unit.status === 'notice') propNotice++;
    }

    const propTotal = prop.units.length;
    return {
      propertyId: prop.id,
      propertyName: prop.name,
      totalUnits: propTotal,
      occupiedUnits: propOccupied,
      vacantUnits: propVacant,
      noticeUnits: propNotice,
      occupancyRate: propTotal > 0 ? Math.round((propOccupied / propTotal) * 100) : 0,
      avgDaysVacant: vacantCount > 0 ? Math.round(vacantDaysSum / vacantCount) : null,
    };
  });

  return {
    asOf: new Date().toISOString().slice(0, 10),
    totalUnits,
    byStatus,
    occupancyRate: totalUnits > 0 ? Math.round((byStatus.occupied / totalUnits) * 100) : 0,
    properties: propertySummaries,
  };
}

// ─── Spend by Location ────────────────────────────────────────────────────────

export interface LocationSpend {
  locationType: string; // WorkOrderLocationType value, or 'unspecified' for null
  workOrderCount: number;
  laborCost: number;
  partsCost: number;
  capitalSpend: number;
  routineSpend: number;
  totalSpend: number;
}

export async function getSpendByLocation(
  organizationId: string,
  filters: { periodStart: string; periodEnd: string; propertyId?: string }
): Promise<{
  periodStart: string;
  periodEnd: string;
  locations: LocationSpend[];
  totals: {
    workOrderCount: number;
    laborCost: number;
    partsCost: number;
    capitalSpend: number;
    routineSpend: number;
    totalSpend: number;
  };
}> {
  const start = new Date(filters.periodStart);
  const end = new Date(filters.periodEnd);
  end.setHours(23, 59, 59, 999);

  const propertyFilter = filters.propertyId ? { id: filters.propertyId } : {};

  const workOrders = await prisma.workOrder.findMany({
    where: {
      status: { in: ['completed', 'closed'] },
      completedAt: { gte: start, lte: end },
      totalCost: { not: null },
      OR: [
        { unit: { property: { organizationId, ...propertyFilter } } },
        { unitId: null, property: { organizationId, ...propertyFilter } },
      ],
    },
    select: {
      totalCost: true,
      laborCost: true,
      partsCost: true,
      locationType: true,
      isCapitalProject: true,
    },
  });

  const buckets = new Map<string, LocationSpend>();
  for (const loc of [...WORK_ORDER_LOCATION_TYPES, 'unspecified']) {
    buckets.set(loc, {
      locationType: loc,
      workOrderCount: 0,
      laborCost: 0,
      partsCost: 0,
      capitalSpend: 0,
      routineSpend: 0,
      totalSpend: 0,
    });
  }

  for (const wo of workOrders) {
    const bucket = buckets.get(wo.locationType ?? 'unspecified')!;
    const total = Number(wo.totalCost ?? 0);
    bucket.workOrderCount += 1;
    bucket.laborCost += Number(wo.laborCost ?? 0);
    bucket.partsCost += Number(wo.partsCost ?? 0);
    if (wo.isCapitalProject) bucket.capitalSpend += total;
    else bucket.routineSpend += total;
    bucket.totalSpend += total;
  }

  const locations = [...buckets.values()];
  const totals = locations.reduce(
    (acc, loc) => ({
      workOrderCount: acc.workOrderCount + loc.workOrderCount,
      laborCost: acc.laborCost + loc.laborCost,
      partsCost: acc.partsCost + loc.partsCost,
      capitalSpend: acc.capitalSpend + loc.capitalSpend,
      routineSpend: acc.routineSpend + loc.routineSpend,
      totalSpend: acc.totalSpend + loc.totalSpend,
    }),
    { workOrderCount: 0, laborCost: 0, partsCost: 0, capitalSpend: 0, routineSpend: 0, totalSpend: 0 }
  );

  return {
    periodStart: filters.periodStart,
    periodEnd: filters.periodEnd,
    locations,
    totals,
  };
}

// ─── Vacancy History (Module 11) ───────────────────────────────────────────────
// Point-in-time vacancy snapshots, recorded on demand (or by a scheduled job
// hitting the same endpoint), so vacancy-rate trends can be charted over time
// and compared against a manually-entered market rate for the same period.

export async function recordVacancySnapshot(
  organizationId: string,
  input: { propertyId?: string; marketVacancyRatePct?: number; snapshotDate?: string }
) {
  const snapshotDate = input.snapshotDate ? new Date(input.snapshotDate) : new Date();
  snapshotDate.setUTCHours(0, 0, 0, 0);

  const properties = await prisma.property.findMany({
    where: {
      organizationId,
      ...(input.propertyId ? { id: input.propertyId } : {}),
    },
    select: { id: true, units: { select: { status: true } } },
  });

  const results = [];
  let orgTotalUnits = 0;
  let orgVacantUnits = 0;

  for (const prop of properties) {
    const totalUnits = prop.units.length;
    const vacantUnits = prop.units.filter((u) => u.status === 'vacant').length;
    orgTotalUnits += totalUnits;
    orgVacantUnits += vacantUnits;

    const vacancyRatePct = totalUnits > 0 ? (vacantUnits / totalUnits) * 100 : 0;

    const row = await prisma.vacancyHistory.upsert({
      where: { organizationId_propertyId_snapshotDate: { organizationId, propertyId: prop.id, snapshotDate } },
      create: {
        organizationId,
        propertyId: prop.id,
        snapshotDate,
        totalUnits,
        vacantUnits,
        vacancyRatePct,
        marketVacancyRatePct: input.marketVacancyRatePct ?? null,
      },
      update: {
        totalUnits,
        vacantUnits,
        vacancyRatePct,
        ...(input.marketVacancyRatePct != null ? { marketVacancyRatePct: input.marketVacancyRatePct } : {}),
      },
    });
    results.push(row);
  }

  // Org-wide aggregate row (propertyId: null) — only recorded when snapshotting
  // the whole portfolio, not a single-property snapshot.
  if (!input.propertyId) {
    // The compound unique index can't be targeted via upsert's `where` when
    // propertyId is null (Prisma requires a non-null value there), so this
    // aggregate row is looked up and created/updated manually instead.
    const orgVacancyRatePct = orgTotalUnits > 0 ? (orgVacantUnits / orgTotalUnits) * 100 : 0;
    const existingOrgRow = await prisma.vacancyHistory.findFirst({
      where: { organizationId, propertyId: null, snapshotDate },
    });

    const orgRow = existingOrgRow
      ? await prisma.vacancyHistory.update({
          where: { id: existingOrgRow.id },
          data: {
            totalUnits: orgTotalUnits,
            vacantUnits: orgVacantUnits,
            vacancyRatePct: orgVacancyRatePct,
            ...(input.marketVacancyRatePct != null ? { marketVacancyRatePct: input.marketVacancyRatePct } : {}),
          },
        })
      : await prisma.vacancyHistory.create({
          data: {
            organizationId,
            propertyId: null,
            snapshotDate,
            totalUnits: orgTotalUnits,
            vacantUnits: orgVacantUnits,
            vacancyRatePct: orgVacancyRatePct,
            marketVacancyRatePct: input.marketVacancyRatePct ?? null,
          },
        });
    results.push(orgRow);
  }

  return results;
}

export async function getVacancyHistory(
  organizationId: string,
  filters: { propertyId?: string; periodStart?: string; periodEnd?: string }
) {
  const history = await prisma.vacancyHistory.findMany({
    where: {
      organizationId,
      propertyId: filters.propertyId ?? null,
      ...(filters.periodStart || filters.periodEnd
        ? {
            snapshotDate: {
              ...(filters.periodStart ? { gte: new Date(filters.periodStart) } : {}),
              ...(filters.periodEnd ? { lte: new Date(filters.periodEnd) } : {}),
            },
          }
        : {}),
    },
    orderBy: { snapshotDate: 'asc' },
  });

  return history.map((h) => ({
    id: h.id,
    propertyId: h.propertyId,
    snapshotDate: h.snapshotDate.toISOString().slice(0, 10),
    totalUnits: h.totalUnits,
    vacantUnits: h.vacantUnits,
    vacancyRatePct: Number(h.vacancyRatePct),
    marketVacancyRatePct: h.marketVacancyRatePct != null ? Number(h.marketVacancyRatePct) : null,
  }));
}

// ─── Schedule E Export (Advanced Payments & Accounting / Module 4) ───────────
// A tax-filing-support data export, not a filled IRS Schedule E form: it
// projects the same income/expense computation getFinancialSummary already
// does per property onto the subset of fields a preparer needs to fill
// Schedule E's per-property columns (rents received, repair/maintenance
// expenses, management fees, net income/loss), plus Property.taxParcelId.
// Management fees come from any Disbursement rows recorded against that
// property's OwnerStatements within the period — $0 if none were recorded
// (e.g. the org doesn't use the Owner Portal / disbursement flow).

export interface ScheduleEExportRow {
  propertyId: string;
  propertyName: string;
  address: string;
  taxParcelId: string | null;
  rentsReceived: number;
  otherIncome: number;
  repairsAndMaintenanceExpenses: number;
  managementFees: number;
  totalExpenses: number;
  netIncomeOrLoss: number;
}

export async function getScheduleEExport(
  organizationId: string,
  filters: FinancialSummaryFilters
): Promise<{ periodStart: string; periodEnd: string; rows: ScheduleEExportRow[] }> {
  const summary = await getFinancialSummary(organizationId, filters);

  const start = new Date(filters.periodStart);
  const end = new Date(filters.periodEnd);
  end.setHours(23, 59, 59, 999);

  // Recognize each disbursement's management fee on a single date (createdAt)
  // rather than matching against its OwnerStatement's period range — an
  // overlap match would double- (or triple-) count a multi-month statement's
  // fee across every export period it overlaps. Cancelled disbursements are
  // excluded entirely since they were never actually charged.
  const disbursements = await prisma.disbursement.findMany({
    where: {
      organizationId,
      status: { not: 'cancelled' },
      ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
      createdAt: { gte: start, lte: end },
    },
    select: { propertyId: true, managementFeeAmount: true },
  });

  const managementFeesByProperty = new Map<string, number>();
  for (const d of disbursements) {
    managementFeesByProperty.set(
      d.propertyId,
      (managementFeesByProperty.get(d.propertyId) ?? 0) + Number(d.managementFeeAmount)
    );
  }

  const propertyTaxParcelIds = await prisma.property.findMany({
    where: { organizationId, ...(filters.propertyId ? { id: filters.propertyId } : {}) },
    select: { id: true, taxParcelId: true },
  });
  const taxParcelIdByProperty = new Map(propertyTaxParcelIds.map((p) => [p.id, p.taxParcelId]));

  const rows: ScheduleEExportRow[] = summary.properties.map((p) => {
    const managementFees = managementFeesByProperty.get(p.propertyId) ?? 0;
    const rentsReceived = p.incomeBreakdown.rent + p.incomeBreakdown.lateFees;
    const totalExpenses = p.totalExpenses + managementFees;
    return {
      propertyId: p.propertyId,
      propertyName: p.propertyName,
      address: p.address,
      taxParcelId: taxParcelIdByProperty.get(p.propertyId) ?? null,
      rentsReceived,
      otherIncome: p.incomeBreakdown.other,
      repairsAndMaintenanceExpenses: p.totalExpenses,
      managementFees,
      totalExpenses,
      netIncomeOrLoss: rentsReceived + p.incomeBreakdown.other - totalExpenses,
    };
  });

  return { periodStart: filters.periodStart, periodEnd: filters.periodEnd, rows };
}

// ─── Grounds Maintenance Compliance (Grounds & Property Maintenance / Module 3) ─
// Task completion history and compliance reporting for MaintenanceSchedule-
// generated WorkOrders, per property. "On time" compares a completed work
// order's completedAt against the scheduledAt it was generated with
// (groundsMaintenanceJob.ts always sets scheduledAt to the schedule's due
// date at generation time); "overdue" is a still-open generated work order
// whose scheduledAt has already passed. Photo-compliance rate only covers
// completed generated work orders' `photosAfter` array — it does NOT check
// whether a separate grounds Inspection (see inspection.service.ts) exists
// for the same period, since recurring task generation and the grounds
// inspection log are two independent mechanisms in this v1, not linked to
// each other. Grounds inspection counts are reported separately alongside.

export interface GroundsMaintenanceComplianceRow {
  propertyId: string;
  propertyName: string;
  generatedCount: number;
  completedOnTime: number;
  completedLate: number;
  openOverdue: number;
  photoComplianceRate: number | null; // null when there are 0 completed work orders to measure
  groundsInspectionsCompleted: number;
}

export async function getGroundsMaintenanceCompliance(
  organizationId: string,
  filters: { propertyId?: string; periodStart?: string; periodEnd?: string }
): Promise<{ periodStart: string | null; periodEnd: string | null; properties: GroundsMaintenanceComplianceRow[] }> {
  const start = filters.periodStart ? new Date(filters.periodStart) : null;
  const end = filters.periodEnd ? new Date(filters.periodEnd) : null;
  if (end) end.setHours(23, 59, 59, 999);

  const properties = await prisma.property.findMany({
    where: { organizationId, ...(filters.propertyId ? { id: filters.propertyId } : {}) },
    select: { id: true, name: true },
  });

  const now = new Date();

  const rows: GroundsMaintenanceComplianceRow[] = [];
  for (const property of properties) {
    const workOrders = await prisma.workOrder.findMany({
      where: {
        propertyId: property.id,
        scheduleId: { not: null },
        ...(start || end
          ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
          : {}),
      },
      select: { status: true, scheduledAt: true, completedAt: true, photosAfter: true },
    });

    let completedOnTime = 0;
    let completedLate = 0;
    let openOverdue = 0;
    let completedWithPhoto = 0;
    const completedCount = workOrders.filter((wo) => wo.status === 'completed' || wo.status === 'closed').length;

    for (const wo of workOrders) {
      const isCompleted = wo.status === 'completed' || wo.status === 'closed';
      if (isCompleted) {
        if (wo.completedAt && wo.scheduledAt && wo.completedAt <= wo.scheduledAt) {
          completedOnTime++;
        } else {
          completedLate++;
        }
        if (wo.photosAfter.length > 0) completedWithPhoto++;
      } else if (wo.scheduledAt && wo.scheduledAt < now) {
        openOverdue++;
      }
    }

    const groundsInspectionsCompleted = await prisma.inspection.count({
      where: {
        propertyId: property.id,
        type: 'grounds',
        status: 'completed',
        ...(start || end
          ? { completedAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
          : {}),
      },
    });

    rows.push({
      propertyId: property.id,
      propertyName: property.name,
      generatedCount: workOrders.length,
      completedOnTime,
      completedLate,
      openOverdue,
      photoComplianceRate: completedCount > 0 ? Math.round((completedWithPhoto / completedCount) * 1000) / 10 : null,
      groundsInspectionsCompleted,
    });
  }

  return {
    periodStart: filters.periodStart ?? null,
    periodEnd: filters.periodEnd ?? null,
    properties: rows,
  };
}

// ─── Report Builder (Module 11) ───────────────────────────────────────────────
// Runs an existing report source and projects it down to the columns the user
// picked — the "configurable report builder" over the existing report data
// the module spec calls for, rather than a fixed set of columns per source.

export const REPORT_BUILDER_SOURCES = [
  'financial-summary',
  'rent-roll',
  'spend-by-location',
  'vacancy-snapshot',
  'vacancy-history',
] as const;

export type ReportBuilderSource = (typeof REPORT_BUILDER_SOURCES)[number];

interface ReportBuilderInput {
  source: ReportBuilderSource;
  columns?: string[];
  filters?: {
    periodStart?: string;
    periodEnd?: string;
    propertyId?: string;
    status?: string;
  };
}

function projectColumns(rows: Record<string, unknown>[], columns?: string[]) {
  if (!columns || columns.length === 0) return rows;
  return rows.map((row) => {
    const projected: Record<string, unknown> = {};
    for (const col of columns) projected[col] = row[col];
    return projected;
  });
}

export async function runReportBuilder(organizationId: string, input: ReportBuilderInput) {
  const filters = input.filters ?? {};
  let rows: Record<string, unknown>[];
  let availableColumns: string[];

  switch (input.source) {
    case 'financial-summary': {
      const result = await getFinancialSummary(organizationId, {
        periodStart: filters.periodStart ?? '1970-01-01',
        periodEnd: filters.periodEnd ?? new Date().toISOString().slice(0, 10),
        propertyId: filters.propertyId,
      });
      rows = result.properties.map((p) => ({
        propertyId: p.propertyId,
        propertyName: p.propertyName,
        address: p.address,
        rent: p.incomeBreakdown.rent,
        lateFees: p.incomeBreakdown.lateFees,
        deposits: p.incomeBreakdown.deposits,
        otherIncome: p.incomeBreakdown.other,
        totalIncome: p.totalIncome,
        totalExpenses: p.totalExpenses,
        netOperatingIncome: p.netOperatingIncome,
      }));
      availableColumns = ['propertyId', 'propertyName', 'address', 'rent', 'lateFees', 'deposits', 'otherIncome', 'totalIncome', 'totalExpenses', 'netOperatingIncome'];
      break;
    }
    case 'rent-roll': {
      const result = await getRentRoll(organizationId, { propertyId: filters.propertyId, status: filters.status });
      rows = result.rows;
      availableColumns = ['unitId', 'unitNumber', 'propertyId', 'propertyName', 'status', 'rentAmount', 'sqFt', 'leaseId', 'leaseStatus', 'leaseStart', 'leaseEnd', 'tenantName', 'tenantEmail', 'daysVacant'];
      break;
    }
    case 'spend-by-location': {
      const result = await getSpendByLocation(organizationId, {
        periodStart: filters.periodStart ?? '1970-01-01',
        periodEnd: filters.periodEnd ?? new Date().toISOString().slice(0, 10),
        propertyId: filters.propertyId,
      });
      rows = result.locations as unknown as Record<string, unknown>[];
      availableColumns = ['locationType', 'workOrderCount', 'laborCost', 'partsCost', 'capitalSpend', 'routineSpend', 'totalSpend'];
      break;
    }
    case 'vacancy-snapshot': {
      const result = await getVacancySnapshot(organizationId, { propertyId: filters.propertyId });
      rows = result.properties;
      availableColumns = ['propertyId', 'propertyName', 'totalUnits', 'occupiedUnits', 'vacantUnits', 'noticeUnits', 'occupancyRate', 'avgDaysVacant'];
      break;
    }
    case 'vacancy-history': {
      rows = await getVacancyHistory(organizationId, {
        propertyId: filters.propertyId,
        periodStart: filters.periodStart,
        periodEnd: filters.periodEnd,
      });
      availableColumns = ['id', 'propertyId', 'snapshotDate', 'totalUnits', 'vacantUnits', 'vacancyRatePct', 'marketVacancyRatePct'];
      break;
    }
  }

  return {
    source: input.source,
    availableColumns,
    columns: input.columns && input.columns.length > 0 ? input.columns : availableColumns,
    rows: projectColumns(rows, input.columns),
  };
}

// ─── Saved Report Configs ──────────────────────────────────────────────────────

export async function listSavedReports(organizationId: string) {
  return prisma.savedReport.findMany({
    where: { organizationId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function createSavedReport(
  organizationId: string,
  userId: string,
  data: { name: string; source: ReportBuilderSource; columns: string[]; filters: Record<string, unknown> }
) {
  return prisma.savedReport.create({
    data: {
      organizationId,
      createdByUserId: userId,
      name: data.name,
      source: data.source,
      columns: data.columns,
      filters: data.filters as object,
    },
  });
}

export async function deleteSavedReport(organizationId: string, savedReportId: string) {
  const existing = await prisma.savedReport.findFirst({ where: { id: savedReportId, organizationId } });
  if (!existing) throw new AppError(404, 'SAVED_REPORT_NOT_FOUND', 'Saved report not found.');
  await prisma.savedReport.delete({ where: { id: savedReportId } });
}
