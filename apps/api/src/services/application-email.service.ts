import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'PropFlow <no-reply@propflow.app>';

export async function sendApplicationReceivedNotification(params: {
  managerEmails: string[];
  applicantName: string;
  unitDisplay: string;
  applicationUrl: string;
}) {
  const { managerEmails, applicantName, unitDisplay, applicationUrl } = params;
  if (!managerEmails.length) return;

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">New rental application received</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;"><strong>${applicantName}</strong> submitted an application for <strong>${unitDisplay}</strong>.</p>
      <a href="${applicationUrl}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Review Application</a>
    </div>
  </body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to: managerEmails,
    subject: `New application from ${applicantName} — ${unitDisplay}`,
    html,
  });
}

export async function sendApplicationConfirmation(params: {
  applicantEmail: string;
  applicantName: string;
  orgName: string;
  unitDisplay: string;
}) {
  const { applicantEmail, applicantName, orgName, unitDisplay } = params;

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">Application received</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${applicantName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Thank you for applying for <strong>${unitDisplay}</strong> with <strong>${orgName}</strong>. We've received your application and will be in touch once it's been reviewed.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Please don't reply to this email. Contact your property manager directly with any questions.</p>
    </div>
  </body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to: applicantEmail,
    subject: `Application received — ${unitDisplay}`,
    html,
  });
}

export async function sendApplicationApproved(params: {
  applicantEmail: string;
  applicantName: string;
  orgName: string;
  unitDisplay: string;
  signingUrl: string;
}) {
  const { applicantEmail, applicantName, orgName, unitDisplay, signingUrl } = params;

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#16a34a;">Application approved!</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${applicantName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Great news! Your application for <strong>${unitDisplay}</strong> with <strong>${orgName}</strong> has been approved. Please review and sign your lease agreement using the button below.
      </p>
      <a href="${signingUrl}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Sign Lease Agreement</a>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
        If the button doesn't work, copy this link: <span style="word-break:break-all;">${signingUrl}</span>
      </p>
    </div>
  </body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to: applicantEmail,
    subject: `Your application was approved — sign your lease`,
    html,
  });
}

export async function sendApplicationDenied(params: {
  applicantEmail: string;
  applicantName: string;
  orgName: string;
  unitDisplay: string;
  reviewNotes?: string | null;
}) {
  const { applicantEmail, applicantName, orgName, unitDisplay, reviewNotes } = params;

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">Application update</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${applicantName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Thank you for your interest in <strong>${unitDisplay}</strong>. After review, <strong>${orgName}</strong> has decided not to move forward with your application at this time.
      </p>
      ${reviewNotes ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;padding:12px;background:#f9fafb;border-radius:6px;"><em>${reviewNotes}</em></p>` : ''}
      <p style="margin:0;font-size:13px;color:#6b7280;">We wish you the best in your housing search.</p>
    </div>
  </body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to: applicantEmail,
    subject: `Application update — ${unitDisplay}`,
    html,
  });
}

export async function sendLeaseSignedByTenant(params: {
  managerEmails: string[];
  tenantName: string;
  unitDisplay: string;
  leaseDetailUrl: string;
}) {
  const { managerEmails, tenantName, unitDisplay, leaseDetailUrl } = params;
  if (!managerEmails.length) return;

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">Lease signed by tenant</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;"><strong>${tenantName}</strong> has signed the lease for <strong>${unitDisplay}</strong>. Please countersign to complete the agreement.</p>
      <a href="${leaseDetailUrl}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Countersign Lease</a>
    </div>
  </body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to: managerEmails,
    subject: `Lease signed by ${tenantName} — countersignature needed`,
    html,
  });
}

export async function sendLeaseFullySigned(params: {
  tenantEmail: string;
  managerEmails: string[];
  tenantName: string;
  orgName: string;
  unitDisplay: string;
}) {
  const { tenantEmail, managerEmails, tenantName, orgName, unitDisplay } = params;

  const tenantHtml = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#16a34a;">Lease fully executed</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${tenantName},</p>
      <p style="margin:0 0 0;font-size:15px;line-height:1.6;">Your lease for <strong>${unitDisplay}</strong> with <strong>${orgName}</strong> has been signed by all parties. Welcome home!</p>
    </div>
  </body>
</html>`;

  await Promise.all([
    resend.emails.send({ from: FROM, to: tenantEmail, subject: `Lease fully executed — ${unitDisplay}`, html: tenantHtml }),
    managerEmails.length
      ? resend.emails.send({ from: FROM, to: managerEmails, subject: `Lease countersigned — ${unitDisplay}`, html: tenantHtml })
      : Promise.resolve(),
  ]);
}
