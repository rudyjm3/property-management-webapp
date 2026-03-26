import { prisma, UserStatus } from '@propflow/db';

export async function listStaff(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId, status: UserStatus.active },
    select: { id: true, name: true, email: true, role: true, phone: true },
    orderBy: { name: 'asc' },
  });
}
