import { Router, Request, Response } from 'express';
import { prisma } from '@propflow/db';
import { supabaseAdmin } from '../lib/supabase';
import { inviteRateLimit } from '../middleware/rate-limit';

const router = Router();

// POST /api/v1/invite/validate
// Public — rate limited. Validates an 8-char invite code.
// Returns tenant display info so the mobile app can show a confirmation screen.
router.post('/validate', inviteRateLimit, async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    res.status(400).json({ error: { code: 'MISSING_CODE', message: 'code is required.' } });
    return;
  }

  const upper = code.trim().toUpperCase();
  const tenant = await prisma.tenant.findFirst({
    where: {
      inviteCode: upper,
      inviteCodeExpiresAt: { gt: new Date() },
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      organization: { select: { name: true } },
    },
  });

  if (!tenant) {
    res.status(404).json({ error: { code: 'INVALID_CODE', message: 'Invite code not found or expired.' } });
    return;
  }

  res.json({
    data: {
      tenantId: tenant.id,
      email: tenant.email,
      name: tenant.name,
      organizationName: tenant.organization.name,
    },
  });
});

// POST /api/v1/invite/request-otp
// Public — rate limited. Exchanges a valid invite code for a Supabase magic-link token
// so the mobile app can call supabase.auth.verifyOtp() and establish a live session,
// then immediately call supabase.auth.updateUser({ password }) to set the account password.
router.post('/request-otp', inviteRateLimit, async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    res.status(400).json({ error: { code: 'MISSING_CODE', message: 'code is required.' } });
    return;
  }

  const upper = code.trim().toUpperCase();
  const tenant = await prisma.tenant.findFirst({
    where: {
      inviteCode: upper,
      inviteCodeExpiresAt: { gt: new Date() },
      deletedAt: null,
    },
    select: { id: true, email: true, supabaseUserId: true },
  });

  if (!tenant || !tenant.supabaseUserId) {
    res.status(404).json({ error: { code: 'INVALID_CODE', message: 'Invalid or expired invite code.' } });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: tenant.email,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error('[invite/request-otp] generateLink failed:', error);
    res.status(500).json({ error: { code: 'OTP_FAILED', message: 'Could not generate login token. Please contact support.' } });
    return;
  }

  res.json({ data: { token: data.properties.hashed_token, email: tenant.email } });
});

export default router;
