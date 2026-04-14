import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'PropFlow <no-reply@propflow.app>';

interface TenantInviteEmailParams {
  tenantName: string;
  tenantEmail: string;
  actionLink: string;
  organizationName: string;
}

export async function sendTenantPortalInviteEmail(params: TenantInviteEmailParams) {
  const { tenantName, tenantEmail, actionLink, organizationName } = params;

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">Set up your tenant portal access</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${tenantName || 'there'},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        You have been invited to access your tenant portal for <strong>${organizationName}</strong>.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
        Use the button below to set your password and complete access setup.
      </p>
      <a href="${actionLink}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">
        Set Password
      </a>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="word-break:break-all;font-size:12px;line-height:1.5;color:#374151;">${actionLink}</p>
    </div>
  </body>
</html>`;

  const result = await resend.emails.send({
    from: FROM,
    to: tenantEmail,
    subject: `${organizationName} invited you to the tenant portal`,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Failed to send invite email.');
  }

  return result.data;
}
