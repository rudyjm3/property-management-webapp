import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@propflow/db';
import { requireAuth, requireOrg, requireRoles } from '../middleware/auth';
import * as stripeService from '../services/stripe.service';

const router = Router({ mergeParams: true });
const requireSettingsAccess = requireRoles(['owner', 'manager']);
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

router.get(
  '/summary',
  requireAuth,
  requireOrg,
  requireSettingsAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          planTier: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      });

      const customerId =
        org.stripeCustomerId || (await stripeService.getOrCreateCustomer(orgId)).id;
      const invoices = await stripeService.listCustomerInvoices(customerId, 12);
      const defaultPaymentMethod = await stripeService.getCustomerDefaultPaymentMethod(customerId);

      res.json({
        data: {
          organization: org,
          defaultPaymentMethod,
          invoices: invoices.data.map((inv) => ({
            id: inv.id,
            number: inv.number,
            status: inv.status,
            amountPaid: inv.amount_paid,
            amountDue: inv.amount_due,
            currency: inv.currency,
            created: inv.created,
            dueDate: inv.due_date,
            hostedInvoiceUrl: inv.hosted_invoice_url,
            invoicePdf: inv.invoice_pdf,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/portal-session',
  requireAuth,
  requireOrg,
  requireSettingsAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const returnUrl = `${APP_URL}/settings/billing`;
      const url = await stripeService.createBillingPortalSession(orgId, returnUrl);
      res.status(201).json({ data: { url } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
