import { Router } from 'express';
import propertyRoutes from './properties';
import tenantRoutes from './tenants';

const router = Router();

// All routes are scoped to an organization
router.use('/organizations/:orgId/properties', propertyRoutes);
router.use('/organizations/:orgId/tenants', tenantRoutes);

export default router;
