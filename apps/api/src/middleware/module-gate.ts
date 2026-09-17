import { Request, Response, NextFunction } from 'express';
import { prisma } from '@propflow/db';
import type { ModuleKey } from '@propflow/shared';

/**
 * Module-gate middleware — blocks access to a route unless the requesting
 * org has `moduleKey` in `Organization.activeModules`. Must run after
 * requireAuth/requireOrg (manager routes) or requireOwnerAuth (owner-portal
 * routes) so req.user/req.owner is already populated.
 */
export function requireModule(moduleKey: ModuleKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const orgId = req.user?.orgId || req.owner?.orgId || req.tenant?.orgId;
    if (!orgId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
      return;
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { activeModules: true },
    });

    if (!org || !org.activeModules.includes(moduleKey)) {
      res.status(403).json({
        error: {
          code: 'MODULE_NOT_ACTIVE',
          message: `The "${moduleKey}" module is not active for this organization.`,
        },
      });
      return;
    }

    next();
  };
}
