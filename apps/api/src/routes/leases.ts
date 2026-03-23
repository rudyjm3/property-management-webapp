import { Router, Request, Response, NextFunction } from 'express';
import { createLeaseSchema, updateLeaseSchema, renewLeaseSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as leaseService from '../services/lease.service';

const router = Router({ mergeParams: true });

// GET /api/v1/organizations/:orgId/leases
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leases = await leaseService.listLeases(req.params.orgId as string);
    res.json({ data: leases });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/leases/:leaseId
router.get('/:leaseId', async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/', validate(createLeaseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lease = await leaseService.createLease(req.params.orgId as string, req.body);
    res.status(201).json({ data: lease });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/leases/:leaseId
router.patch('/:leaseId', validate(updateLeaseSchema), async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/:leaseId/renew', validate(renewLeaseSchema), async (req: Request, res: Response, next: NextFunction) => {
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

// POST /api/v1/organizations/:orgId/leases/:leaseId/participants
router.post('/:leaseId/participants', async (req: Request, res: Response, next: NextFunction) => {
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
router.patch('/:leaseId/participants/:participantId', async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:leaseId/participants/:participantId', async (req: Request, res: Response, next: NextFunction) => {
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
router.delete('/:leaseId', async (req: Request, res: Response, next: NextFunction) => {
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
