import { prisma } from '@propflow/db';

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
      unit: {
        property: {
          organizationId,
          ...(filters.propertyId ? { id: filters.propertyId } : {}),
        },
      },
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
      deletedAt: null,
      ...(filters.status ? { status: filters.status as any } : {}),
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
            include: { tenant: { select: { firstName: true, lastName: true, email: true } } },
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
      tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : null,
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
        where: { deletedAt: null },
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
