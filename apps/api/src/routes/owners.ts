import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate';
import { requireRoles } from '../middleware/auth';
import {
  createOwnerSchema,
  updateOwnerSchema,
  assignPropertyOwnerSchema,
  createOwnerStatementSchema,
  updateOwnerStatementSchema,
} from '@propflow/shared';
import * as ownerService from '../services/owner.service';

const router = Router({ mergeParams: true });
const requireManagerAccess = requireRoles(['owner', 'manager']);

// ─── Owner Statements (must be before /:ownerId) ─────────────────────────────

// GET /api/v1/organizations/:orgId/owners/statements
router.get('/statements', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statements = await ownerService.listOwnerStatements(req.params.orgId as string, {
      ownerId: req.query.ownerId as string | undefined,
      propertyId: req.query.propertyId as string | undefined,
    });
    res.json({ data: statements });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/owners/statements/:statementId
router.get('/statements/:statementId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stmt = await ownerService.getOwnerStatement(req.params.orgId as string, req.params.statementId as string);
    res.json({ data: stmt });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/owners/statements
router.post('/statements', requireManagerAccess, validate(createOwnerStatementSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stmt = await ownerService.createOwnerStatement(req.params.orgId as string, req.body);
    res.status(201).json({ data: stmt });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/owners/statements/:statementId
router.patch('/statements/:statementId', requireManagerAccess, validate(updateOwnerStatementSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stmt = await ownerService.updateOwnerStatement(req.params.orgId as string, req.params.statementId as string, req.body);
    res.json({ data: stmt });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/owners/statements/:statementId
router.delete('/statements/:statementId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ownerService.deleteOwnerStatement(req.params.orgId as string, req.params.statementId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── Property Ownership Assignments (must be before /:ownerId) ───────────────

// GET /api/v1/organizations/:orgId/owners/properties/:propertyId/owners
router.get('/properties/:propertyId/owners', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owners = await ownerService.listPropertyOwners(req.params.orgId as string, req.params.propertyId as string);
    res.json({ data: owners });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/owners/properties/:propertyId/owners
router.post('/properties/:propertyId/owners', requireManagerAccess, validate(assignPropertyOwnerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assignment = await ownerService.assignPropertyOwner(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.body.ownerId,
      req.body.ownershipPct
    );
    res.status(201).json({ data: assignment });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/owners/properties/:propertyId/owners/:ownerId
router.delete('/properties/:propertyId/owners/:ownerId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ownerService.removePropertyOwner(req.params.orgId as string, req.params.propertyId as string, req.params.ownerId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── Owners CRUD ─────────────────────────────────────────────────────────────

// GET /api/v1/organizations/:orgId/owners
router.get('/', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owners = await ownerService.listOwners(req.params.orgId as string);
    res.json({ data: owners });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/owners/:ownerId
router.get('/:ownerId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owner = await ownerService.getOwner(req.params.orgId as string, req.params.ownerId as string);
    res.json({ data: owner });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/owners
router.post('/', requireManagerAccess, validate(createOwnerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owner = await ownerService.createOwner(req.params.orgId as string, req.body);
    res.status(201).json({ data: owner });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/organizations/:orgId/owners/:ownerId
router.patch('/:ownerId', requireManagerAccess, validate(updateOwnerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owner = await ownerService.updateOwner(req.params.orgId as string, req.params.ownerId as string, req.body);
    res.json({ data: owner });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/organizations/:orgId/owners/:ownerId
router.delete('/:ownerId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ownerService.deleteOwner(req.params.orgId as string, req.params.ownerId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
