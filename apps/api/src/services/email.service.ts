import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'PropFlow <no-reply@propflow.app>';
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; }
    .wrapper { max-width: 580px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1e3a5f; padding: 28px 32px; }
    .header-logo { font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
    .header-logo span { color: #60a5fa; }
    .body { padding: 32px; }
    .body h1 { margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1a1a2e; }
    .body p { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4a5568; }
    .info-box { background: #f0f4ff; border-left: 4px solid #3b82f6; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .info-box .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .info-box .row:last-child { margin-bottom: 0; }
    .info-box .label { color: #6b7280; }
    .info-box .value { font-weight: 600; color: #1a1a2e; }
    .alert-box { background: #fff5f5; border-left: 4px solid #ef4444; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .alert-box p { margin: 0; font-size: 14px; color: #7f1d1d; }
    .warning-box { background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .warning-box p { margin: 0; font-size: 14px; color: #78350f; }
    .btn { display: inline-block; background: #1e3a5f; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 8px; }
    .footer { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-logo">Prop<span>Flow</span></div>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      This is an automated message from PropFlow.<br />
      If you have questions, contact your property manager directly.
    </div>
  </div>
</body>
</html>`;
}

// ─── Rent Reminder (to tenant) ────────────────────────────────────────────────

export interface RentReminderParams {
  tenantName: string;
  tenantEmail: string;
  unitNumber: string;
  propertyName: string;
  rentAmount: number | string;
  dueDate: Date | string;
  organizationName: string;
}

export async function sendRentReminder(params: RentReminderParams) {
  const {
    tenantName,
    tenantEmail,
    unitNumber,
    propertyName,
    rentAmount,
    dueDate,
    organizationName,
  } = params;

  const body = `
    <h1>Rent Reminder</h1>
    <p>Hi ${tenantName},</p>
    <p>This is a friendly reminder that your rent is due soon.</p>
    <div class="info-box">
      <div class="row"><span class="label">Property</span><span class="value">${propertyName}</span></div>
      <div class="row"><span class="label">Unit</span><span class="value">${unitNumber}</span></div>
      <div class="row"><span class="label">Amount Due</span><span class="value">${formatCurrency(rentAmount)}</span></div>
      <div class="row"><span class="label">Due Date</span><span class="value">${formatDate(dueDate)}</span></div>
    </div>
    <p>Please ensure your payment is submitted on time to avoid any late fees.</p>
    <p style="margin-top:24px;font-size:13px;color:#9ca3af;">Managed by ${organizationName}</p>
  `;

  return resend.emails.send({
    from: FROM,
    to: tenantEmail,
    subject: `Rent Reminder — ${formatCurrency(rentAmount)} due ${formatDate(dueDate)}`,
    html: baseLayout('Rent Reminder', body),
  });
}

// ─── Rent Overdue (to tenant) ─────────────────────────────────────────────────

export interface RentOverdueParams {
  tenantName: string;
  tenantEmail: string;
  unitNumber: string;
  propertyName: string;
  rentAmount: number | string;
  dueDate: Date | string;
  daysOverdue: number;
  lateFeeAmount?: number | string;
  organizationName: string;
}

export async function sendRentOverdueToTenant(params: RentOverdueParams) {
  const {
    tenantName,
    tenantEmail,
    unitNumber,
    propertyName,
    rentAmount,
    dueDate,
    daysOverdue,
    lateFeeAmount,
    organizationName,
  } = params;

  const body = `
    <h1>Rent Payment Overdue</h1>
    <p>Hi ${tenantName},</p>
    <p>Your rent payment is <strong>${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</strong>. Please submit payment as soon as possible.</p>
    <div class="info-box">
      <div class="row"><span class="label">Property</span><span class="value">${propertyName}</span></div>
      <div class="row"><span class="label">Unit</span><span class="value">${unitNumber}</span></div>
      <div class="row"><span class="label">Rent Amount</span><span class="value">${formatCurrency(rentAmount)}</span></div>
      <div class="row"><span class="label">Original Due Date</span><span class="value">${formatDate(dueDate)}</span></div>
      <div class="row"><span class="label">Days Overdue</span><span class="value">${daysOverdue}</span></div>
    </div>
    ${lateFeeAmount ? `<div class="alert-box"><p>A late fee of <strong>${formatCurrency(lateFeeAmount)}</strong> may be applied to your account.</p></div>` : ''}
    <p>Please contact your property manager if you have any questions or need to make a payment arrangement.</p>
    <p style="margin-top:24px;font-size:13px;color:#9ca3af;">Managed by ${organizationName}</p>
  `;

  return resend.emails.send({
    from: FROM,
    to: tenantEmail,
    subject: `Action Required: Rent overdue by ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}`,
    html: baseLayout('Rent Payment Overdue', body),
  });
}

// ─── Rent Overdue Alert (to manager) ─────────────────────────────────────────

export interface RentOverdueManagerParams {
  managerName: string;
  managerEmail: string;
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  rentAmount: number | string;
  dueDate: Date | string;
  daysOverdue: number;
  organizationName: string;
}

export async function sendRentOverdueToManager(params: RentOverdueManagerParams) {
  const {
    managerName,
    managerEmail,
    tenantName,
    unitNumber,
    propertyName,
    rentAmount,
    dueDate,
    daysOverdue,
    organizationName,
  } = params;

  const body = `
    <h1>Overdue Rent Alert</h1>
    <p>Hi ${managerName},</p>
    <p>A tenant has a rent payment that is <strong>${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</strong>.</p>
    <div class="info-box">
      <div class="row"><span class="label">Tenant</span><span class="value">${tenantName}</span></div>
      <div class="row"><span class="label">Property</span><span class="value">${propertyName}</span></div>
      <div class="row"><span class="label">Unit</span><span class="value">${unitNumber}</span></div>
      <div class="row"><span class="label">Amount Owed</span><span class="value">${formatCurrency(rentAmount)}</span></div>
      <div class="row"><span class="label">Original Due Date</span><span class="value">${formatDate(dueDate)}</span></div>
      <div class="row"><span class="label">Days Overdue</span><span class="value">${daysOverdue}</span></div>
    </div>
    <a class="btn" href="${APP_URL}/leases">View in PropFlow</a>
    <p style="margin-top:24px;font-size:13px;color:#9ca3af;">${organizationName}</p>
  `;

  return resend.emails.send({
    from: FROM,
    to: managerEmail,
    subject: `[${organizationName}] Overdue rent — ${tenantName}, ${propertyName} Unit ${unitNumber}`,
    html: baseLayout('Overdue Rent Alert', body),
  });
}

// ─── Lease Expiry Alert (to manager) ─────────────────────────────────────────

export interface LeaseExpiryManagerParams {
  managerName: string;
  managerEmail: string;
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  leaseEndDate: Date | string;
  daysUntilExpiry: number;
  organizationName: string;
  leaseId: string;
}

export async function sendLeaseExpiryToManager(params: LeaseExpiryManagerParams) {
  const {
    managerName,
    managerEmail,
    tenantName,
    unitNumber,
    propertyName,
    leaseEndDate,
    daysUntilExpiry,
    organizationName,
    leaseId,
  } = params;

  const urgency = daysUntilExpiry <= 14 ? 'alert' : 'warning';

  const body = `
    <h1>Lease Expiry Alert</h1>
    <p>Hi ${managerName},</p>
    <p>A lease is expiring in <strong>${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}</strong>. Please review and take action.</p>
    <div class="info-box">
      <div class="row"><span class="label">Tenant</span><span class="value">${tenantName}</span></div>
      <div class="row"><span class="label">Property</span><span class="value">${propertyName}</span></div>
      <div class="row"><span class="label">Unit</span><span class="value">${unitNumber}</span></div>
      <div class="row"><span class="label">Lease End Date</span><span class="value">${formatDate(leaseEndDate)}</span></div>
      <div class="row"><span class="label">Days Remaining</span><span class="value">${daysUntilExpiry}</span></div>
    </div>
    ${urgency === 'alert'
      ? `<div class="alert-box"><p><strong>Urgent:</strong> This lease expires in less than 2 weeks. Initiate a renewal or vacate process immediately.</p></div>`
      : `<div class="warning-box"><p>Consider sending the tenant a renewal offer or move-out notice soon.</p></div>`
    }
    <a class="btn" href="${APP_URL}/leases/${leaseId}">View Lease</a>
    <p style="margin-top:24px;font-size:13px;color:#9ca3af;">${organizationName}</p>
  `;

  return resend.emails.send({
    from: FROM,
    to: managerEmail,
    subject: `[${organizationName}] Lease expires in ${daysUntilExpiry} days — ${tenantName}, Unit ${unitNumber}`,
    html: baseLayout('Lease Expiry Alert', body),
  });
}

// ─── Lease Expiry Notice (to tenant) ──────────────────────────────────────────

export interface LeaseExpiryTenantParams {
  tenantName: string;
  tenantEmail: string;
  unitNumber: string;
  propertyName: string;
  leaseEndDate: Date | string;
  daysUntilExpiry: number;
  organizationName: string;
}

// ─── Late Fee Applied (to tenant) ─────────────────────────────────────────────

export interface LateFeeParams {
  tenantName: string;
  tenantEmail: string;
  unitNumber: string;
  propertyName: string;
  originalDueDate: Date | string;
  lateFeeAmount: number | string;
  totalOwed: number | string;
  organizationName: string;
}

export async function sendLateFeeToTenant(params: LateFeeParams) {
  const {
    tenantName,
    tenantEmail,
    unitNumber,
    propertyName,
    originalDueDate,
    lateFeeAmount,
    totalOwed,
    organizationName,
  } = params;

  const body = `
    <h1>Late Fee Applied</h1>
    <p>Hi ${tenantName},</p>
    <p>A late fee has been applied to your account because your rent payment was not received by the due date.</p>
    <div class="info-box">
      <div class="row"><span class="label">Property</span><span class="value">${propertyName}</span></div>
      <div class="row"><span class="label">Unit</span><span class="value">${unitNumber}</span></div>
      <div class="row"><span class="label">Original Due Date</span><span class="value">${formatDate(originalDueDate)}</span></div>
      <div class="row"><span class="label">Late Fee</span><span class="value">${formatCurrency(lateFeeAmount)}</span></div>
      <div class="row"><span class="label">Total Now Owed</span><span class="value">${formatCurrency(totalOwed)}</span></div>
    </div>
    <div class="alert-box"><p>Please submit your full payment including the late fee as soon as possible to avoid additional charges.</p></div>
    <p>Contact your property manager if you have questions or would like to discuss a payment arrangement.</p>
    <p style="margin-top:24px;font-size:13px;color:#9ca3af;">Managed by ${organizationName}</p>
  `;

  return resend.emails.send({
    from: FROM,
    to: tenantEmail,
    subject: `Late fee applied — ${propertyName} Unit ${unitNumber}`,
    html: baseLayout('Late Fee Applied', body),
  });
}

// ─── Lease Expiry Notice (to tenant) ──────────────────────────────────────────

export async function sendLeaseExpiryToTenant(params: LeaseExpiryTenantParams) {
  const {
    tenantName,
    tenantEmail,
    unitNumber,
    propertyName,
    leaseEndDate,
    daysUntilExpiry,
    organizationName,
  } = params;

  const body = `
    <h1>Your Lease is Expiring Soon</h1>
    <p>Hi ${tenantName},</p>
    <p>This is a notice that your lease is expiring in <strong>${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}</strong>.</p>
    <div class="info-box">
      <div class="row"><span class="label">Property</span><span class="value">${propertyName}</span></div>
      <div class="row"><span class="label">Unit</span><span class="value">${unitNumber}</span></div>
      <div class="row"><span class="label">Lease End Date</span><span class="value">${formatDate(leaseEndDate)}</span></div>
      <div class="row"><span class="label">Days Remaining</span><span class="value">${daysUntilExpiry}</span></div>
    </div>
    <p>Please contact your property manager to discuss lease renewal options or to arrange for move-out.</p>
    <p style="margin-top:24px;font-size:13px;color:#9ca3af;">Managed by ${organizationName}</p>
  `;

  return resend.emails.send({
    from: FROM,
    to: tenantEmail,
    subject: `Your lease expires in ${daysUntilExpiry} days — ${propertyName} Unit ${unitNumber}`,
    html: baseLayout('Lease Expiring Soon', body),
  });
}
