import { prisma } from '@propflow/db';
import {
  sendRentReminder,
  sendRentOverdueToTenant,
  sendRentOverdueToManager,
  sendLeaseExpiryToManager,
  sendLeaseExpiryToTenant,
} from './email.service';

// ─── Config ───────────────────────────────────────────────────────────────────

// How many days before due date to send a rent reminder
const RENT_REMINDER_DAYS_BEFORE = 3;

// Thresholds at which to send lease expiry alerts (days before end date)
const LEASE_EXPIRY_THRESHOLDS = [60, 30, 14];

// ─── In-App Notification ──────────────────────────────────────────────────────

export async function createInAppNotification(params: {
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
}) {
  return prisma.notification.create({ data: params });
}

// ─── Rent Reminders ───────────────────────────────────────────────────────────

/**
 * Finds all active leases that have a rent payment due in exactly
 * RENT_REMINDER_DAYS_BEFORE days and emails each tenant on those leases.
 *
 * Intended to be called daily (e.g. from a cron job or scheduled endpoint).
 */
export async function runRentReminderJob(organizationId?: string) {
  const now = new Date();
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + RENT_REMINDER_DAYS_BEFORE);

  const startOfTarget = new Date(targetDate);
  startOfTarget.setHours(0, 0, 0, 0);
  const endOfTarget = new Date(targetDate);
  endOfTarget.setHours(23, 59, 59, 999);

  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      status: 'pending',
      type: 'rent',
      dueDate: { gte: startOfTarget, lte: endOfTarget },
      ...(organizationId ? { lease: { unit: { property: { organizationId } } } } : {}),
    },
    include: {
      tenant: { select: { id: true, name: true, email: true } },
      lease: {
        include: {
          unit: {
            include: {
              property: {
                include: {
                  organization: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const results = await Promise.allSettled(
    payments.map(async (payment: any) => {
      const org = payment.lease.unit.property.organization;
      const property = payment.lease.unit.property;
      const unit = payment.lease.unit;

      await sendRentReminder({
        tenantName: payment.tenant.name,
        tenantEmail: payment.tenant.email,
        unitNumber: unit.unitNumber,
        propertyName: property.name,
        rentAmount: payment.amount,
        dueDate: payment.dueDate,
        organizationName: org.name,
      });
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return { processed: payments.length, succeeded, failed };
}

// ─── Overdue Rent Notifications ───────────────────────────────────────────────

/**
 * Finds all overdue pending rent payments and:
 *  1. Emails the tenant
 *  2. Emails each manager/owner in the org who has notif_rent_overdue enabled
 *  3. Creates in-app notifications for those managers
 *
 * Intended to be called daily.
 */
export async function runOverdueRentJob(organizationId?: string) {
  const now = new Date();

  const overduePayments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      status: 'pending',
      type: 'rent',
      dueDate: { lt: now },
      ...(organizationId ? { lease: { unit: { property: { organizationId } } } } : {}),
    },
    include: {
      tenant: { select: { id: true, name: true, email: true } },
      lease: {
        include: {
          unit: {
            include: {
              property: {
                include: {
                  organization: {
                    include: {
                      users: {
                        where: {
                          status: 'active',
                          role: { in: ['owner', 'manager'] },
                          notifRentOverdue: { not: 'none' },
                        },
                        select: {
                          id: true,
                          name: true,
                          email: true,
                          notifRentOverdue: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const results = await Promise.allSettled(
    overduePayments.map(async (payment: any) => {
      const org = payment.lease.unit.property.organization;
      const property = payment.lease.unit.property;
      const unit = payment.lease.unit;
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(payment.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      const emailTasks: Promise<unknown>[] = [];

      // Email tenant (always if overdue)
      emailTasks.push(
        sendRentOverdueToTenant({
          tenantName: payment.tenant.name,
          tenantEmail: payment.tenant.email,
          unitNumber: unit.unitNumber,
          propertyName: property.name,
          rentAmount: payment.amount,
          dueDate: payment.dueDate,
          daysOverdue,
          lateFeeAmount: payment.lease.lateFeeAmount ?? undefined,
          organizationName: org.name,
        })
      );

      // Notify managers who have email or both
      for (const user of org.users) {
        const pref = user.notifRentOverdue ?? 'email';

        if (pref === 'email' || pref === 'both') {
          emailTasks.push(
            sendRentOverdueToManager({
              managerName: user.name,
              managerEmail: user.email,
              tenantName: payment.tenant.name,
              unitNumber: unit.unitNumber,
              propertyName: property.name,
              rentAmount: payment.amount,
              dueDate: payment.dueDate,
              daysOverdue,
              organizationName: org.name,
            })
          );
        }

        if (pref === 'in_app' || pref === 'both') {
          emailTasks.push(
            createInAppNotification({
              userId: user.id,
              organizationId: org.id,
              type: 'rent_overdue',
              title: `Overdue rent — ${payment.tenant.name}`,
              body: `${property.name} Unit ${unit.unitNumber} rent is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue (${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(payment.amount))}).`,
              actionUrl: `/leases`,
            })
          );
        }
      }

      const taskResults = await Promise.allSettled(emailTasks);
      const taskFailures = taskResults.filter((r) => r.status === 'rejected');
      if (taskFailures.length > 0) {
        throw new Error(`${taskFailures.length} of ${emailTasks.length} notification tasks failed for payment ${payment.id}`);
      }
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return { processed: overduePayments.length, succeeded, failed };
}

// ─── Lease Expiry Alerts ──────────────────────────────────────────────────────

/**
 * Finds all active leases expiring in exactly one of the LEASE_EXPIRY_THRESHOLDS
 * number of days and sends alerts to managers and tenants.
 *
 * Intended to be called daily.
 */
export async function runLeaseExpiryJob(organizationId?: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Collect leases that hit one of the thresholds today
  const thresholdLeases = await Promise.all(
    LEASE_EXPIRY_THRESHOLDS.map(async (days) => {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);
      const endOfTarget = new Date(targetDate);
      endOfTarget.setHours(23, 59, 59, 999);

      const leases = await prisma.lease.findMany({
        where: {
          deletedAt: null,
          status: { in: ['active', 'month_to_month'] },
          endDate: { gte: targetDate, lte: endOfTarget },
          ...(organizationId ? { unit: { property: { organizationId } } } : {}),
        },
        include: {
          participants: {
            where: { isPrimary: true },
            include: {
              tenant: { select: { id: true, name: true, email: true } },
            },
          },
          unit: {
            include: {
              property: {
                include: {
                  organization: {
                    include: {
                      users: {
                        where: {
                          status: 'active',
                          role: { in: ['owner', 'manager'] },
                          notifLeaseExpiry: { not: 'none' },
                        },
                        select: {
                          id: true,
                          name: true,
                          email: true,
                          notifLeaseExpiry: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      return { days, leases };
    })
  );

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  for (const { days, leases } of thresholdLeases) {
    const results = await Promise.allSettled(
      leases.map(async (lease: any) => {
        const org = lease.unit.property.organization;
        const property = lease.unit.property;
        const unit = lease.unit;
        const primaryParticipant = lease.participants[0];
        const tenant = primaryParticipant?.tenant;

        const emailTasks: Promise<unknown>[] = [];

        // Notify managers
        for (const user of org.users) {
          const pref = user.notifLeaseExpiry ?? 'email';

          if (pref === 'email' || pref === 'both') {
            emailTasks.push(
              sendLeaseExpiryToManager({
                managerName: user.name,
                managerEmail: user.email,
                tenantName: tenant?.name ?? 'Unknown Tenant',
                unitNumber: unit.unitNumber,
                propertyName: property.name,
                leaseEndDate: lease.endDate,
                daysUntilExpiry: days,
                organizationName: org.name,
                leaseId: lease.id,
              })
            );
          }

          if (pref === 'in_app' || pref === 'both') {
            emailTasks.push(
              createInAppNotification({
                userId: user.id,
                organizationId: org.id,
                type: 'lease_expiry',
                title: `Lease expires in ${days} days — ${tenant?.name ?? 'Unknown'}`,
                body: `${property.name} Unit ${unit.unitNumber} lease ends on ${new Date(lease.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
                actionUrl: `/leases/${lease.id}`,
              })
            );
          }
        }

        // Notify tenant (at 30 and 14 day thresholds)
        if (tenant && [30, 14].includes(days)) {
          emailTasks.push(
            sendLeaseExpiryToTenant({
              tenantName: tenant.name,
              tenantEmail: tenant.email,
              unitNumber: unit.unitNumber,
              propertyName: property.name,
              leaseEndDate: lease.endDate,
              daysUntilExpiry: days,
              organizationName: org.name,
            })
          );
        }

        const taskResults = await Promise.allSettled(emailTasks);
        const taskFailures = taskResults.filter((r) => r.status === 'rejected');
        if (taskFailures.length > 0) {
          throw new Error(`${taskFailures.length} of ${emailTasks.length} notification tasks failed for lease ${lease.id}`);
        }
      })
    );

    totalProcessed += leases.length;
    totalSucceeded += results.filter((r) => r.status === 'fulfilled').length;
    totalFailed += results.filter((r) => r.status === 'rejected').length;
  }

  return { processed: totalProcessed, succeeded: totalSucceeded, failed: totalFailed };
}

// ─── In-App Notification Queries ──────────────────────────────────────────────

export async function listNotifications(userId: string, organizationId: string, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      userId,
      organizationId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  // Only allow marking your own notifications
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) return null;

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string, organizationId: string) {
  return prisma.notification.updateMany({
    where: { userId, organizationId, readAt: null },
    data: { readAt: new Date() },
  });
}
