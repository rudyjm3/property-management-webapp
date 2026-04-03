import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { prisma } from '@propflow/db';

export interface AuthUser {
  userId: string;
  orgId: string;
  role: string;
  supabaseUserId: string;
}

export interface AuthTenant {
  tenantId: string;
  orgId: string;
  supabaseUserId: string;
}

// Extend Express Request to carry auth context
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenant?: AuthTenant;
    }
  }
}

/**
 * Lightweight auth middleware — only verifies the Supabase JWT.
 * Does NOT require a DB user record. Use for endpoints called before
 * the user has completed onboarding (e.g. /auth/register).
 */
export async function requireSupabaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' } });
    return;
  }

  const token = authHeader.slice(7);
  const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !supabaseUser) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' } });
    return;
  }

  // Attach only the Supabase identity — no DB lookup
  req.user = {
    userId: '',
    orgId: '',
    role: '',
    supabaseUserId: supabaseUser.id,
  };

  next();
}

/**
 * Auth middleware — verifies Supabase JWT and attaches user context.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' } });
    return;
  }

  const token = authHeader.slice(7);

  // Verify token with Supabase
  const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !supabaseUser) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' } });
    return;
  }

  // Look up our User record by supabaseUserId
  const dbUser = await prisma.user.findUnique({
    where: { supabaseUserId: supabaseUser.id },
    select: { id: true, organizationId: true, role: true, supabaseUserId: true },
  });

  if (!dbUser) {
    res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'User account not found. Complete onboarding first.' } });
    return;
  }

  req.user = {
    userId: dbUser.id,
    orgId: dbUser.organizationId,
    role: dbUser.role,
    supabaseUserId: dbUser.supabaseUserId!,
  };

  next();
}

/**
 * Tenant portal auth middleware — verifies Supabase JWT and attaches
 * the tenant context. Only works for tenants who have activated their portal
 * (i.e. have a supabaseUserId set on their Tenant record).
 */
export async function requireTenantAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' } });
    return;
  }

  const token = authHeader.slice(7);

  const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !supabaseUser) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' } });
    return;
  }

  const dbTenant = await prisma.tenant.findFirst({
    where: { supabaseUserId: supabaseUser.id, deletedAt: null },
    select: { id: true, organizationId: true, portalStatus: true, supabaseUserId: true },
  });

  if (!dbTenant) {
    res.status(401).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant account not found. Complete portal activation first.' } });
    return;
  }

  // Fire-and-forget: mark portal as active on first authenticated request
  if (dbTenant.portalStatus !== 'active') {
    prisma.tenant.update({
      where: { id: dbTenant.id },
      data: { portalStatus: 'active' },
    }).catch(() => { /* non-critical */ });
  }

  req.tenant = {
    tenantId: dbTenant.id,
    orgId: dbTenant.organizationId,
    supabaseUserId: dbTenant.supabaseUserId!,
  };

  next();
}

/**
 * Org isolation middleware — ensures the requested resource belongs
 * to the authenticated user's organization.
 */
export function requireOrg(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const requestedOrgId = req.params.orgId;
  if (requestedOrgId && requestedOrgId !== req.user.orgId) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this organization.' } });
    return;
  }

  next();
}
