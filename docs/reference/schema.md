# Schema Reference

Source of truth: `packages/db/prisma/schema.prisma` (27 models, PostgreSQL).
Regenerate this doc by hand when the schema changes — it is a compressed
index, not a replacement for the Prisma file.

Notation: `field: Type` — `?` suffix on type = nullable. `[deferred]` marks
columns that exist now but are only populated once a listed add-on module
ships (see `modules.md`).

## Organization
Tenant-root entity; everything scopes to `organizationId`.
- `id, name, slug(unique)`
- `planTier: starter|pro|enterprise`, `subscriptionStatus: active|trialing|past_due|canceled`, `trialEndsAt?`
- Stripe billing: `stripeCustomerId?`, `stripeSubscriptionId?`
- Stripe Connect (payouts): `stripeAccountId?`, `stripeAccountStatus: not_connected|pending|active|restricted`, `stripeAccountDetailsSubmitted`
- Rent defaults: `lateFeeAmount`, `gracePeriodDays`, `rentDueDay`
- Module gating: `activeModules: String[]` (default `[]`) — module keys the org
  has active (`owner_portal`, `reporting_analytics`,
  `advanced_tenant_onboarding`, `advanced_payments_accounting`); see
  `modules.md`. No Stripe Subscription Item billing wiring yet — set today via
  `PATCH /organizations/:orgId { activeModules }` (owner/manager only) or the
  seed script's demo org default.
- `defaultManagementFeePct: Decimal` (default `10.00`) `[Advanced Payments &
  Accounting]` — org-wide default management-fee percentage applied when a
  `Disbursement` is created; overridable per-disbursement.
- Has many: users, properties, tenants, vendors, messages, documents, notifications, ledgerEntries, rentalApplications, screeningChecks, owners, ownerStatements, disbursements, securityDepositDispositions, inspections, inspectionTemplates

## User
Manager-side account (owner/manager/maintenance staff).
- `id, organizationId(FK), supabaseUserId?(unique)`
- `email, name, phone?`
- `role: UserRole(owner|manager|maintenance)`, `status: active|invited|deactivated`
- `notif*` prefs: rentOverdue, workOrder, leaseExpiry, newMessage
- FK targets: assignedOrders/submittedOrders (WorkOrder), sentMessages (Message), uploadedDocuments (Document), notifications
- `@@unique([organizationId, email])`

## Property
- `id, organizationId(FK), name, type: PropertyType(multifamily|single_family|commercial|mixed_use, + legacy apartment|condo|house)`
- `address, city, state, zip, country`
- `unitCount, amenities[], yearBuilt?`
- `taxParcelId? [deferred: Advanced Payments & Accounting]`
- `insurancePolicyNumber?, insuranceExpiresAt?`
- Has many: units, workOrders, propertyOwners, ownerStatements, inspections
  `[Grounds & Property Maintenance — property-scoped/grounds inspections only]`,
  maintenanceSchedules `[Grounds & Property Maintenance]`

## Unit
- `id, propertyId(FK), unitNumber` — `@@unique([propertyId, unitNumber])`
- `type: UnitType?(studio|one_bed|two_bed|three_bed|four_plus_bed|commercial)`
- `bedrooms, bathrooms, sqFt?, marketRent?, rentAmount, depositAmount`
- `status: UnitStatus(vacant|occupied|notice|maintenance|unlisted)`
- `parkingSpaces[], storageUnit?`, utility meter fields (electric/gas/water)
- `applianceCount?` — no longer deferred as of Unit Intelligence & Appliance
  Registry (2026-09-17): recomputed from `appliance.count()` inside the same
  transaction as every `Appliance` create/delete under this unit (not an
  in-place increment/decrement — that field defaulted to `null`, and
  Prisma's `{ increment: 1 }` compiles to `SET x = x + 1`, which stays
  `NULL` forever under Postgres NULL-propagation if never initialized).
  Still nullable for orgs that have never had `unit_intelligence` active.
- `lastInspectionAt?` — no longer deferred as of Inspections & Compliance
  (2026-09-18): set to an `Inspection`'s `completedAt` whenever it transitions
  to `completed`, via a single conditional `updateMany` (`WHERE
  lastInspectionAt IS NULL OR lastInspectionAt < :completedAt`) so it only
  ever advances forward — an older inspection completing after a newer one
  never regresses it. Still nullable for orgs that have never had
  `inspections_compliance` active or units never inspected.
- Has many: leases, workOrders, messages, rentalApplications, appliances
  `[Unit Intelligence & Appliance Registry]`, inspections
  `[Inspections & Compliance]`

## Appliance
Unit Intelligence & Appliance Registry module (gated).
- `id, unitId(FK, cascade delete with its unit)`
- `category: ApplianceCategory(hvac|water_heater|refrigerator|dishwasher|washer|dryer|oven_range|microwave|garbage_disposal|other)`, default `other`
- `status: ApplianceStatus(active|removed)`, default `active` — an appliance is
  never hard-deleted just for being replaced; it's marked `removed` and kept
  for history. `DELETE` (hard delete, regardless of status) still exists for
  correcting mistakes/duplicates.
- `make?, model?, serialNumber?`
- `purchaseDate?, installDate?, warrantyExpiresAt?, removedAt?` (all date-only)
- `replacesApplianceId? (FK to Appliance, unique, self-relation "ApplianceReplacement", ON DELETE SET NULL)` — the prior appliance this one replaced in the same slot (e.g. old dishwasher → new dishwasher). `@unique` enforces a one-to-one chain: an old appliance can be pointed to by at most one replacement. The reverse relation is `replacedBy`.
- `notes?`
- Has many: workOrders (via `WorkOrder.applianceId`, `ON DELETE SET NULL` — deleting an appliance keeps its work order history, just unlinks it)
- Replacement-alert status and maintenance cost rollup are computed at read time in `appliance.service.ts`, not persisted columns — see `modules.md`. `Unit.applianceCount` only counts `status: active` appliances.

## InspectionTemplate
Inspections & Compliance module (gated) — configurable checklist template.
- `id, organizationId(FK), name, description?`
- `checklistItems: Json` — array of `{ section, item, description? }` objects. Real per-organization stored data with basic CRUD (`inspection-template.service.ts`), not a hardcoded checklist in code — but v1 ships a single seeded default template rather than a full property-type-aware picker (see `modules.md`).
- `isDefault: Boolean` (default `false`) — at most one default per org; `GET .../inspection-templates` lazily seeds a default template the first time it's called for an org that has none.
- Has many: inspections (via `Inspection.templateId`)

## Inspection
Inspections & Compliance module (gated) — move-in/move-out/scheduled/annual/semi-annual inspection records. As of Grounds & Property Maintenance (Module 3, gated separately behind `grounds_maintenance`), also used for property-scoped common-area/grounds inspections (`type: grounds`) — see the propertyId note below.
- `id, organizationId(FK), unitId?(FK, ON DELETE RESTRICT), propertyId?(FK, ON DELETE SET NULL), leaseId?(FK)` — exactly one of `unitId`/`propertyId` is set (enforced in `inspection.service.ts`, not a DB constraint): unit-scoped for `move_in|move_out|scheduled|annual|semi_annual` (Module 6, unchanged), property-scoped for `grounds` (Module 3, new). `unitId`'s FK is explicitly `ON DELETE RESTRICT` (set via `@relation(..., onDelete: Restrict)` in the schema, since Prisma's implicit default for a now-optional relation is `SET NULL`) so a unit with unit-scoped inspections on file still can't be deleted — the same behavior Module 6 originally had, preserved despite `unitId` becoming nullable. `leaseId` only ever applies to unit-scoped inspections — nullable lease link so move-in/move-out inspections can be tied to the specific lease they're comparing for deposit purposes.
- `type: InspectionType(move_in|move_out|scheduled|annual|semi_annual|grounds)` — `grounds` added by Module 3
- `status: InspectionStatus(scheduled|in_progress|completed|cancelled)`, default `scheduled`
- `scheduledAt?, completedAt?`
- `inspectorUserId?(FK → User, "InspectionInspector")` — assigned staff inspector; a `maintenance`-role user may only complete an inspection where they're the assigned inspector (owner/manager may complete any).
- `templateId?(FK → InspectionTemplate)`
- `checklistResults: Json` (default `[]`) — array of `{ section, item, condition?, notes? }`, the filled-in checklist.
- `notes?` — overall inspection notes.
- Signature capture (typed-name attestation, mirrors `lease-esignature.service.ts` — **not** a canvas-drawn image; see `modules.md`): `tenantSignatureName?/tenantSignatureAt?/tenantSignatureIp?`, `managerSignatureName?/managerSignatureAt?/managerSignatureIp?`. Both are captured on the same `/complete` request (a manager/inspector-device walkthrough), not via a separate tenant-facing public signing link.
- Has many: media (`InspectionMedia`, cascade delete), `depositsAsMoveIn`/`depositsAsMoveOut` (`SecurityDepositDisposition`, reverse of its `moveInInspectionId`/`moveOutInspectionId`)
- Completing a unit-scoped inspection (`POST .../units/:unitId/inspections/:id/complete`) advances `Unit.lastInspectionAt` forward-only — see the Unit entry above.
- **Property-scoped (`type: grounds`) inspections** — Module 3's inspection log — are created/completed via a separate, parallel set of endpoints (`.../properties/:propertyId/inspections[/:id]`, `inspection.service.ts`'s `*PropertyInspection*` functions), not the unit-scoped functions above, since every unit-scoped function hard-requires `unitId`. They never use `leaseId`, `templateId`, `checklistResults`, or signature capture — those fields stay empty/null. Completing one (`POST .../properties/:propertyId/inspections/:id/complete`) enforces a real completion-photo requirement: it 400s with `PHOTO_REQUIRED` unless at least one `InspectionMedia` row with `mediaType: photo` already exists for that inspection. This does **not** advance `Unit.lastInspectionAt` (there is no unit).

## InspectionMedia
Photo/video documentation attached to an `Inspection`.
- `id, inspectionId(FK, cascade delete with its inspection)`
- `storageKey` — Supabase Storage key, same presigned-upload pattern as `Document`/`WorkOrder` photos (`storage.service.ts`): client requests an upload URL scoped to the inspection, uploads directly, then records the key here.
- `mediaType: InspectionMediaType(photo|video)`
- `capturedAt` — always populated (client-supplied or server `now()` fallback).
- `latitude?/longitude?: Decimal(9,6)` — **best-effort only**: populated when the browser's Geolocation API grants permission, left null otherwise. Built and code-path-tested in a non-mobile web session — not verified to actually populate from a real device; see `modules.md`.

## Tenant
- `id, organizationId(FK), supabaseUserId?(unique)`
- Identity: `email, name, fullLegalName?, preferredName?, dateOfBirth?, phone?, phoneSecondary?, preferredContact?: PreferredContact(email|sms|call)`
- Screening block `[Advanced Tenant Onboarding]`: `ssnLast4?, ssnFullEncrypted?, govtIdType?: GovernmentIdType(drivers_license|state_id|passport), govtIdNumber?, screeningConsentAt?` — populated (copied from the approved `RentalApplication`) when the org has `advanced_tenant_onboarding` active; `ssnFullEncrypted`/`govtIdNumber` are AES-256-GCM ciphertext (`encryption.service.ts`), never plaintext
- Address history: `currentAddress?, previousAddress?`
- Employment: `employerName?, employerPhone?, monthlyGrossIncome?, incomeSource?: IncomeSource(employment|self_employed|benefits|other)`
- Emergency contacts: `emergencyContactName?/Phone?` + contact1/contact2 relationship+email/phone fields
- `vehicles?: Json, pets?: Json`
- Portal: `portalStatus: PortalStatus(invited|active|never_logged_in)`, `portalInvitedAt?`, `notifPaymentConfirm?/WorkOrderUpdate?/Message?`, `expoPushToken?`
- Invite-code mobile activation: `inviteCode?(unique), inviteCodeExpiresAt?`
- Autopay: `autopayEnabled, stripeCustomerId?(unique), stripeDefaultPaymentMethodId?`
- `deletedAt?` (soft delete)
- Has many: leaseParticipants, payments, workOrders, receivedMessages
- `@@unique([organizationId, email])`

## RentalApplication
Public application-form submission before a Tenant record exists.
- `id, organizationId(FK), unitId(FK), token(unique)`
- `status: RentalApplicationStatus(pending|under_review|approved|denied|withdrawn)`
- Applicant info mirrors Tenant's identity/employment/household fields (`applicantName/Email/Phone`, `monthlyGrossIncome?`, `occupantCount`, `pets?/vehicles?: Json`)
- Consent: `consentGiven, consentIp?, consentAt?`
- Screening `[Advanced Tenant Onboarding]`: `screeningConsentAt?, screeningConsentIp?, ssnFullEncrypted?, govtIdType?: GovernmentIdType, govtIdNumber?` — captured in the same `POST /apply/:token` submission as the rest of the application, only when the org has `advanced_tenant_onboarding` active; `ssnFullEncrypted`/`govtIdNumber` are ciphertext. Copied onto the created `Tenant` on approval. Has many `screeningChecks`
- Review: `reviewNotes?, reviewedAt?, reviewedByUserId?, createdTenantId?` (links to the Tenant created on approval)

## ScreeningCheck
Background/credit check run against a `RentalApplication` (Advanced Tenant Onboarding module, gated). Never stores raw SSN/govt ID — those live only as ciphertext on `RentalApplication`/`Tenant`.
- `id, organizationId(FK), rentalApplicationId(FK)`
- `provider: ScreeningProvider(transunion_smartmove)`, `status: ScreeningStatus(pending|in_progress|completed|failed)`, `decision?: ScreeningDecision(recommend|caution|decline)`
- `providerReferenceId?, reportUrl?, errorMessage?`
- `requestedByUserId, requestedAt, completedAt?`
- Provider call is currently mocked (`screening-provider.client.ts`) — no TransUnion SmartMove credentials in any environment yet

## Lease
- `id, unitId(FK)`
- `status: LeaseStatus(draft|active|month_to_month|notice_given|expired|terminated)`, `type?: LeaseType(fixed_term|month_to_month)`
- Dates/terms: `startDate, endDate, moveInDate?, moveOutDate?, noticePeriodDays, rentAmount, rentDueDay, lateFeeAmount, lateFeeGraceDays`
- Security deposit: `depositAmount, securityDepositPaidAt?, securityDepositStatus: SecurityDepositStatus(held|partial_return|full_return|applied_to_balance), securityDepositReturnedAt?/ReturnAmount?, securityDepositDeductions?: Json`
- Utilities/addenda: `utilitiesIncluded[], hasPetAddendum, petDepositAmount?, hasParkingAddendum, parkingFee?`
- Occupancy: `occupantCount, occupantNames[]`
- E-signing: `documentUrl?, esignatureStatus: EsignatureStatus(pending|partially_signed|completed), tenantSignedAt?/managerSignedAt?, signingToken?(unique), tenant/managerSignatureName+Ip`
- Renewal chain: `renewalOfLeaseId?` (self-relation `LeaseRenewals`)
- `deletedAt?` (soft delete)
- Has many: participants (LeaseParticipant), payments; has one: securityDepositDisposition `[Advanced Payments & Accounting]`

## LeaseParticipant
Join table: which Tenants are on a Lease.
- `id, leaseId(FK), tenantId(FK), isPrimary` — `@@unique([leaseId, tenantId])`

## Payment
- `id, leaseId(FK), tenantId(FK), amount`
- `type: PaymentType(rent|deposit|late_fee|pet_deposit|parking|credit|other)`
- `status: PaymentStatus(pending|completed|failed|waived|refunded|voided)`
- `method: PaymentMethod(ach|card|check|cash|money_order|other)`
- `stripePaymentIntentId?, checkNumber?, referenceNote?`
- `dueDate, periodStart?, periodEnd?, paidAt?, voidedAt?/voidReason?`
- `isLate, lateFeeApplied, lateFeeWaived?, lateFeeWaivedReason?`
- Partial payment carry-forward `[Advanced Payments & Accounting]`:
  `originalAmount?` (the amount due before a partial payment reduced
  `amount` to what was actually received), `carriedFromPaymentId?`
  (self-relation `PaymentCarryForward` — points a carry-forward payment back
  at the original it was split from). Only populated for manually-recorded
  partial payments (`POST .../payments/:paymentId/record-partial`); the
  self-service ACH/card checkout flow always collects the full amount.
- `deletedAt?` (soft delete)
- Has many: ledgerEntries, carriedForwardPayments (self-relation)

## LedgerEntry
Append-only balance ledger per org.
- `id, organizationId(FK), paymentId?(FK), type: LedgerEntryType(credit|debit), amount, balanceAfter, description`
- `stripeEventId?(unique)` — idempotency key for Stripe webhook-driven entries

## SecurityDepositDisposition
Advanced Payments & Accounting module. Formalizes the deposit-vs-deductions
math the move-out workflow (`Lease.securityDeposit*`) already computes into
a persisted, auditable record.
- `id, organizationId(FK), leaseId(FK, unique — one disposition per lease)`
- `depositAmount, totalDeductions, returnAmount, status: SecurityDepositStatus` (same enum as `Lease.securityDepositStatus`)
- `deductions: Json` (copied from `Lease.securityDepositDeductions`)
- `moveInConditionNotes?, moveOutConditionNotes?` — manager-entered free text; kept for backward compatibility and for leases with no inspection on file
- `moveInInspectionId?(FK → Inspection, ON DELETE SET NULL), moveOutInspectionId?(FK → Inspection, ON DELETE SET NULL)` — as of Inspections & Compliance (Module 6), `reconcileSecurityDeposit` (`lease.service.ts`) looks up the lease's completed `move_in`/`move_out` inspections (if any) and links them here; the free-text notes above are never discarded even when a linked inspection exists
- `reconciledByUserId, reconciledAt`

## Disbursement
Advanced Payments & Accounting module. A bookkeeping record only — no payout
wiring to the owner's bank account (Owner Portal doesn't capture owner bank
details).
- `id, organizationId(FK), ownerStatementId(FK), ownerId(FK), propertyId(FK)`
- `grossAmount` (copied from `OwnerStatement.distributionAmount`), `managementFeePct, managementFeeAmount, netDisbursementAmount`
- `status: DisbursementStatus(pending|completed|cancelled)`, `referenceNote?, disbursedAt?`

## WorkOrder
- `id` — nullable FKs to `unitId?, propertyId?, tenantId?, assignedToUserId?, submittedByUserId?, vendorId?, applianceId?, scheduleId?` (property-level orders have no unit)
- `applianceId? [Unit Intelligence & Appliance Registry]` — optional link to a specific `Appliance`; the API verifies the appliance belongs to the *same* `unitId` as the work order (or rejects it) and property-level orders can never have one. `ON DELETE SET NULL` — deleting the appliance never deletes the work order.
- `scheduleId? (FK → MaintenanceSchedule, ON DELETE SET NULL) [Grounds & Property Maintenance]` — set when this work order was auto-generated by a `MaintenanceSchedule`'s recurrence job (`groundsMaintenanceJob.ts`) rather than created directly. The FK itself is `SET NULL` at the DB level, but `deleteMaintenanceSchedule` (`maintenance-schedule.service.ts`) refuses to delete a schedule that has generated any work orders (`400 SCHEDULE_HAS_HISTORY`) specifically so that `SET NULL` path is never hit in practice — pausing (`active: false`) is the supported way to stop a schedule without losing its history from the compliance report, which only counts work orders whose `scheduleId` is still set. When set, `scheduledAt` (below) is the schedule's due date at generation time (UTC midnight); the compliance report (`GET .../reports/grounds-maintenance-compliance`) compares `completedAt` against the *end* of that due date, not the midnight instant itself, so a same-day completion counts as on time.
- `title?, category: WorkOrderCategory(plumbing|electrical|hvac|appliance|pest|structural|cosmetic|grounds|general|other)`
- `priority: WorkOrderPriority(emergency|urgent|routine, + legacy low|normal)`
- `status: WorkOrderStatus(new_order|assigned|in_progress|pending_parts|completed|closed|cancelled)`
- `locationType?: WorkOrderLocationType(exterior|parking|roof|landscaping|common_interior|amenity|unit_interior)`
- `isCapitalProject, description`
- SLA: `slaDeadlineAt?, slaBreached`
- Access: `entryPermissionGranted, preferredContactWindow?`
- Lifecycle: `scheduledAt?, completedAt?, resolutionNotes?`
- Cost: `laborCost?, partsCost?, totalCost?, chargedToTenant?, tenantChargeAmount?`
- Media: `photosBefore[], photosAfter[], videoUrl?`
- Has many: messages

## Vendor
- `id, organizationId(FK), companyName, contactName, email, phonePrimary, phoneEmergency?`
- `specialties[], status: VendorStatus(active|inactive), preferred?, rating?`
- `licenseNumber?, licenseExpiresAt?, insuranceOnFile, insuranceExpiresAt?`
- `w9OnFile? [deferred: Vendor & Contractor Management / 1099 accounting]`
- Has many: workOrders, maintenanceSchedules `[Grounds & Property Maintenance]`

## MaintenanceSchedule
Grounds & Property Maintenance module (gated behind `grounds_maintenance`) —
the net-new piece of Module 3. Recurring task scheduling for common-area work
(landscaping, HVAC filter changes, pest control, etc); generates real
`WorkOrder` records on a fixed cadence, mirroring how `rentGenerationJob.ts`
generates monthly `Payment` records from active leases — see
`groundsMaintenanceJob.ts`.
- `id, organizationId(FK), propertyId(FK), vendorId?(FK → Vendor, ON DELETE SET NULL)` — optional preferred/default vendor, auto-assigned onto each generated `WorkOrder.vendorId`
- `title, category: WorkOrderCategory` (default `grounds`, same enum `WorkOrder.category` uses), `locationType?: WorkOrderLocationType`, `description?`
- `cadence: MaintenanceCadence(weekly|monthly|quarterly|semi_annual|annual)` — a fixed set of cadences, **not** a full cron-style recurrence-rule engine (no "every 2nd Tuesday", no custom day-of-month/interval); see `modules.md`
- `active` (default `true`) — pausing a schedule stops it from generating new work orders without losing its history or configuration
- `nextDueDate` (date-only) — the next date the recurrence job generates a `WorkOrder` for this schedule; advanced forward by `cadence` from its own previous value each time (never from "now", and clamped to the target month's last valid day rather than overflowing — e.g. a Jan 31 monthly schedule advances to Feb 28, not Mar 3), so a paused-then-reactivated schedule resumes on its original cadence alignment rather than drifting
- `lastGeneratedAt?` — timestamp of the most recent generation
- **Concurrency**: `generateWorkOrderForSchedule` (`maintenance-schedule.service.ts`) claims a due occurrence with a conditional `updateMany` (`WHERE id = :id AND nextDueDate = :theDueDateItRead`) before creating the `WorkOrder`, inside the same transaction — if two job runs or API instances race on the same schedule, the loser's update matches zero rows and it skips creating a duplicate work order for that occurrence.
- **Deletion is blocked once a schedule has generated history** (`400 SCHEDULE_HAS_HISTORY`) — `WorkOrder.scheduleId` is `ON DELETE SET NULL` at the DB level, but letting a delete through would silently drop that schedule's generated work orders out of the compliance report (which only counts work orders with `scheduleId` still set); pause (`active: false`) instead.
- Has many: workOrders (via `WorkOrder.scheduleId`)

## Message
- `id, organizationId(FK), threadId?, unitId?(FK), workOrderId?(FK)`
- `subject?, senderUserId?(FK User), recipientTenantId?(FK Tenant), body`
- Attachment: `attachmentUrl?, attachmentStorageKey?, attachmentName?, attachmentMimeType?`
- `readAt?`

## Document
- `id, organizationId(FK)`
- `entityType: DocumentEntityType(organization|property|unit|lease|tenant|work_order|vendor), entityId` — polymorphic target
- `name, storageKey, mimeType, sizeBytes, uploadedByUserId(FK User)`
- `visibleToTenant, docCategory?: DocumentCategory(lease|inspection|insurance|id|photo|other), label?`

## Owner
Property owner-of-record (distinct from manager Users). Owner Portal module (see `modules.md`) is fully shipped, including owner-facing auth.
- `id, organizationId(FK), name, email, phone?, address?, taxId?`
- Portal auth (mirrors Tenant): `supabaseUserId?(unique)`, `portalStatus: PortalStatus(invited|active|never_logged_in)`, `portalInvitedAt?`
- Has many: propertyOwners, statements — `@@unique([organizationId, email])`

## PropertyOwner
Join table: ownership share of a Property.
- `id, propertyId(FK), ownerId(FK), ownershipPct` — `@@unique([propertyId, ownerId])`

## OwnerStatement
- `id, organizationId(FK), propertyId(FK), ownerId(FK)`
- `periodStart, periodEnd, totalIncome, totalExpenses, netOperatingIncome, distributionAmount`
- `status: OwnerStatementStatus(draft|sent)`
- Has many: disbursements `[Advanced Payments & Accounting]`

## Notification
In-app notification feed per User.
- `id, userId(FK), organizationId(FK), type, title, body, readAt?, actionUrl?`

## VacancyHistory
Point-in-time vacancy snapshot, recorded on demand via `POST /reports/vacancy-history/snapshot` (Reporting & Analytics module — vacancy-rate history + market comparison).
- `id, organizationId(FK), propertyId?(FK)` — null `propertyId` is the org-wide aggregate row
- `snapshotDate, totalUnits, vacantUnits, vacancyRatePct, marketVacancyRatePct?` (manually entered, for comparison)
- `@@unique([organizationId, propertyId, snapshotDate])`

## SavedReport
A user-configured report-builder view (Reporting & Analytics module).
- `id, organizationId(FK), createdByUserId(FK User), name`
- `source` (one of: financial-summary|rent-roll|spend-by-location|vacancy-snapshot|vacancy-history), `columns: String[]`, `filters: Json`
