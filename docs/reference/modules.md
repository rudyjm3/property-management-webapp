# Add-On Modules Reference

Distilled from `BUILD_OUTLINE.md` §7 "Module Roadmap" and §14 "Add-On Module
Documentation" plus the module-flagged comments in
`packages/db/prisma/schema.prisma`. Regenerate by hand when a module ships or
the roadmap changes — treat `BUILD_OUTLINE.md` as the narrative source of
truth and this file as the compressed cross-reference.

Modules are Phase 4+. Per `BUILD_OUTLINE.md` §14, the *plan* is to
feature-flag them via an `organization.active_modules` field at the API
middleware layer and gate the UI via a `<ModuleGate module="...">` wrapper —
but **none of that gating infrastructure exists in the repo yet**: there is
no `active_modules` field on `Organization`, no module-gating middleware, and
no `ModuleGate` component. Treat those as roadmap requirements, not
implemented controls. This matters more than it did when this doc was first
written: as of 2026-09-16, Modules 9 and 11 (see table below) are now fully
built functionally but still ship without any gating in front of them, so
they run as always-on, unbilled functionality rather than paid add-ons. What
exists today beyond that is (a) base schema columns kept nullable so a
module's eventual launch doesn't require a breaking migration, and (b) in a
few cases, base-product functionality that overlaps with what a module will
later extend.

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
| 9 | Owner Portal | $25–40/mo | Low | **Fully shipped** (2026-09-16): manager-facing `Owner`/`PropertyOwner`/`OwnerStatement` models + `routes/owners.ts` (merged 2026-05-31), plus a separate owner-facing auth path — `Owner.supabaseUserId`/`portalStatus`/`portalInvitedAt`, `requireOwnerAuth` middleware, `routes/owner-portal.ts` mounted at `/owner-portal` (see `schema.md`, `rbac.md`, `routes.md`) — and a read-only owner web portal (`apps/web/app/owner-portal/*`: login, set-password, dashboard, properties, statements, reports) mirroring the tenant-portal pattern. Not gated by module flag — see gating note above. | Payments, Properties |
| 10 | Communications & Resident Engagement | $20–30/mo | Low | none dedicated — base one-to-one Message thread already ships | Messaging, Notifications, Twilio |
| 11 | Reporting & Analytics | $25–40/mo | Low | **Fully shipped** (2026-09-16): `routes/reports.ts` provides fixed reports (financial summary/trend, rent roll, spend-by-location, vacancy snapshot) with CSV export (merged 2026-05-31), plus a configurable report builder (`POST /reports/builder`, column/filter selection over the same report sources, with saved configs via the `SavedReport` model and `GET/POST/DELETE /reports/saved`), vacancy-rate history with manual market-rate comparison (`VacancyHistory` model, `GET /reports/vacancy-history`, `POST /reports/vacancy-history/snapshot`), and PDF export alongside CSV (`apps/web/lib/exportPdf.ts`, via `jspdf`) on both the fixed financial-summary report and the report builder. Not gated by module flag — see gating note above. | All modules |

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
likewise built — see the module table above for the specific
routes/models. Neither is behind module *billing* gating (no
`active_modules`/`ModuleGate` exists at all yet — see the note at the top of
this file), so what is built runs as free, always-on functionality. Verify
against `BUILD_OUTLINE.md` §11/§12 (Implementation Delta Appendix /
Phase-by-Phase Status) for the latest state before assuming anything here is
gated — this doc can drift from the build outline's own delta tracking.
