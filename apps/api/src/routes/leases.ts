import { Router, Request, Response, NextFunction } from 'express';
import {
  createLeaseSchema,
  updateLeaseSchema,
  renewLeaseSchema,
  moveOutSchema,
  createSecurityDepositDispositionSchema,
  MODULE_KEYS,
} from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as leaseService from '../services/lease.service';
import * as inspectionService from '../services/inspection.service';
import { requireRoles } from '../middleware/auth';
import { requireModule } from '../middleware/module-gate';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);
// Security deposit reconciliation is an Advanced Payments & Accounting
// (Module 4) feature layered on top of the base move-out workflow, which
// stays ungated — gated per-route rather than at the router mount.
const requireAccountingModule = requireModule(MODULE_KEYS.ADVANCED_PAYMENTS_ACCOUNTING);
// Move-in vs. move-out comparison is an Inspections & Compliance (Module 6)
// feature layered on top of the same base lease router — gated per-route.
const requireInspectionsModule = requireModule(MODULE_KEYS.INSPECTIONS_COMPLIANCE);

// GET /api/v1/organizations/:orgId/leases
router.get('/', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leases = await leaseService.listLeases(req.params.orgId as string);
    res.json({ data: leases });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/leases/:leaseId
router.get('/:leaseId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.getLease(
      req.params.orgId as string,
      req.params.leaseId as string
    );
    res.json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/leases
router.post('/', requireManagerAccess, validate(createLeaseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.createLease(req.params.orgId as string, req.body);
    res.status(201).json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/leases/:leaseId
router.patch('/:leaseId', requireManagerAccess, validate(updateLeaseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.updateLease(
      req.params.orgId as string,
      req.params.leaseId as string,
      req.body
    );
    res.json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/leases/:leaseId/renew
router.post('/:leaseId/renew', requireManagerAccess, validate(renewLeaseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.renewLease(
      req.params.orgId as string,
      req.params.leaseId as string,
      req.body
    );
    res.status(201).json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/leases/:leaseId/move-out
router.post('/:leaseId/move-out', requireManagerAccess, validate(moveOutSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.processMoveOut(
      req.params.orgId as string,
      req.params.leaseId as string,
      req.body
    );
    res.json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/leases/:leaseId/security-deposit-disposition
// Advanced Payments & Accounting (Module 4).
router.get('/:leaseId/security-deposit-disposition', requireManagerAccess, requireAccountingModule, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disposition = await leaseService.getSecurityDepositDisposition(
      req.params.orgId as string,
      req.params.leaseId as string
    );
    res.json({ data: disposition });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/leases/:leaseId/security-deposit-disposition
// Advanced Payments & Accounting (Module 4) — reconciles the deposit against
// the itemized deductions the move-out workflow already captured, and
// produces a persisted disposition record.
router.post('/:leaseId/security-deposit-disposition', requireManagerAccess, requireAccountingModule, validate(createSecurityDepositDispositionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disposition = await leaseService.reconcileSecurityDeposit(
      req.params.orgId as string,
      req.params.leaseId as string,
      req.user!.userId,
      req.body
    );
    res.status(201).json({ data: disposition });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/leases/:leaseId/inspections/compare
// Inspections & Compliance (Module 6) — move-in vs. move-out diff, the
// basis for deposit disposition.
router.get(
  '/:leaseId/inspections/compare',
  requireManagerAccess,
  requireInspectionsModule,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const comparison = await inspectionService.compareLeaseInspections(
        req.params.orgId as string,
        req.params.leaseId as string
      );
      res.json({ data: comparison });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/organizations/:orgId/leases/:leaseId/participants
router.post('/:leaseId/participants', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.addParticipant(
      req.params.orgId as string,
      req.params.leaseId as string,
      req.body.tenantId
    );
    res.status(201).json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/leases/:leaseId/participants/:participantId
router.patch('/:leaseId/participants/:participantId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.setPrimaryParticipant(
      req.params.orgId as string,
      req.params.leaseId as string,
      req.params.participantId as string
    );
    res.json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/leases/:leaseId/participants/:participantId
router.delete('/:leaseId/participants/:participantId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.removeParticipant(
      req.params.orgId as string,
      req.params.leaseId as string,
      req.params.participantId as string
    );
    res.json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/leases/:leaseId
router.delete('/:leaseId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await leaseService.deleteLease(
      req.params.orgId as string,
      req.params.leaseId as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
