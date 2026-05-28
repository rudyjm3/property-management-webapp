import { prisma } from '@propflow/db';
import { sendLeaseSignedByTenant, sendLeaseFullySigned } from './application-email.service';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export async function getSigningContext(signingToken: string) {
  const lease = await prisma.lease.findFirst({
    where: { signingToken },
    select: {
      id: true,
      status: true,
      esignatureStatus: true,
      tenantSignedAt: true,
      managerSignedAt: true,
      tenantSignatureName: true,
      startDate: true,
      endDate: true,
      rentAmount: true,
      depositAmount: true,
      utilitiesIncluded: true,
      hasPetAddendum: true,
      petDepositAmount: true,
      hasParkingAddendum: true,
      parkingFee: true,
      noticePeriodDays: true,
      unit: {
        select: {
          unitNumber: true,
          property: {
            select: {
              name: true,
              address: true,
              city: true,
              state: true,
              organization: { select: { name: true } },
            },
          },
        },
      },
      participants: {
        select: {
          isPrimary: true,
          tenant: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!lease) throw Object.assign(new Error('Signing link not found or invalid.'), { status: 404 });

  return {
    leaseId: lease.id,
    esignatureStatus: lease.esignatureStatus,
    tenantAlreadySigned: !!lease.tenantSignedAt,
    startDate: lease.startDate,
    endDate: lease.endDate,
    rentAmount: Number(lease.rentAmount),
    depositAmount: Number(lease.depositAmount),
    utilitiesIncluded: lease.utilitiesIncluded,
    hasPetAddendum: lease.hasPetAddendum,
    petDepositAmount: lease.petDepositAmount ? Number(lease.petDepositAmount) : null,
    hasParkingAddendum: lease.hasParkingAddendum,
    parkingFee: lease.parkingFee ? Number(lease.parkingFee) : null,
    noticePeriodDays: lease.noticePeriodDays,
    unit: {
      unitNumber: lease.unit.unitNumber,
      propertyName: lease.unit.property.name,
      address: lease.unit.property.address,
      city: lease.unit.property.city,
      state: lease.unit.property.state,
    },
    organizationName: lease.unit.property.organization.name,
    tenants: lease.participants.map((p) => ({
      name: p.tenant.name,
      email: p.tenant.email,
      isPrimary: p.isPrimary,
    })),
  };
}

export async function tenantSignLease(signingToken: string, signatureName: string, ip: string) {
  const lease = await prisma.lease.findFirst({
    where: { signingToken },
    select: {
      id: true,
      status: true,
      tenantSignedAt: true,
      managerSignedAt: true,
      esignatureStatus: true,
      unit: {
        select: {
          unitNumber: true,
          property: {
            select: {
              name: true,
              organization: {
                select: {
                  name: true,
                  users: {
                    where: { status: 'active', role: { in: ['owner', 'manager'] } },
                    select: { email: true },
                  },
                },
              },
            },
          },
        },
      },
      participants: {
        select: { tenant: { select: { name: true, email: true } }, isPrimary: true },
      },
    },
  });

  if (!lease) throw Object.assign(new Error('Signing link not found.'), { status: 404 });
  if (lease.tenantSignedAt) throw Object.assign(new Error('Lease has already been signed.'), { status: 409 });

  const now = new Date();
  const newEsigStatus = lease.managerSignedAt ? 'completed' : 'partially_signed';

  await prisma.lease.update({
    where: { id: lease.id },
    data: {
      tenantSignatureName: signatureName,
      tenantSignatureIp: ip,
      tenantSignedAt: now,
      esignatureStatus: newEsigStatus,
      status: newEsigStatus === 'completed' ? 'active' : lease.status,
    },
  });

  const display = `${lease.unit.property.name} — Unit ${lease.unit.unitNumber}`;
  const managerEmails = lease.unit.property.organization.users.map((u) => u.email);
  const primaryTenant = lease.participants.find((p) => p.isPrimary) ?? lease.participants[0];

  if (newEsigStatus === 'completed' && primaryTenant) {
    sendLeaseFullySigned({
      tenantEmail: primaryTenant.tenant.email,
      managerEmails,
      tenantName: primaryTenant.tenant.name,
      orgName: lease.unit.property.organization.name,
      unitDisplay: display,
    }).catch(() => {});
  } else if (primaryTenant) {
    sendLeaseSignedByTenant({
      managerEmails,
      tenantName: primaryTenant.tenant.name,
      unitDisplay: display,
      leaseDetailUrl: `${APP_URL}/leases/${lease.id}`,
    }).catch(() => {});
  }

  return { esignatureStatus: newEsigStatus };
}

export async function managerSignLease(
  orgId: string,
  leaseId: string,
  userId: string,
  signatureName: string,
  ip: string,
) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, unit: { property: { organizationId: orgId } } },
    select: {
      id: true,
      status: true,
      tenantSignedAt: true,
      managerSignedAt: true,
      esignatureStatus: true,
      unit: {
        select: {
          unitNumber: true,
          property: {
            select: {
              name: true,
              organization: {
                select: {
                  name: true,
                  users: {
                    where: { status: 'active', role: { in: ['owner', 'manager'] } },
                    select: { email: true },
                  },
                },
              },
            },
          },
        },
      },
      participants: {
        select: { tenant: { select: { name: true, email: true } }, isPrimary: true },
      },
    },
  });

  if (!lease) throw Object.assign(new Error('Lease not found.'), { status: 404 });
  if (lease.managerSignedAt) throw Object.assign(new Error('Lease has already been countersigned.'), { status: 409 });

  const now = new Date();
  const newEsigStatus = lease.tenantSignedAt ? 'completed' : 'partially_signed';

  await prisma.lease.update({
    where: { id: lease.id },
    data: {
      managerSignatureName: signatureName,
      managerSignatureIp: ip,
      managerSignedAt: now,
      esignatureStatus: newEsigStatus,
      status: newEsigStatus === 'completed' ? 'active' : lease.status,
    },
  });

  const display = `${lease.unit.property.name} — Unit ${lease.unit.unitNumber}`;
  const managerEmails = lease.unit.property.organization.users.map((u) => u.email);
  const primaryTenant = lease.participants.find((p) => p.isPrimary) ?? lease.participants[0];

  if (newEsigStatus === 'completed' && primaryTenant) {
    sendLeaseFullySigned({
      tenantEmail: primaryTenant.tenant.email,
      managerEmails,
      tenantName: primaryTenant.tenant.name,
      orgName: lease.unit.property.organization.name,
      unitDisplay: display,
    }).catch(() => {});
  }

  return { esignatureStatus: newEsigStatus };
}
