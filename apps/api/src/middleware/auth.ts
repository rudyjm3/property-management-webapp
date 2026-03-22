import { Request, Response, NextFunction } from 'express';

/**
 * Auth middleware — verifies Supabase JWT and attaches user context.
 * Will be implemented when Supabase Auth is configured.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // TODO: Phase 1 — Verify Supabase JWT from Authorization header
  // 1. Extract Bearer token
  // 2. Verify with Supabase
  // 3. Look up user + organization from DB
  // 4. Attach to req (via custom type extension)
  next();
}

/**
 * Org isolation middleware — ensures the requested resource belongs
 * to the authenticated user's organization.
 */
export function requireOrg(req: Request, res: Response, next: NextFunction): void {
  // TODO: Phase 1 — Verify orgId param matches authenticated user's org
  next();
}
