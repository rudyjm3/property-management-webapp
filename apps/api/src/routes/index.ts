import { Router } from 'express';
import propertyRoutes from './properties';
import tenantRoutes from './tenants';
import leaseRoutes from './leases';

const router = Router();

// All routes are scoped to an organization
router.use('/organizations/:orgId/properties', propertyRoutes);
router.use('/organizations/:orgId/tenants', tenantRoutes);
router.use('/organizations/:orgId/leases', leaseRoutes);

export default router;
