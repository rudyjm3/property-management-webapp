import { prisma } from '@propflow/db';

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
