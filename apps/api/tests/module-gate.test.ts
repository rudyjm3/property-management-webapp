/**
 * Unit tests for the module-gating middleware — blocks org-scoped routes
 * unless the requesting org has the given module key in activeModules.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('@propflow/db', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@propflow/db';
import { requireModule } from '../src/middleware/module-gate';

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireModule middleware', () => {
  const next = vi.fn() as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when the org has the module active', async () => {
    (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      activeModules: ['owner_portal', 'reporting_analytics'],
    });

    const req = { user: { orgId: 'org-1', userId: 'u1', role: 'manager' } } as unknown as Request;
    const res = buildRes();

    await requireModule('owner_portal')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 MODULE_NOT_ACTIVE when the module is not in activeModules', async () => {
    (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      activeModules: [],
    });

    const req = { user: { orgId: 'org-1', userId: 'u1', role: 'manager' } } as unknown as Request;
    const res = buildRes();

    await requireModule('reporting_analytics')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'MODULE_NOT_ACTIVE' }) })
    );
  });

  it('returns 403 when the organization cannot be found', async () => {
    (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = { user: { orgId: 'org-missing', userId: 'u1', role: 'manager' } } as unknown as Request;
    const res = buildRes();

    await requireModule('owner_portal')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('resolves orgId from req.owner when there is no req.user (owner-portal routes)', async () => {
    (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      activeModules: ['owner_portal'],
    });

    const req = { owner: { orgId: 'org-2', ownerId: 'o1', supabaseUserId: 's1' } } as unknown as Request;
    const res = buildRes();

    await requireModule('owner_portal')(req, res, next);

    expect(prisma.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org-2' } })
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when there is no authenticated identity at all', async () => {
    const req = {} as Request;
    const res = buildRes();

    await requireModule('owner_portal')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('forwards a DB lookup failure to next(err) instead of leaving the request hanging', async () => {
    const dbError = new Error('connection reset');
    (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(dbError);

    const req = { user: { orgId: 'org-1', userId: 'u1', role: 'manager' } } as unknown as Request;
    const res = buildRes();

    await requireModule('owner_portal')(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
  });
});
