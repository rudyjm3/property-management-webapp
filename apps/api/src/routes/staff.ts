import { Router } from 'express';
import { listStaff } from '../services/staff.service';

const router = Router({ mergeParams: true });

// GET /api/v1/organizations/:orgId/staff
router.get('/', async (req, res, next) => {
  try {
    const staff = await listStaff(req.params.orgId);
    res.json({ data: staff });
  } catch (err) {
    next(err);
  }
});

export default router;
