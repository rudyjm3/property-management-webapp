# Add-On Modules Reference

Distilled from `BUILD_OUTLINE.md` §7 "Module Roadmap" and §14 "Add-On Module
Documentation" plus the module-flagged comments in
`packages/db/prisma/schema.prisma`. Regenerate by hand when a module ships or
the roadmap changes — treat `BUILD_OUTLINE.md` as the narrative source of
truth and this file as the compressed cross-reference.

Modules are Phase 4+. Per `BUILD_OUTLINE.md` §14, the plan is to feature-flag
them via an `organization.activeModules` field at the API middleware layer
and gate the UI via a `<ModuleGate module="...">` wrapper.

**As of 2026-09-18, that gating infrastructure now exists** — see "Module
gating infrastructure" below — and is wired to the two modules that had
shipped ahead of it, Module 9 (Owner Portal) and Module 11 (Reporting &
Analytics), the screening step of Module 1 (Advanced Tenant Onboarding),
Module 4 (Advanced Payments & Accounting), Module 2 (Unit Intelligence &
Appliance Registry), and now Module 6 (Inspections & Compliance), all built
across this and prior updates. No other module has functionality built
yet, so no other module needs gating today. Full Stripe Subscription Item
billing is still
not wired — see the "How activation works today" section for the interim
mechanism. What exists beyond gating is (a) base schema columns kept
nullable so a module's eventual launch doesn't require a breaking
migration, and (b) in a few cases, base-product functionality that overlaps
with what a module will later extend.

## Module gating infrastructure

- **Schema**: `Organization.activeModules` — `String[]`, default `[]`
  (`packages/db/prisma/migrations/20260917041729_add_organization_active_modules`).
  Holds module keys, defined in `packages/shared/src/constants/index.ts` as
  `MODULE_KEYS` (`owner_portal`, `reporting_analytics`,
  `advanced_tenant_onboarding`, `advanced_payments_accounting`,
  `unit_intelligence`, `inspections_compliance`) / `ALL_MODULE_KEYS`.
- **API middleware**: `requireModule(moduleKey)`
  (`apps/api/src/middleware/module-gate.ts`) — looks up the requesting org's
  `activeModules` fresh per request and returns `403 MODULE_NOT_ACTIVE` if
  the key isn't present. Resolves the org from whichever auth identity is on
  the request (`req.user`, `req.owner`, or `req.tenant`), so it chains after
  any of the three auth middlewares. Applied two ways depending on whether
  the whole router needs gating or just part of it:
  - **Router-mount gating**: in `apps/api/src/routes/index.ts`, to
    `/organizations/:orgId/owners` and `/organizations/:orgId/reports`
    (manager-facing, on top of their existing `requireRoles(['owner',
    'manager'])`) and to `/owner-portal` (owner-facing, on top of
    `requireOwnerAuth`). Module 2 (Unit Intelligence & Appliance Registry)
    uses the same pattern one level deeper in the route tree: in
    `apps/api/src/routes/units.ts`, `requireModule('unit_intelligence')` is
    applied to the whole `appliances.ts` router at its
    `/:unitId/appliances` mount (which itself nests under
    `/organizations/:orgId/properties/:propertyId/units`). Module 6
    (Inspections & Compliance) uses the identical pattern one level deeper
    at the same nesting point: `requireModule('inspections_compliance')` is
    applied to the whole `inspections.ts` router at its
    `/:unitId/inspections` mount inside `units.ts`, and separately to the
    whole `inspection-templates.ts` router at its
    `/organizations/:orgId/inspection-templates` mount in `routes/index.ts`
    (org-level checklist template CRUD, since templates aren't scoped to a
    single unit).
  - **Per-route gating**: in `apps/api/src/routes/applications.ts`, to just
    the screening endpoints (`POST`/`GET .../applications/:id/screening`)
    — the rest of that router (application links, review, e-sign) ships
    ungated as base product, so the gate is applied to those two routes
    directly rather than at the router mount. Module 4 (Advanced Payments &
    Accounting) uses the same per-route pattern in four places, since each
    lives inside a router that otherwise ships ungated or gated by a
    different module: `apps/api/src/routes/payments.ts`
    (`POST .../payments/:paymentId/initiate-card` and
    `.../record-partial`), `apps/api/src/routes/tenants-portal.ts`
    (`POST /tenant/payments/initiate-card`), `apps/api/src/routes/leases.ts`
    (`GET`/`POST .../leases/:leaseId/security-deposit-disposition`), and
    `apps/api/src/routes/owners.ts` (the three `.../disbursements` routes —
    stacked on top of that router's own `owner_portal` mount-level gate, so
    disbursements need both modules active) and
    `apps/api/src/routes/reports.ts` (`GET
    .../reports/schedule-e-export` — likewise stacked on top of that
    router's `reporting_analytics` mount-level gate). Module 6 (Inspections
    & Compliance) adds one more per-route instance: `GET
    .../leases/:leaseId/inspections/compare` in `apps/api/src/routes/leases.ts`,
    the move-in vs. move-out comparison endpoint (per-route because the rest
    of `leases.ts` is base product / gated by Module 4 instead).
  The public, unauthenticated screening-consent capture on
  `POST /apply/:token` (no `req.user`/`req.owner`/`req.tenant` to resolve an
  org from) is instead checked directly in
  `screening.service.buildScreeningConsentUpdate`, which looks up the org's
  `activeModules` itself and throws the same `403 MODULE_NOT_ACTIVE` shape.
- **Web UI**: `<ModuleGate module="...">` (`apps/web/components/ModuleGate.tsx`)
  reads `activeModules` off the org in `AuthContext` (populated by
  `GET /auth/me`) and renders `children` only if the module is active,
  otherwise a `fallback` (defaults to nothing rendered). Wraps the `/owners`
  and `/reports` manager pages, and the `Sidebar` nav items for both are
  filtered out entirely when their module isn't active. The screening step
  doesn't have its own page to wrap — it's a card inside the existing
  `/applications/:id` review page, shown/hidden by checking
  `activeModules` directly — and the public application form
  (`/apply/[token]`) shows/hides its screening step based on
  `screeningModuleActive` returned by `GET /apply/:token`. Module 4 has no
  standalone page either — its UI is wrapped into existing pages:
  `<ModuleGate>` around the "Initiate Card"/"Record Partial" buttons on
  `/payments`, around the "Disburse" action and modal in the Owner
  Statements table (inside `/reports`, statements tab), around the
  `SecurityDepositDisposition` card on the lease detail page, around the
  new "Schedule E Export" tab on `/reports` (whose own tab-visibility check
  additionally requires `reporting_analytics`, since the page itself is
  gated on that module), and around the management-fee-default field under
  Settings → Organization. Module 2 also has no standalone page — its
  "Appliances" card, its Add/Edit/QR-label controls, and the appliance
  picker on the unit detail page's "Add Work Order" modal are all wrapped
  in `<ModuleGate module="unit_intelligence">` on the existing unit detail
  page (`/properties/[id]/units/[unitId]`). Module 6 (Inspections &
  Compliance) also has no standalone page — the "Inspections" card (list +
  "Schedule Inspection") is wrapped in `<ModuleGate module=
  "inspections_compliance">` on the same unit detail page, the
  `InspectionComparison` card (move-in vs. move-out diff) is wrapped in its
  own `<ModuleGate>` and shown on the lease detail page next to
  `SecurityDepositDisposition`, and the move-out date's "schedule/view
  move-out inspection" link on that same page is likewise gated. The one
  new *page* this module adds is `/inspections/[id]` — the checklist-fill /
  photo-and-signature-capture / completion view — which isn't itself gated
  (it's only ever linked to from already-gated UI) and isn't in the sidebar
  nav, mirroring how Module 2 avoided nav complexity by keeping everything
  reachable from the unit page.
- **How activation works today**: no Stripe Subscription Item billing yet.
  Instead, `PATCH /organizations/:orgId` accepts an `activeModules` array
  (validated against `ALL_MODULE_KEYS`), settable by any `owner`/`manager` —
  exposed as checkboxes under Settings → Organization → "Add-On Modules" in
  the web app. This is a placeholder switch to make gating testable, not a
  billing decision; it should move behind an actual paid-subscription check
  once module billing ships. The seed script's demo org
  (`packages/db/prisma/seed.ts`) defaults all six gated modules to active
  so local dev/demo environments see the gated features without an extra
  step.

## Schema fields already present, dormant until their module ships

Module 1's `ssnFullEncrypted`/`screeningConsentAt`/`govtIdType`/`govtIdNumber`
on `Tenant` (and the equivalent fields added to `RentalApplication`) are no
longer dormant — they're populated whenever `advanced_tenant_onboarding` is
active, see the module table below and `schema.md`.

| Column | Table | Module | Notes |
|---|---|---|---|
| `taxParcelId` | Property | Advanced Payments & Accounting | Needed for Schedule E / tax reporting |
| `w9OnFile` | Vendor | Vendor & Contractor Mgmt (1099 reporting) | Required for contractor tax reporting |

`applianceCount` (Unit) is no longer in this table — it's populated for real
as of Module 2 (Unit Intelligence & Appliance Registry), see the module
table below. `lastInspectionAt` (Unit) is likewise no longer in this table —
it's populated for real as of Module 6 (Inspections & Compliance): set to an
`Inspection`'s `completedAt` whenever it transitions to `completed`, via a
forward-only conditional update (see `schema.md`'s Unit entry).

## Module list (priority per BUILD_OUTLINE.md §7)

| # | Module | Price | Priority | Schema hooks already in place | Depends on |
|---|---|---|---|---|---|
| 1 | Advanced Tenant Onboarding | $25–40/mo | High | `ssnFullEncrypted`, `screeningConsentAt`, `govtIdNumber`, `govtIdType` (Tenant + RentalApplication) — application form + e-signature ship ungated as base product (`routes/apply.ts`, `routes/sign.ts`, `rental-application.service.ts`); **screening step gated + shipped (2026-09-17)**: consent + encrypted SSN/govt ID capture on the application form, a `ScreeningCheck` model, manager trigger/review UI (`applications/:id`), and approve/deny driving the existing tenant+lease path. `requireModule('advanced_tenant_onboarding')` on the screening endpoints only (rest of `applications.ts` stays ungated). **TransUnion SmartMove call is mocked** (`screening-provider.client.ts`) — no credentials in any environment | Lease Mgmt, Stripe, Resend, 3rd-party screening API |
| 2 | Unit Intelligence & Appliance Registry | $20–35/mo | High | **Fully shipped (2026-09-17)**: a new `Appliance` model (`unitId` FK, category, make/model/serial, purchase/install dates, warranty expiry, `status: active\|removed`, `removedAt`, `replacesApplianceId` self-relation) with CRUD at `.../units/:unitId/appliances[/:applianceId]`, gated behind `requireModule('unit_intelligence')` at that router's mount in `units.ts`. Maintenance cost tracking reuses `WorkOrder.laborCost/partsCost/totalCost` via a new optional `WorkOrder.applianceId` FK (`ON DELETE SET NULL`) — each appliance exposes a summed `totalMaintenanceCost` and its linked-work-order history. Age-based replacement alerts are computed on read from a per-category expected-lifespan heuristic (`APPLIANCE_EXPECTED_LIFESPAN_YEARS`), not manufacturer data, and are **not** surfaced on the dashboard — only as a badge in the unit detail appliance table. QR labels are generated client-side (`qrcode` npm package, no new endpoint) and link to the unit detail page with `?appliance=<id>` — there's **no separate per-appliance detail page**. `Unit.applianceCount` is recomputed via `appliance.count()` (filtered to `status: active`) on every create/delete/retire/replace (not an in-place increment, since that column defaults to `null` and Postgres NULL-propagation would otherwise leave a naive `{ increment: 1 }` permanently null). **Appliance replacement history**: `POST .../appliances/:id/retire` marks an appliance removed (no replacement), and `POST .../appliances/:id/replace` retires the old appliance and creates a new one in one step, linked via `replacesApplianceId` — the unit page shows a "Current Appliances" section and a separate "Appliance History" section with install→removed date ranges and cross-links between an appliance and what replaced it. **Not built**: appliance photo/document attachments (no S3 hookup despite S3 being a listed dependency), manufacturer-specific lifespan/recall data. See `BUILD_OUTLINE.md` §14 Module 2 for the full breakdown. | Unit Mgmt, S3 |
| 3 | Grounds & Property Maintenance | $25–40/mo | Medium | none dedicated — reuses WorkOrder + Vendor | Work Orders, Vendor |
| 4 | Advanced Payments & Accounting | $30–50/mo | Medium | `taxParcelId` (Property) — used by the Schedule E export. **Gated + shipped (2026-09-17)**: card payments alongside ACH (`initiate-card` on both manager and tenant payment routes); partial payment recording with balance carry-forward, *manager-recorded payments only* (`Payment.record-partial`) — no partial support in the self-service ACH/card checkout flow; a `SecurityDepositDisposition` model formalizing the deposit-vs-deductions math the move-out workflow already computes (reconciled against itemized deductions; as of Module 6 shipping, also linked to the lease's completed move-in/move-out `Inspection` records when they exist, via `moveInInspectionId`/`moveOutInspectionId` — free-text condition notes remain for leases with no inspection on file); a `Disbursement` model computing a configurable management-fee deduction against an `OwnerStatement.distributionAmount` — **bookkeeping only, no payout wiring** since Owner Portal has no owner bank-account capture; a Schedule E data export (`GET /reports/schedule-e-export`) gated behind both `advanced_payments_accounting` and `reporting_analytics`. P&L by property is **not** duplicated here — see the "Notes on base-product overlap" section below for why it stays under Module 11. `requireModule('advanced_payments_accounting')` applied per-route across `payments.ts`, `tenants-portal.ts`, `leases.ts`, `owners.ts`, and `reports.ts` — see "Module gating infrastructure" above | Stripe, Payment Ledger, Owner Portal (for disbursements) |
| 5 | Vendor & Contractor Management | $20–30/mo | Medium | `w9OnFile` (Vendor) | Work Orders |
| 6 | Inspections & Compliance | $25–40/mo | Medium | `lastInspectionAt` (Unit) — no longer dormant, see above. **Gated + shipped (2026-09-18)**: an `Inspection` model (`unitId` FK, nullable `leaseId` FK, `type: move_in\|move_out\|scheduled\|annual\|semi_annual`, `status: scheduled\|in_progress\|completed\|cancelled`, `scheduledAt`/`completedAt`, nullable `inspectorUserId` FK to `User`, nullable `templateId` FK, `checklistResults: Json`, `notes`) with CRUD + schedule + assign-inspector + complete + cancel at `.../units/:unitId/inspections[/:inspectionId]`, gated behind `requireModule('inspections_compliance')` at that router's mount in `units.ts` (same pattern as Module 2's appliances). An `InspectionTemplate` model (`checklistItems: Json` array of `{section, item, description?}`) provides **real per-org stored checklist data with basic CRUD** — but v1 ships a single seeded default template (kitchen/bathrooms/bedrooms/living areas/exterior/appliances/safety devices) rather than a full property-type-aware template picker; **do not describe this as fully configurable per property type**. An `InspectionMedia` model reuses the exact `storage.service.ts` presigned-upload pattern (`Document`/`WorkOrder` photos) for photo/video attachments, with `capturedAt` always populated and `latitude`/`longitude` captured **best-effort only** via the browser Geolocation API — permission-gated, and built/tested in a non-mobile web session, so GPS population from a real device is **unverified**, not confirmed working. Signature capture uses a **typed attestation name + IP + timestamp** (mirrors `lease-esignature.service.ts`'s e-sign flow), **not** a canvas-drawn image — both tenant and manager signatures are captured on the same `/complete` request as a manager/inspector-device walkthrough, not a separate tenant-facing public signing link. Completing an inspection advances `Unit.lastInspectionAt` forward-only via a conditional `updateMany`. A move-in vs. move-out comparison endpoint (`GET .../leases/:leaseId/inspections/compare`, gated per-route in `leases.ts`) diffs the two inspections' checklist results by section+item — the basis for `SecurityDepositDisposition`'s now-real `moveInInspectionId`/`moveOutInspectionId` linkage (see Module 4's row above). PDF report generation is **client-side only** (`apps/web/lib/exportInspectionPdf.ts`, `jspdf` — the existing web dependency, no new server-side PDF library added), listing photo/video references by storage key rather than embedding images. **Not built**: a property-type-aware template picker UI, verified GPS capture from a real device, canvas-drawn signatures, and a public tenant-facing inspection-signing link. See `BUILD_OUTLINE.md` §14 Module 6 for the full breakdown. | Unit Mgmt, S3 |
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
- **Module 4 (Advanced Payments & Accounting) vs. Module 11 (Reporting &
  Analytics) — profit & loss by property**: `BUILD_OUTLINE.md` §14 lists
  "P&L reporting by property" under Module 4, but `GET
  /reports/financial-summary` already computes exactly that (income,
  expenses, NOI, and owner-share breakdown, per property) and has shipped
  under Module 11 since 2026-09-16. Building a second P&L report under
  Module 4 would just duplicate it. Decision: P&L by property **stays under
  Module 11's gate** — an org with `reporting_analytics` active but not
  `advanced_payments_accounting` still sees full P&L by property. Module 4
  only adds the tax-specific extension on top: the Schedule E export, which
  is gated behind both modules since it reuses the financial-summary
  computation *and* is itself an accounting-specific feature.

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

**Module 1 (Advanced Tenant Onboarding)** is different from 9/11 in that
its *base* functionality (the digital rental application and e-signature
flow) shipped ahead of the module too, but stays deliberately **ungated** —
it's treated as base-product leasing functionality, not part of the paid
add-on. Only the screening step added 2026-09-17 (consent capture,
encrypted SSN/govt ID, the background/credit check, and its manager
review UI) is gated behind `advanced_tenant_onboarding`, and only at the
route level for the two screening endpoints rather than at the router
mount — see "Module gating infrastructure" above. The background/credit
check provider call is mocked; see the module table above and
`BUILD_OUTLINE.md` §14 Module 1 for what's real vs. simulated.

**Module 4 (Advanced Payments & Accounting)** is unlike 1/9/11 in that none
of its functionality predates the module — card payments, partial payment
recording, security deposit disposition, disbursements, and the Schedule E
export were all built and gated in the same 2026-09-17 change, entirely
behind `requireModule('advanced_payments_accounting')` at the route level
(never at a router mount, since every router it touches is either base
product or already gated by a different module). See the module table
above and `BUILD_OUTLINE.md` §14 Module 4 for exactly what shipped vs. what
didn't (notably: no partial payments through the self-service checkout
flow, no inspection-based deposit reconciliation, and no actual owner
payout wiring behind disbursements).

**Module 2 (Unit Intelligence & Appliance Registry)** is like Module 4 in
that none of its functionality predates the module — the `Appliance` model,
its CRUD routes, `WorkOrder.applianceId`, and the unit detail page's
appliance UI were all built and gated together in this change, entirely
behind `requireModule('unit_intelligence')` applied at the `appliances.ts`
router mount (router-mount gating, like `owners`/`reports`, just one level
deeper since appliances nest under a unit under a property). See the
module table above and `BUILD_OUTLINE.md` §14 Module 2 for exactly what
shipped vs. what's simplified (notably: replacement alerts use a rough
per-category heuristic rather than manufacturer data, QR codes link to the
unit page rather than a dedicated appliance page, and there's no S3-backed
appliance photo/document attachment).

**Module 6 (Inspections & Compliance)** is like Modules 2/4 in that none of
its functionality predates the module — the `Inspection`, `InspectionMedia`,
and `InspectionTemplate` models, their routes, and the unit/lease-page UI
were all built and gated together in this change, using the same
router-mount pattern as Module 2 (see "Module gating infrastructure" above)
plus one per-route gate for the lease comparison endpoint. Three design
decisions are worth calling out precisely, since this module series has had
repeated review findings for overstating completeness: (1) **template
configurability** — `InspectionTemplate` is real per-org stored data with
CRUD, not a hardcoded checklist, but v1 ships one seeded default template
rather than a property-type-aware picker; (2) **signature mechanism** — a
typed attestation name + IP + timestamp (reusing the lease e-signature
shape), not a canvas-drawn image, captured for both tenant and manager on
the same manager/inspector-device completion request rather than over a
public tenant-facing signing link; (3) **GPS metadata** — implemented as a
best-effort, permission-gated browser Geolocation capture, but built and
only code-path-tested in a non-mobile web session, so it is **not verified**
to actually populate from a real device. The move-in vs. move-out
comparison view is the basis for `SecurityDepositDisposition`'s inspection
linkage (Module 4, see above) — the schema comment on that model has been
updated to drop the "Module 6 doesn't exist yet" language now that it does.
PDF report generation stays client-side (`jspdf`, already a web dependency)
rather than adding a server-side PDF library. See the module table above and
`BUILD_OUTLINE.md` §14 Module 6 for the full breakdown of what shipped vs.
what's simplified.
