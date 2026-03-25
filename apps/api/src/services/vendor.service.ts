import { prisma } from '@propflow/db';

export async function listVendors(organizationId: string, opts: { activeOnly?: boolean } = {}) {
  return prisma.vendor.findMany({
    where: {
      organizationId,
      ...(opts.activeOnly ? { status: 'active' as any } : {}),
    },
    select: {
      id: true,
      companyName: true,
      contactName: true,
      phonePrimary: true,
      email: true,
      specialties: true,
      status: true,
      preferred: true,
    },
    orderBy: [{ preferred: 'desc' }, { companyName: 'asc' }],
  });
}
