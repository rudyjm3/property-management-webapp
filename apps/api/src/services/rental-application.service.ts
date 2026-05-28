import { prisma, Prisma } from '@propflow/db';
import { randomUUID } from 'crypto';
import {
  sendApplicationReceivedNotification,
  sendApplicationConfirmation,
  sendApplicationApproved,
  sendApplicationDenied,
} from './application-email.service';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

function unitDisplay(unit: { unitNumber: string; property: { name: string } }) {
  return `${unit.property.name} — Unit ${unit.unitNumber}`;
}

export async function createApplicationLink(orgId: string, unitId: string) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, property: { organizationId: orgId } },
    select: { id: true, unitNumber: true, property: { select: { organizationId: true } } },
  });
  if (!unit) throw Object.assign(new Error('Unit not found.'), { status: 404 });

  const token = randomUUID();
  const application = await prisma.rentalApplication.create({
    data: {
      organizationId: orgId,
      unitId,
      token,
      applicantName: '',
      applicantEmail: '',
    },
    select: { id: true, token: true },
  });

  return {
    id: application.id,
    token: application.token,
    url: `${APP_URL}/apply/${application.token}`,
  };
}

export async function getApplicationContext(token: string) {
  const app = await prisma.rentalApplication.findFirst({
    where: { token, status: { not: 'withdrawn' } },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      unit: {
        select: {
          id: true,
          unitNumber: true,
          bedrooms: true,
          bathrooms: true,
          rentAmount: true,
          depositAmount: true,
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
    },
  });

  if (!app) throw Object.assign(new Error('Application link not found.'), { status: 404 });

  return {
    id: app.id,
    status: app.status,
    alreadySubmitted: !!app.submittedAt,
    unit: {
      unitNumber: app.unit.unitNumber,
      bedrooms: app.unit.bedrooms,
      bathrooms: app.unit.bathrooms,
      rentAmount: Number(app.unit.rentAmount),
      depositAmount: Number(app.unit.depositAmount),
      propertyName: app.unit.property.name,
      address: app.unit.property.address,
      city: app.unit.property.city,
      state: app.unit.property.state,
    },
    organizationName: app.unit.property.organization.name,
  };
}

export async function submitApplication(
  token: string,
  data: {
    applicantName: string;
    applicantEmail: string;
    applicantPhone?: string | null;
    dateOfBirth?: string | null;
    currentAddress?: string | null;
    previousAddress?: string | null;
    employerName?: string | null;
    employerPhone?: string | null;
    monthlyGrossIncome?: number | null;
    incomeSource?: string | null;
    occupantCount: number;
    pets?: unknown;
    vehicles?: unknown;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    consentGiven: true;
  },
  ip: string,
) {
  const app = await prisma.rentalApplication.findFirst({
    where: { token },
    select: {
      id: true,
      organizationId: true,
      submittedAt: true,
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
    },
  });

  if (!app) throw Object.assign(new Error('Application link not found.'), { status: 404 });
  if (app.submittedAt) throw Object.assign(new Error('This application has already been submitted.'), { status: 409 });

  const updated = await prisma.rentalApplication.update({
    where: { id: app.id },
    data: {
      applicantName: data.applicantName,
      applicantEmail: data.applicantEmail,
      applicantPhone: data.applicantPhone ?? null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      currentAddress: data.currentAddress ?? null,
      previousAddress: data.previousAddress ?? null,
      employerName: data.employerName ?? null,
      employerPhone: data.employerPhone ?? null,
      monthlyGrossIncome: data.monthlyGrossIncome ?? null,
      incomeSource: (data.incomeSource as any) ?? null,
      occupantCount: data.occupantCount,
      pets: (data.pets ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      vehicles: (data.vehicles ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      emergencyContactName: data.emergencyContactName ?? null,
      emergencyContactPhone: data.emergencyContactPhone ?? null,
      consentGiven: true,
      consentIp: ip,
      consentAt: new Date(),
      submittedAt: new Date(),
      status: 'pending',
    },
    select: { id: true },
  });

  const display = unitDisplay(app.unit);
  const managerEmails = app.unit.property.organization.users.map((u) => u.email);

  // Fire-and-forget email notifications
  sendApplicationReceivedNotification({
    managerEmails,
    applicantName: data.applicantName,
    unitDisplay: display,
    applicationUrl: `${APP_URL}/applications/${app.id}`,
  }).catch(() => {});

  sendApplicationConfirmation({
    applicantEmail: data.applicantEmail,
    applicantName: data.applicantName,
    orgName: app.unit.property.organization.name,
    unitDisplay: display,
  }).catch(() => {});

  return { id: updated.id };
}

export async function listApplications(
  orgId: string,
  filters: { status?: string; search?: string; cursor?: string; limit: number },
) {
  const where: any = { organizationId: orgId };
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { applicantName: { contains: filters.search, mode: 'insensitive' } },
      { applicantEmail: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.cursor) where.createdAt = { lt: new Date(filters.cursor) };

  const items = await prisma.rentalApplication.findMany({
    where,
    take: filters.limit + 1,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      applicantName: true,
      applicantEmail: true,
      applicantPhone: true,
      submittedAt: true,
      createdAt: true,
      unit: {
        select: {
          unitNumber: true,
          property: { select: { name: true } },
        },
      },
    },
  });

  const hasMore = items.length > filters.limit;
  const data = hasMore ? items.slice(0, filters.limit) : items;
  return {
    data,
    nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
  };
}

export async function getApplication(orgId: string, id: string) {
  const app = await prisma.rentalApplication.findFirst({
    where: { id, organizationId: orgId },
    include: {
      unit: {
        include: {
          property: { select: { name: true, address: true, city: true, state: true } },
        },
      },
    },
  });
  if (!app) throw Object.assign(new Error('Application not found.'), { status: 404 });
  return app;
}

export async function reviewApplication(
  orgId: string,
  id: string,
  userId: string,
  data: {
    status: 'approved' | 'denied';
    reviewNotes?: string | null;
    leaseStartDate?: string;
    leaseEndDate?: string;
    rentAmount?: number;
    depositAmount?: number;
  },
) {
  const app = await prisma.rentalApplication.findFirst({
    where: { id, organizationId: orgId },
    include: {
      unit: {
        include: {
          property: {
            include: {
              organization: {
                include: {
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
    },
  });

  if (!app) throw Object.assign(new Error('Application not found.'), { status: 404 });
  if (app.status === 'approved' || app.status === 'denied') {
    throw Object.assign(new Error('Application has already been reviewed.'), { status: 409 });
  }
  if (!app.submittedAt) {
    throw Object.assign(new Error('Application has not been submitted yet.'), { status: 409 });
  }

  const display = unitDisplay(app.unit);
  const managerEmails = app.unit.property.organization.users.map((u) => u.email);

  if (data.status === 'approved') {
    if (!data.leaseStartDate || !data.leaseEndDate || !data.rentAmount) {
      throw Object.assign(
        new Error('leaseStartDate, leaseEndDate, and rentAmount are required when approving.'),
        { status: 400 },
      );
    }

    // Create tenant record from application data
    const tenant = await prisma.tenant.create({
      data: {
        organizationId: orgId,
        email: app.applicantEmail,
        name: app.applicantName,
        phone: app.applicantPhone ?? null,
        dateOfBirth: app.dateOfBirth ?? null,
        currentAddress: app.currentAddress ?? null,
        previousAddress: app.previousAddress ?? null,
        employerName: app.employerName ?? null,
        employerPhone: app.employerPhone ?? null,
        monthlyGrossIncome: app.monthlyGrossIncome ?? null,
        incomeSource: app.incomeSource ?? null,
        emergencyContactName: app.emergencyContactName ?? null,
        emergencyContactPhone: app.emergencyContactPhone ?? null,
        vehicles: app.vehicles as Prisma.InputJsonValue ?? Prisma.JsonNull,
        pets: app.pets as Prisma.InputJsonValue ?? Prisma.JsonNull,
        screeningConsentAt: app.consentAt ?? null,
      },
    });

    // Create lease in draft status with a signing token
    const signingToken = randomUUID();
    const lease = await prisma.lease.create({
      data: {
        unitId: app.unitId,
        status: 'draft',
        rentAmount: data.rentAmount,
        depositAmount: data.depositAmount ?? Number(app.unit.depositAmount),
        startDate: new Date(data.leaseStartDate),
        endDate: new Date(data.leaseEndDate),
        signingToken,
        participants: {
          create: { tenantId: tenant.id, isPrimary: true },
        },
      },
    });

    await prisma.rentalApplication.update({
      where: { id },
      data: {
        status: 'approved',
        reviewNotes: data.reviewNotes ?? null,
        reviewedAt: new Date(),
        reviewedByUserId: userId,
        createdTenantId: tenant.id,
      },
    });

    const signingUrl = `${APP_URL}/sign/${signingToken}`;
    sendApplicationApproved({
      applicantEmail: app.applicantEmail,
      applicantName: app.applicantName,
      orgName: app.unit.property.organization.name,
      unitDisplay: display,
      signingUrl,
    }).catch(() => {});

    return { status: 'approved', tenantId: tenant.id, leaseId: lease.id, signingUrl };
  } else {
    await prisma.rentalApplication.update({
      where: { id },
      data: {
        status: 'denied',
        reviewNotes: data.reviewNotes ?? null,
        reviewedAt: new Date(),
        reviewedByUserId: userId,
      },
    });

    sendApplicationDenied({
      applicantEmail: app.applicantEmail,
      applicantName: app.applicantName,
      orgName: app.unit.property.organization.name,
      unitDisplay: display,
      reviewNotes: data.reviewNotes,
    }).catch(() => {});

    return { status: 'denied' };
  }
}

export async function getPendingApplicationCount(orgId: string): Promise<number> {
  return prisma.rentalApplication.count({
    where: { organizationId: orgId, status: 'pending' },
  });
}
