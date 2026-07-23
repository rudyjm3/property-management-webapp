# Schema Reference

Source of truth: `packages/db/prisma/schema.prisma` (18 models, PostgreSQL).
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
- Has many: users, properties, tenants, vendors, messages, documents, notifications, ledgerEntries, rentalApplications, owners, ownerStatements

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
- Has many: units, workOrders, propertyOwners, ownerStatements

## Unit
- `id, propertyId(FK), unitNumber` — `@@unique([propertyId, unitNumber])`
- `type: UnitType?(studio|one_bed|two_bed|three_bed|four_plus_bed|commercial)`
- `bedrooms, bathrooms, sqFt?, marketRent?, rentAmount, depositAmount`
- `status: UnitStatus(vacant|occupied|notice|maintenance|unlisted)`
- `parkingSpaces[], storageUnit?`, utility meter fields (electric/gas/water)
- `applianceCount? [deferred: Unit Intelligence & Appliance Registry]`
- `lastInspectionAt? [deferred: Inspections & Compliance]`
- Has many: leases, workOrders, messages, rentalApplications

## Tenant
- `id, organizationId(FK), supabaseUserId?(unique)`
- Identity: `email, name, fullLegalName?, preferredName?, dateOfBirth?, phone?, phoneSecondary?, preferredContact?: PreferredContact(email|sms|call)`
- Screening block `[all deferred: Advanced Tenant Onboarding]`: `ssnLast4?, ssnFullEncrypted?, govtIdType?: GovernmentIdType(drivers_license|state_id|passport), govtIdNumber?, screeningConsentAt?`
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
- Review: `reviewNotes?, reviewedAt?, reviewedByUserId?, createdTenantId?` (links to the Tenant created on approval)

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
- Has many: participants (LeaseParticipant), payments

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
- `deletedAt?` (soft delete)
- Has many: ledgerEntries

## LedgerEntry
Append-only balance ledger per org.
- `id, organizationId(FK), paymentId?(FK), type: LedgerEntryType(credit|debit), amount, balanceAfter, description`
- `stripeEventId?(unique)` — idempotency key for Stripe webhook-driven entries

## WorkOrder
- `id` — nullable FKs to `unitId?, propertyId?, tenantId?, assignedToUserId?, submittedByUserId?, vendorId?` (property-level orders have no unit)
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
- Has many: workOrders

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
Property owner-of-record (distinct from manager Users). Base schema exists ahead of the "Owner Portal" module shipping — see `modules.md`.
- `id, organizationId(FK), name, email, phone?, address?, taxId?`
- Has many: propertyOwners, statements — `@@unique([organizationId, email])`

## PropertyOwner
Join table: ownership share of a Property.
- `id, propertyId(FK), ownerId(FK), ownershipPct` — `@@unique([propertyId, ownerId])`

## OwnerStatement
- `id, organizationId(FK), propertyId(FK), ownerId(FK)`
- `periodStart, periodEnd, totalIncome, totalExpenses, netOperatingIncome, distributionAmount`
- `status: OwnerStatementStatus(draft|sent)`

## Notification
In-app notification feed per User.
- `id, userId(FK), organizationId(FK), type, title, body, readAt?, actionUrl?`
