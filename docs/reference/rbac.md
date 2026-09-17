# RBAC & Auth Reference

Source of truth: `apps/api/src/middleware/auth.ts`. Regenerate by hand when
middleware or roles change.

## Roles

`UserRole` enum (`packages/db/prisma/schema.prisma`): **`owner`**, **`manager`**,
**`maintenance`**. This is a flat set, not a hierarchy — there is no
"owner > manager > maintenance" ranking baked into the middleware. Every
role-gated route explicitly lists which roles it allows via `requireRoles([...])`.

There are two separate, non-`UserRole` actors, each authenticated through
their own middleware and request field (see below), never through
`UserRole`: the **Tenant** and the **Owner** (owner portal — distinct from
the `owner` value in `UserRole`, which is a manager-side staff role).

## Middleware functions (`apps/api/src/middleware/auth.ts`)

| Function | Verifies | Attaches | Used for |
|---|---|---|---|
| `requireSupabaseAuth` | Supabase JWT only, no DB lookup | `req.user` with only `supabaseUserId` set | Pre-onboarding endpoints (e.g. `/auth/register`) where no `User` row exists yet |
| `requireAuth` | Supabase JWT + looks up `User` by `supabaseUserId` | `req.user: AuthUser { userId, orgId, role, supabaseUserId }` | All manager-side org-scoped routes |
| `requireTenantAuth` | Supabase JWT + looks up `Tenant` by `supabaseUserId` (also flips `portalStatus` to `active` on first hit) | `req.tenant: AuthTenant { tenantId, orgId, supabaseUserId }` | Tenant portal routes (`/tenant/*`) — completely separate auth path from `req.user` |
| `requireOwnerAuth` | Supabase JWT + looks up `Owner` by `supabaseUserId` (also flips `portalStatus` to `active` on first hit) | `req.owner: AuthOwner { ownerId, orgId, supabaseUserId }` | Owner portal routes (`/owner-portal/*`) — separate auth path from both `req.user` and `req.tenant` |
| `requireOrg` | `req.params.orgId` matches `req.user.orgId` | — | Org isolation; always chained after `requireAuth` on `/organizations/:orgId/*` routes |
| `requireRoles(allowedRoles: string[])` | `req.user.role` is in `allowedRoles` | — | Role gate; flat allowlist, e.g. `requireRoles(['owner', 'manager'])` |
| `requireModule(moduleKey)` (`apps/api/src/middleware/module-gate.ts`) | `Organization.activeModules` (looked up fresh per request) includes `moduleKey` | — | Add-on module gate; resolves the org from whichever identity is present (`req.user`, `req.owner`, or `req.tenant`) so it can chain after any of the three auth middlewares |

All seven return `401 UNAUTHORIZED`/`INVALID_TOKEN`/`USER_NOT_FOUND` or
`403 FORBIDDEN`/`MODULE_NOT_ACTIVE` in the shared `{ error: { code, message } }`
shape on failure.

## Where role-gating is actually applied today

`apps/api/src/routes/index.ts` itself only adds `requireRoles` once: on the
org-scoped application-review + manager lease-signing routes
(`applicationRoutes`), gated to `['owner', 'manager']`.

But most other route files add their **own** role gate internally — a
locally-defined `requireManagerAccess` or `requireSettingsAccess` alias for
`requireRoles(['owner', 'manager'])`, applied per-endpoint — which is
invisible from `index.ts` alone. Do not assume a router is open to all roles
just because `index.ts` doesn't gate it. As of this writing:

- **Every endpoint gated to `owner`/`manager`**: `leases.ts`, `payments.ts`,
  `owners.ts`, `reports.ts`, `ledger.ts`, `messages.ts`, `staff.ts`,
  `billing.ts`, `connect.ts`, `documents.ts`
- **Also module-gated** (on top of role-gating): `owners.ts` requires
  `owner_portal` in `activeModules`, `reports.ts` requires
  `reporting_analytics`, both applied via `requireModule(...)` at the
  router mount in `index.ts`. The owner-facing `/owner-portal/*` routes
  (`requireOwnerAuth`) are likewise gated behind `owner_portal`.
  `applications.ts`'s two screening endpoints
  (`POST`/`GET .../applications/:id/screening`) require
  `advanced_tenant_onboarding`, but via `requireModule(...)` applied to
  just those routes rather than the whole router — the rest of
  `applications.ts` (application links, review, e-sign) ships ungated as
  base product. `advanced_payments_accounting` follows the same
  per-route pattern in five places: `POST .../payments/:paymentId/{initiate-card,record-partial}`
  in `payments.ts`, `POST /tenant/payments/initiate-card` in
  `tenants-portal.ts`, `GET`/`POST .../leases/:leaseId/security-deposit-disposition`
  in `leases.ts`, the three `.../disbursements` routes in `owners.ts`
  (stacked on top of that router's `owner_portal` mount-level gate), and
  `GET .../reports/schedule-e-export` in `reports.ts` (stacked on top of
  that router's `reporting_analytics` mount-level gate). See `modules.md`
  for the full module-gating picture.
- **Partially gated** (mutations require `owner`/`manager`, reads are open to
  any org role): `properties.ts`, `tenants.ts`, `units.ts`; `organizations.ts`
  gates only its settings-update and one settings-read endpoint (and is
  mounted in `index.ts` with no `requireAuth`/`requireOrg` at all — see
  `routes.md`)
- **Not role-gated beyond `requireAuth` + `requireOrg`** — any authenticated
  org member, including `maintenance`, can hit every endpoint:
  `workOrders.ts` (except one manager-only `DELETE`), `vendors.ts`,
  `notifications.ts`

Net effect: `maintenance` users can freely reach work orders, vendors, and
notifications; nearly everything else requires `owner` or `manager`. This
list can drift — always check the specific route file (`routes.md` has the
mount-point index) rather than assuming from this summary alone.

## Three distinct auth identities — don't confuse them

- **Manager-side**: `requireAuth` → `req.user` → keyed off `User.role`
  (`UserRole`). Used for owner/manager/maintenance staff.
- **Tenant-side**: `requireTenantAuth` → `req.tenant` → no role field at all;
  a tenant is a tenant. Used only under the `/tenant` route prefix.
- **Owner-portal-side**: `requireOwnerAuth` → `req.owner` → no role field at
  all; keyed off the `Owner` model, not `User`. Used only under the
  `/owner-portal` route prefix. Every `owner-portal.service.ts` query is
  additionally scoped by `ownerId` (via the `PropertyOwner` join and
  `OwnerStatement.ownerId`) so an owner only ever sees their own properties
  and statements — never another owner's, even within the same org — and
  only statements a manager has marked `sent` (never `draft`).

A handler that reads `req.user.role` on a tenant-portal or owner-portal
route (or vice versa) is a bug — these three middleware chains are never
combined on the same route.
