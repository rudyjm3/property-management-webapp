import { Router } from 'express';
import { requireAuth, requireOrg, requireRoles, requireTenantAuth } from '../middleware/auth';
import authRoutes from './auth';
import inviteRoutes from './invite';
import organizationRoutes from './organizations';
import notificationJobRoutes from './notificationJobs';
import propertyRoutes from './properties';
import tenantRoutes from './tenants';
import leaseRoutes from './leases';
import paymentRoutes from './payments';
import documentRoutes from './documents';
import notificationRoutes from './notifications';
import workOrderRoutes from './workOrders';
import staffRoutes from './staff';
import vendorRoutes from './vendors';
import messageRoutes from './messages';
import connectRoutes from './connect';
import ledgerRoutes from './ledger';
import billingRoutes from './billing';
import tenantPortalRoutes from './tenants-portal';
import applicationRoutes from './applications';
import applyRoutes from './apply';
import signRoutes from './sign';

const router = Router();

// Auth routes — no org scope
router.use('/auth', authRoutes);

// Invite activation routes — public, rate-limited
router.use('/invite', inviteRoutes);

// Public application form routes — rate-limited, no auth
router.use('/apply', applyRoutes);

// Public lease signing routes — rate-limited, no auth
router.use('/sign', signRoutes);

// Cron-trigger notification jobs (CRON_SECRET only, no user JWT)
router.use('/organizations/:orgId/notifications/jobs', notificationJobRoutes);

// Organization settings
router.use('/organizations/:orgId', organizationRoutes);

// All org-scoped routes — protected by auth + org isolation
router.use('/organizations/:orgId/properties', requireAuth, requireOrg, propertyRoutes);
router.use('/organizations/:orgId/tenants', requireAuth, requireOrg, tenantRoutes);
router.use('/organizations/:orgId/leases', requireAuth, requireOrg, leaseRoutes);
router.use('/organizations/:orgId/payments', requireAuth, requireOrg, paymentRoutes);
router.use('/organizations/:orgId/documents', requireAuth, requireOrg, documentRoutes);
router.use('/organizations/:orgId/notifications', requireAuth, requireOrg, notificationRoutes);
router.use('/organizations/:orgId/work-orders', requireAuth, requireOrg, workOrderRoutes);
router.use('/organizations/:orgId/staff', requireAuth, requireOrg, staffRoutes);
router.use('/organizations/:orgId/vendors', requireAuth, requireOrg, vendorRoutes);
router.use('/organizations/:orgId/messages', requireAuth, requireOrg, messageRoutes);
router.use('/organizations/:orgId/connect', requireAuth, requireOrg, connectRoutes);
router.use('/organizations/:orgId/ledger', requireAuth, requireOrg, ledgerRoutes);
router.use('/organizations/:orgId/billing', requireAuth, requireOrg, billingRoutes);
// Application links, application review, and manager lease signing
router.use('/organizations/:orgId', requireAuth, requireOrg, requireRoles(['owner', 'manager']), applicationRoutes);

// Tenant portal routes — protected by tenant auth (separate from manager auth)
router.use('/tenant', requireTenantAuth, tenantPortalRoutes);

export default router;
