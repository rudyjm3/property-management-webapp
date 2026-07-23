# RBAC & Auth Reference

Source of truth: `apps/api/src/middleware/auth.ts`. Regenerate by hand when
middleware or roles change.

## Roles

`UserRole` enum (`packages/db/prisma/schema.prisma`): **`owner`**, **`manager`**,
**`maintenance`**. This is a flat set, not a hierarchy — there is no
"owner > manager > maintenance" ranking baked into the middleware. Every
role-gated route explicitly lists which roles it allows via `requireRoles([...])`.

There is a separate, non-`UserRole` actor: the **Tenant**, authenticated
through its own middleware and request field (see below), never through
`UserRole`.

## Middleware functions (`apps/api/src/middleware/auth.ts`)

| Function | Verifies | Attaches | Used for |
|---|---|---|---|
| `requireSupabaseAuth` | Supabase JWT only, no DB lookup | `req.user` with only `supabaseUserId` set | Pre-onboarding endpoints (e.g. `/auth/register`) where no `User` row exists yet |
| `requireAuth` | Supabase JWT + looks up `User` by `supabaseUserId` | `req.user: AuthUser { userId, orgId, role, supabaseUserId }` | All manager-side org-scoped routes |
| `requireTenantAuth` | Supabase JWT + looks up `Tenant` by `supabaseUserId` (also flips `portalStatus` to `active` on first hit) | `req.tenant: AuthTenant { tenantId, orgId, supabaseUserId }` | Tenant portal routes (`/tenant/*`) — completely separate auth path from `req.user` |
| `requireOrg` | `req.params.orgId` matches `req.user.orgId` | — | Org isolation; always chained after `requireAuth` on `/organizations/:orgId/*` routes |
| `requireRoles(allowedRoles: string[])` | `req.user.role` is in `allowedRoles` | — | Role gate; flat allowlist, e.g. `requireRoles(['owner', 'manager'])` |

All five return `401 UNAUTHORIZED`/`INVALID_TOKEN`/`USER_NOT_FOUND` or
`403 FORBIDDEN` in the shared `{ error: { code, message } }` shape on failure.

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

## Two distinct auth identities — don't confuse them

- **Manager-side**: `requireAuth` → `req.user` → keyed off `User.role`
  (`UserRole`). Used for owner/manager/maintenance staff.
- **Tenant-side**: `requireTenantAuth` → `req.tenant` → no role field at all;
  a tenant is a tenant. Used only under the `/tenant` route prefix.

A handler that reads `req.user.role` on a tenant-portal route (or vice versa)
is a bug — the two middleware chains are never combined on the same route.
