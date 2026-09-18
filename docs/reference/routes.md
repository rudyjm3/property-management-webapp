# API Routes Reference

Source of truth: `apps/api/src/routes/index.ts` (mount points) and
`apps/api/src/index.ts` (base path). Regenerate by hand when routers are
added/removed/re-gated. Base path for everything below: **`/api/v1`**.

Auth column reads left-to-right as the actual middleware chain applied in
`index.ts`. `requireRoles([...])` further restricts beyond `requireAuth`.
Individual route files may add their own finer-grained checks (e.g.
`requireManagerAccess` inside `properties.ts`) not shown here — check the
file directly for per-endpoint behavior.

| Path prefix | Source file | Auth chain |
|---|---|---|
| `/auth` | `routes/auth.ts` | none (registration/login) |
| `/invite` | `routes/invite.ts` | none (rate-limited invite activation) |
| `/apply` | `routes/apply.ts` | none (rate-limited public rental application form; also captures screening consent + encrypted SSN/govt ID when the org has `advanced_tenant_onboarding` active — checked in the service layer, not middleware, since there's no authenticated identity to gate on) |
| `/sign` | `routes/sign.ts` | none (rate-limited public lease e-signing) |
| `/organizations/:orgId/notifications/jobs` | `routes/notificationJobs.ts` | `CRON_SECRET` only, no user JWT |
| `/organizations/:orgId` | `routes/organizations.ts` | none at mount (org settings; per-route checks inside) |
| `/organizations/:orgId/properties` | `routes/properties.ts` (nests `/:propertyId/units` → `routes/units.ts`, which nests `/:unitId/appliances` → `routes/appliances.ts` and `/:unitId/inspections` → `routes/inspections.ts`; also nests `/:propertyId/maintenance-schedules` → `routes/maintenance-schedules.ts` and `/:propertyId/inspections` → `routes/property-inspections.ts` directly in `properties.ts`) | `requireAuth`, `requireOrg`, plus `requireModule('unit_intelligence')` applied at the `appliances` router mount and `requireModule('inspections_compliance')` applied at the `inspections` router mount inside `units.ts`, and `requireModule('grounds_maintenance')` applied at both the `maintenance-schedules` and property-level `inspections` router mounts inside `properties.ts` (rest of `properties.ts`/`units.ts` is ungated) |
| `/organizations/:orgId/tenants` | `routes/tenants.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/leases` | `routes/leases.ts` | `requireAuth`, `requireOrg`, plus `requireModule('advanced_payments_accounting')` applied only to the `GET`/`POST .../leases/:leaseId/security-deposit-disposition` routes and `requireModule('inspections_compliance')` applied only to `GET .../leases/:leaseId/inspections/compare` (rest of the router is ungated) |
| `/organizations/:orgId/inspection-templates` | `routes/inspection-templates.ts` | `requireAuth`, `requireOrg`, `requireModule('inspections_compliance')` (checklist template CRUD) |
| `/organizations/:orgId/payments` | `routes/payments.ts` | `requireAuth`, `requireOrg`, plus `requireModule('advanced_payments_accounting')` applied only to `POST .../payments/:paymentId/initiate-card` and `.../record-partial` (rest of the router, including ACH, is ungated) |
| `/organizations/:orgId/documents` | `routes/documents.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/notifications` | `routes/notifications.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/work-orders` | `routes/workOrders.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/staff` | `routes/staff.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/vendors` | `routes/vendors.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/messages` | `routes/messages.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/connect` | `routes/connect.ts` | `requireAuth`, `requireOrg` (Stripe Connect status/account-link/sync) |
| `/organizations/:orgId/ledger` | `routes/ledger.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/billing` | `routes/billing.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId` (application links, review, manager lease signing) | `routes/applications.ts` | `requireAuth`, `requireOrg`, `requireRoles(['owner','manager'])`, plus `requireModule('advanced_tenant_onboarding')` applied only to the `applications/:id/screening` GET/POST routes (rest of the router is ungated) |
| `/organizations/:orgId/owners` | `routes/owners.ts` | `requireAuth`, `requireOrg`, `requireModule('owner_portal')`, plus `requireModule('advanced_payments_accounting')` stacked on just the three `.../disbursements` routes (disbursements need both modules active) |
| `/organizations/:orgId/reports` | `routes/reports.ts` | `requireAuth`, `requireOrg`, `requireModule('reporting_analytics')` (financial reports, report builder, vacancy history, saved reports), plus `requireModule('advanced_payments_accounting')` stacked on just `GET .../reports/schedule-e-export` and `requireModule('grounds_maintenance')` stacked on just `GET .../reports/grounds-maintenance-compliance` (each needs both modules active) |
| `/tenant` | `routes/tenants-portal.ts` | `requireTenantAuth` (separate identity from all routes above — see `rbac.md`), plus `requireModule('advanced_payments_accounting')` applied only to `POST /tenant/payments/initiate-card` |
| `/owner-portal` | `routes/owner-portal.ts` | `requireOwnerAuth`, `requireModule('owner_portal')` (separate identity from all routes above — see `rbac.md`) |

## Not mounted through `index.ts`

- Stripe webhook (`POST /api/webhooks/stripe`) is registered directly in
  `apps/api/src/index.ts`, outside the `/api/v1` tree, before `express.json()`
  so it receives the raw body `stripe.webhooks.constructEvent` needs to verify
  the `stripe-signature` header. No other webhook endpoint exists — a prior
  version of this doc claimed a `POST /api/webhooks/auth` Supabase auth
  webhook that was never actually built; corrected 09-17-2026 as part of the
  P3 security review (see `BUILD_OUTLINE.md` §12).

## Web app (Next.js, `apps/web/app/`)

Route-group segments: `(auth)`, `(dashboard)`, `auth`, `apply`, `sign`,
`onboarding`, plus a top-level `owner-portal` folder (own layout, not part
of the `(dashboard)` group — login/set-password are public within it, the
rest require an active Supabase session checked client-side against
`/api/v1/owner-portal/me`). ~42 `page.tsx` files plus 1 `route.ts` API
handler as of this writing — mirrors the manager screen list in
`BUILD_OUTLINE.md` §8 ("Manager Web App"). Consult that section for the
full screen-by-screen breakdown; this doc only tracks the API layer.
