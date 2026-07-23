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
| `/apply` | `routes/apply.ts` | none (rate-limited public rental application form) |
| `/sign` | `routes/sign.ts` | none (rate-limited public lease e-signing) |
| `/organizations/:orgId/notifications/jobs` | `routes/notificationJobs.ts` | `CRON_SECRET` only, no user JWT |
| `/organizations/:orgId` | `routes/organizations.ts` | none at mount (org settings; per-route checks inside) |
| `/organizations/:orgId/properties` | `routes/properties.ts` (nests `/:propertyId/units` → `routes/units.ts`) | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/tenants` | `routes/tenants.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/leases` | `routes/leases.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/payments` | `routes/payments.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/documents` | `routes/documents.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/notifications` | `routes/notifications.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/work-orders` | `routes/workOrders.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/staff` | `routes/staff.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/vendors` | `routes/vendors.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/messages` | `routes/messages.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/connect` | `routes/connect.ts` | `requireAuth`, `requireOrg` (Stripe Connect status/account-link/sync) |
| `/organizations/:orgId/ledger` | `routes/ledger.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/billing` | `routes/billing.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId` (application links, review, manager lease signing) | `routes/applications.ts` | `requireAuth`, `requireOrg`, `requireRoles(['owner','manager'])` |
| `/organizations/:orgId/owners` | `routes/owners.ts` | `requireAuth`, `requireOrg` |
| `/organizations/:orgId/reports` | `routes/reports.ts` | `requireAuth`, `requireOrg` (financial reports) |
| `/tenant` | `routes/tenants-portal.ts` | `requireTenantAuth` (separate identity from all routes above — see `rbac.md`) |

## Not mounted through `index.ts`

- Stripe webhook (`POST /api/webhooks/stripe`) and Supabase auth webhook
  (`POST /api/webhooks/auth`) are documented in `BUILD_OUTLINE.md` §9 as
  separate unauthenticated webhook endpoints outside the `/api/v1/organizations`
  tree — verify current wiring in `apps/api/src/index.ts` before relying on
  the exact path if it matters for a task.

## Web app (Next.js, `apps/web/app/`)

Route-group segments: `(auth)`, `(dashboard)`, `auth`, `apply`, `sign`,
`onboarding`. ~36 `page.tsx` files plus 1 `route.ts` API handler as of this
writing — mirrors the manager screen list in `BUILD_OUTLINE.md` §8
("Manager Web App"). Consult that section for the full screen-by-screen
breakdown; this doc only tracks the API layer.
