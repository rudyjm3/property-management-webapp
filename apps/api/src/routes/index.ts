import { Router } from 'express';
import propertyRoutes from './properties';
import tenantRoutes from './tenants';
import leaseRoutes from './leases';
import paymentRoutes from './payments';
import documentRoutes from './documents';
import notificationRoutes from './notifications';
import workOrderRoutes from './workOrders';

const router = Router();

// All routes are scoped to an organization
router.use('/organizations/:orgId/properties', propertyRoutes);
router.use('/organizations/:orgId/tenants', tenantRoutes);
router.use('/organizations/:orgId/leases', leaseRoutes);
router.use('/organizations/:orgId/payments', paymentRoutes);
router.use('/organizations/:orgId/documents', documentRoutes);
router.use('/organizations/:orgId/notifications', notificationRoutes);
router.use('/organizations/:orgId/work-orders', workOrderRoutes);

export default router;
