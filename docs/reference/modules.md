# Add-On Modules Reference

Distilled from `BUILD_OUTLINE.md` §7 "Module Roadmap" and §14 "Add-On Module
Documentation" plus the module-flagged comments in
`packages/db/prisma/schema.prisma`. Regenerate by hand when a module ships or
the roadmap changes — treat `BUILD_OUTLINE.md` as the narrative source of
truth and this file as the compressed cross-reference.

Modules are Phase 4+, feature-flagged via `organization.active_modules` at
the API middleware layer, and gated in the UI via `<ModuleGate module="...">`.
None are built yet as standalone module logic; what exists today is (a) base
schema columns kept nullable so a module's launch doesn't require a breaking
migration, and (b) in a few cases, base-product functionality that overlaps
with what a module will later extend.

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
| 1 | Advanced Tenant Onboarding | $25–40/mo | High | `ssnFullEncrypted`, `screeningConsentAt`, `govtIdNumber`, `govtIdType` (Tenant) | Lease Mgmt, Stripe, Resend, 3rd-party screening API |
| 2 | Unit Intelligence & Appliance Registry | $20–35/mo | High | `applianceCount` (Unit) | Unit Mgmt, S3 |
| 3 | Grounds & Property Maintenance | $25–40/mo | Medium | none dedicated — reuses WorkOrder + Vendor | Work Orders, Vendor |
| 4 | Advanced Payments & Accounting | $30–50/mo | Medium | `taxParcelId` (Property) | Stripe, Payment Ledger, Owner Portal (for disbursements) |
| 5 | Vendor & Contractor Management | $20–30/mo | Medium | `w9OnFile` (Vendor) | Work Orders |
| 6 | Inspections & Compliance | $25–40/mo | Medium | `lastInspectionAt` (Unit) | Unit Mgmt, S3 |
| 7 | Lease Renewal (full negotiation flow) | $15–25/mo | Medium | none dedicated — base one-click renewal via `Lease.renewalOfLeaseId` already ships | Lease Mgmt, Messaging |
| 8 | Eviction Management | $30–50/mo | Medium | none dedicated — will use `Property.state` for jurisdiction lookup | Lease Mgmt, property jurisdiction data |
| 9 | Owner Portal | $25–40/mo | Low | **base schema already implemented**: `Owner`, `PropertyOwner`, `OwnerStatement` models + `routes/owners.ts` (see `schema.md`, `routes.md`) | Payments, Properties |
| 10 | Communications & Resident Engagement | $20–30/mo | Low | none dedicated — base one-to-one Message thread already ships | Messaging, Notifications, Twilio |
| 11 | Reporting & Analytics | $25–40/mo | Low | none dedicated — `routes/reports.ts` exists for base financial reports | All modules |

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

**Module 9 (Owner Portal)** is further along than its "Low priority,
not yet built" roadmap position suggests: `Owner`, `PropertyOwner`, and
`OwnerStatement` are full Prisma models (not just placeholder columns), and
`/organizations/:orgId/owners` and `/organizations/:orgId/reports` are live,
role-gated API routes. Verify against `BUILD_OUTLINE.md` §11/§12 (Implementation
Delta Appendix / Phase-by-Phase Status) for the latest state before assuming
it's still fully gated — this doc can drift from the build outline's own
delta tracking.
