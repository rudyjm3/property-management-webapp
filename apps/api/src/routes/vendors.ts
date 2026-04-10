import { Router } from 'express';
import { listVendors } from '../services/vendor.service';

const router = Router({ mergeParams: true });

// GET /api/v1/organizations/:orgId/vendors?status=active
router.get('/', async (req, res, next) => {
  try {
    const activeOnly = req.query.status === 'active';
    const vendors = await listVendors((req.params as Record<string, string>).orgId, { activeOnly });
    res.json({ data: vendors });
  } catch (err) {
    next(err);
  }
});

export default router;
