import { prisma } from '@propflow/db';

export async function listStaff(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId, status: 'active' as any },
    select: { id: true, name: true, email: true, role: true, phone: true },
    orderBy: { name: 'asc' },
  });
}
