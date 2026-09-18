import { Router, Request, Response, NextFunction } from 'express';
import { createMaintenanceScheduleSchema, updateMaintenanceScheduleSchema } from '@propflow/shared';
import { validate } from '../middleware/validate';
import * as scheduleService from '../services/maintenance-schedule.service';
import { requireRoles } from '../middleware/auth';

const router = Router({ mergeParams: true });

const requireManagerAccess = requireRoles(['owner', 'manager']);

// GET /api/v1/organizations/:orgId/properties/:propertyId/maintenance-schedules
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedules = await scheduleService.listMaintenanceSchedules(
      req.params.orgId as string,
      req.params.propertyId as string
    );
    res.json({ data: schedules });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/organizations/:orgId/properties/:propertyId/maintenance-schedules/:scheduleId
router.get('/:scheduleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await scheduleService.getMaintenanceSchedule(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.scheduleId as string
    );
    res.json({ data: schedule });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/organizations/:orgId/properties/:propertyId/maintenance-schedules
router.post(
  '/',
  requireManagerAccess,
  validate(createMaintenanceScheduleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await scheduleService.createMaintenanceSchedule(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.body
      );
      res.status(201).json({ data: schedule });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/organizations/:orgId/properties/:propertyId/maintenance-schedules/:scheduleId
router.patch(
  '/:scheduleId',
  requireManagerAccess,
  validate(updateMaintenanceScheduleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await scheduleService.updateMaintenanceSchedule(
        req.params.orgId as string,
        req.params.propertyId as string,
        req.params.scheduleId as string,
        req.body
      );
      res.json({ data: schedule });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/organizations/:orgId/properties/:propertyId/maintenance-schedules/:scheduleId
router.delete('/:scheduleId', requireManagerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await scheduleService.deleteMaintenanceSchedule(
      req.params.orgId as string,
      req.params.propertyId as string,
      req.params.scheduleId as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
