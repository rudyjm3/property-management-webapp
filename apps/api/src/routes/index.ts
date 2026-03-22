import { Router } from 'express';
import propertyRoutes from './properties';

const router = Router();

// All routes are scoped to an organization
router.use('/organizations/:orgId/properties', propertyRoutes);

export default router;
