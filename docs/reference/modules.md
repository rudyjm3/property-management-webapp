# Add-On Modules Reference

Distilled from `BUILD_OUTLINE.md` §7 "Module Roadmap" and §14 "Add-On Module
Documentation" plus the module-flagged comments in
`packages/db/prisma/schema.prisma`. Regenerate by hand when a module ships or
the roadmap changes — treat `BUILD_OUTLINE.md` as the narrative source of
truth and this file as the compressed cross-reference.

Modules are Phase 4+. Per `BUILD_OUTLINE.md` §14, the plan is to feature-flag
them via an `organization.activeModules` field at the API middleware layer
and gate the UI via a `<ModuleGate module="...">` wrapper.

**As of 2026-09-17, that gating infrastructure now exists** — see "Module
gating infrastructure" below — and is wired to the two modules that had
shipped ahead of it, Module 9 (Owner Portal) and Module 11 (Reporting &
Analytics). No other module has functionality built yet, so no other module
needs gating today. Full Stripe Subscription Item billing is still not
wired — see the "How activation works today" section for the interim
mechanism. What exists beyond gating is (a) base schema columns kept
nullable so a module's eventual launch doesn't require a breaking migration,
and (b) in a few cases, base-product functionality that overlaps with what a
module will later extend.

## Module gating infrastructure

- **Schema**: `Organization.activeModules` — `String[]`, default `[]`
  (`packages/db/prisma/migrations/20260917041729_add_organization_active_modules`).
  Holds module keys, defined in `packages/shared/src/constants/index.ts` as
  `MODULE_KEYS` (`owner_portal`, `reporting_analytics`) / `ALL_MODULE_KEYS`.
- **API middleware**: `requireModule(moduleKey)`
  (`apps/api/src/middleware/module-gate.ts`) — looks up the requesting org's
  `activeModules` fresh per request and returns `403 MODULE_NOT_ACTIVE` if
  the key isn't present. Resolves the org from whichever auth identity is on
  the request (`req.user`, `req.owner`, or `req.tenant`), so it chains after
  any of the three auth middlewares. Applied in `apps/api/src/routes/index.ts`
  to `/organizations/:orgId/owners` and `/organizations/:orgId/reports`
  (manager-facing, on top of their existing `requireRoles(['owner',
  'manager'])`) and to `/owner-portal` (owner-facing, on top of
  `requireOwnerAuth`).
- **Web UI**: `<ModuleGate module="...">` (`apps/web/components/ModuleGate.tsx`)
  reads `activeModules` off the org in `AuthContext` (populated by
  `GET /auth/me`) and renders `children` only if the module is active,
  otherwise a `fallback` (defaults to nothing rendered). Wraps the `/owners`
  and `/reports` manager pages, and the `Sidebar` nav items for both are
  filtered out entirely when their module isn't active.
- **How activation works today**: no Stripe Subscription Item billing yet.
  Instead, `PATCH /organizations/:orgId` accepts an `activeModules` array
  (validated against `ALL_MODULE_KEYS`), settable by any `owner`/`manager` —
  exposed as checkboxes under Settings → Organization → "Add-On Modules" in
  the web app. This is a placeholder switch to make gating testable, not a
  billing decision; it should move behind an actual paid-subscription check
  once module billing ships. The seed script's demo org
  (`packages/db/prisma/seed.ts`) defaults both modules to active so local
  dev/demo environments see the gated features without an extra step.

## Schema fields already present, dormant until their module ships

| Column | Table | Module | Notes |
|---|---|---|---|
| `ssnFullEncrypted` | Tenant | Advanced Tenant Onboarding | Encrypted at rest, never logged/exposed |
| `screeningConsentAt` | Tenant | Advanced Tenant Onboarding | Legally required before running any background/credit check |
| `govtIdNumber` | Tenant | Advanced Tenant Onboarding | Store encrypted |
| `taxParcelId` | Property | Advanced Payments & Accounting | Needed for Schedule E / tax reporting |
| `applianceCount` | Unit | Unit Intelligence & Appliance Registry | Maintained by module, surfaced on unit detail |
| `lastInspectionAt` | Unit | Inspections & Compliance | Timestamp of most recent inspection, any type |
| `w9OnFile` | Vendor | Vendor & Contractor Mgmt (1099 reporting) | Required for contractor tax reporting |

## Module list (priority per BUILD_OUTLINE.md §7)

| # | Module | Price | Priority | Schema hooks already in place | Depends on |
|---|---|---|---|---|---|
| 1 | Advanced Tenant Onboarding | $25–40/mo | High | `ssnFullEncrypted`, `screeningConsentAt`, `govtIdNumber`, `govtIdType` (Tenant) — **application form + e-signature already shipped** (`routes/apply.ts`, `routes/sign.ts`, `rental-application.service.ts`); background/credit check integration not yet built | Lease Mgmt, Stripe, Resend, 3rd-party screening API |
| 2 | Unit Intelligence & Appliance Registry | $20–35/mo | High | `applianceCount` (Unit) | Unit Mgmt, S3 |
| 3 | Grounds & Property Maintenance | $25–40/mo | Medium | none dedicated — reuses WorkOrder + Vendor | Work Orders, Vendor |
| 4 | Advanced Payments & Accounting | $30–50/mo | Medium | `taxParcelId` (Property) | Stripe, Payment Ledger, Owner Portal (for disbursements) |
| 5 | Vendor & Contractor Management | $20–30/mo | Medium | `w9OnFile` (Vendor) | Work Orders |
| 6 | Inspections & Compliance | $25–40/mo | Medium | `lastInspectionAt` (Unit) | Unit Mgmt, S3 |
| 7 | Lease Renewal (full negotiation flow) | $15–25/mo | Medium | none dedicated — base one-click renewal via `Lease.renewalOfLeaseId` already ships | Lease Mgmt, Messaging |
| 8 | Eviction Management | $30–50/mo | Medium | none dedicated — will use `Property.state` for jurisdiction lookup | Lease Mgmt, property jurisdiction data |
| 9 | Owner Portal | $25–40/mo | Low | **Fully shipped** (2026-09-16): manager-facing `Owner`/`PropertyOwner`/`OwnerStatement` models + `routes/owners.ts` (merged 2026-05-31), plus a separate owner-facing auth path — `Owner.supabaseUserId`/`portalStatus`/`portalInvitedAt`, `requireOwnerAuth` middleware, `routes/owner-portal.ts` mounted at `/owner-portal` (see `schema.md`, `rbac.md`, `routes.md`) — and a read-only owner web portal (`apps/web/app/owner-portal/*`: login, set-password, dashboard, properties, statements, reports) mirroring the tenant-portal pattern. **Gated as of 2026-09-17** — `requireModule('owner_portal')` on both `/owners` and `/owner-portal`, `<ModuleGate>` on the web `/owners` page and its nav item. | Payments, Properties |
| 10 | Communications & Resident Engagement | $20–30/mo | Low | none dedicated — base one-to-one Message thread already ships | Messaging, Notifications, Twilio |
| 11 | Reporting & Analytics | $25–40/mo | Low | **Fully shipped** (2026-09-16): `routes/reports.ts` provides fixed reports (financial summary/trend, rent roll, spend-by-location, vacancy snapshot) with CSV export (merged 2026-05-31), plus a configurable report builder (`POST /reports/builder`, column/filter selection over the same report sources, with saved configs via the `SavedReport` model and `GET/POST/DELETE /reports/saved`), vacancy-rate history with manual market-rate comparison (`VacancyHistory` model, `GET /reports/vacancy-history`, `POST /reports/vacancy-history/snapshot`), and PDF export alongside CSV (`apps/web/lib/exportPdf.ts`, via `jspdf`) on both the fixed financial-summary report and the report builder. **Gated as of 2026-09-17** — `requireModule('reporting_analytics')` on `/reports`, `<ModuleGate>` on the web `/reports` page and its nav item. | All modules |

## Notes on base-product overlap

Two modules extend functionality that already partially exists as base
product, per `BUILD_OUTLINE.md` §14:

- **Module 7 (Lease Renewal)**: basic one-click renewal (no tenant-facing
  offer/counter/countersignature flow) is already shipped — see `Lease`
  model's self-relation `renewalOfLeaseId`/`renewals` in `schema.md`. The
  module adds the negotiation workflow on top.
- **Module 10 (Communications & Resident Engagement)**: base one-to-one
  manager↔tenant messaging (`Message` model, `routes/messages.ts`) already
  ships. The module adds bulk/broadcast, automation, SMS, and community
  features.

**Module 9 (Owner Portal) and Module 11 (Reporting & Analytics)** are now
both fully built functionally, ahead of their "Low priority" roadmap
position. `Owner`, `PropertyOwner`, and `OwnerStatement` are full Prisma
models, `/organizations/:orgId/owners` and `/organizations/:orgId/reports`
remain the manager-facing API routes gated by `requireRoles(['owner',
'manager'])` — but a separate owner-facing auth path now also exists:
`requireOwnerAuth` verifies a Supabase JWT and looks up `Owner` by
`supabaseUserId` (mirroring `requireTenantAuth`), mounted at `/owner-portal`
with its own read-only routes and a dedicated web UI
(`apps/web/app/owner-portal/*`) for login, statements, properties, and
reports. Module 11's report builder, vacancy history, and PDF export are
likewise built — see the module table above for the specific routes/models.

**As of 2026-09-17, both are behind module gating** — see "Module gating
infrastructure" above for the mechanism. They are not yet behind Stripe
Subscription Item *billing*: activation is currently a manual
`activeModules` toggle (settings UI or direct API call), not a paid
subscription check. Verify against `BUILD_OUTLINE.md` §11/§12
(Implementation Delta Appendix / Phase-by-Phase Status) for the latest state
before assuming anything here is current — this doc can drift from the
build outline's own delta tracking.
