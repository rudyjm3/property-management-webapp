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

Per `apps/api/src/routes/index.ts`, only **one** route group adds
`requireRoles`: the org-scoped application-review + manager lease-signing
routes (`applicationRoutes`), gated to `['owner', 'manager']` — i.e.
`maintenance` users cannot review rental applications or countersign leases.

Every other org-scoped router (properties, tenants, leases, payments,
documents, notifications, work-orders, staff, vendors, messages, connect,
ledger, billing, owners, reports) is gated only by `requireAuth` +
`requireOrg` — any authenticated user in the org, regardless of role, can hit
them. Finer-grained role checks inside those individual route handlers, if
any, live in the route file itself, not in `index.ts` — check the file
directly (see `routes.md`) before assuming a role is or isn't enforced.

## Two distinct auth identities — don't confuse them

- **Manager-side**: `requireAuth` → `req.user` → keyed off `User.role`
  (`UserRole`). Used for owner/manager/maintenance staff.
- **Tenant-side**: `requireTenantAuth` → `req.tenant` → no role field at all;
  a tenant is a tenant. Used only under the `/tenant` route prefix.

A handler that reads `req.user.role` on a tenant-portal route (or vice versa)
is a bug — the two middleware chains are never combined on the same route.
