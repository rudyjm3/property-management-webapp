import { Router, Request, Response, NextFunction } from 'express';
import * as ownerPortalService from '../services/owner-portal.service';

const router = Router();

// GET /api/v1/owner-portal/me
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await ownerPortalService.getOwnerProfile(req.owner!.ownerId);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/owner-portal/dashboard
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await ownerPortalService.getOwnerDashboard(req.owner!.ownerId);
    res.json({ data: dashboard });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/owner-portal/properties
router.get('/properties', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const properties = await ownerPortalService.getOwnerProperties(req.owner!.ownerId);
    res.json({ data: properties });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/owner-portal/statements
router.get('/statements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const propertyId = req.query.propertyId as string | undefined;
    const statements = await ownerPortalService.getOwnerStatements(req.owner!.ownerId, { propertyId });
    res.json({ data: statements });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/owner-portal/statements/:statementId
router.get('/statements/:statementId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stmt = await ownerPortalService.getOwnerStatement(req.owner!.ownerId, req.params.statementId as string);
    res.json({ data: stmt });
  } catch (err) {
    next(err);
  }
});

export default router;
