# PropFlow — Build Outline

This is the living technical blueprint for the PropFlow property management platform. It covers architecture decisions, data model, phased build plan, module roadmap, and screen-by-screen feature definitions.

---

## 1. Project Overview

### Mission
Build the go-to property management platform for small-to-mid apartment managers (20–300 units) — one that handles the full operational workflow without the complexity or cost of enterprise tools like AppFolio or Buildium.

### Target Personas

**Property Manager**
- Manages 1–20 properties, 20–300 units
- Currently splits work across multiple tools (spreadsheet for rents, email for maintenance, paper for appliances)
- Needs one place to check every morning: who paid, what's broken, what lease is expiring

**Tenant**
- Rents an apartment unit
- Wants to pay rent from their phone, submit maintenance with a photo, and not have to call the office

### Business Model
- SaaS, monthly subscription
- Base app + optional add-on modules
- Tiered pricing: flat rate for small portfolios, per-unit above threshold
- Revenue streams: subscription fees + ACH/card payment processing margin

### MVP Success Criteria
A manager can: create an organization, add a property with units, invite tenants, collect ACH rent, and receive a work order submission — all in under 30 minutes from sign-up.

---

## 2. Tech Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Manager Web App | Next.js (App Router) | 14+ | SSR performance, file-based routing, React ecosystem |
| Tenant Mobile App | React Native (Expo) | SDK 51+ | Single codebase for iOS + Android, shared types with web |
| Backend API | Node.js + Express | Node 20 LTS | Real-time capability (WebSocket), JS across full stack |
| Primary Database | PostgreSQL | 15 | ACID compliance, relational integrity for financial data |
| Cache / Sessions | Redis | 7 | Session tokens, notification queuing, rate limiting |
| Auth | Supabase Auth | Latest | Managed JWT auth, row-level security, no custom auth risk |
| ORM | Prisma | 5+ | Type-safe queries, migration management, schema as code |
| Payments | Stripe | Latest API | ACH bank transfers, card payments, webhook events |
| File Storage | AWS S3 | - | Presigned URL upload pattern, cost-effective at scale |
| Email | Resend | - | Developer-friendly, reliable transactional delivery |
| SMS | Twilio | - | Programmatic SMS for rent and maintenance alerts |
| Hosting (staging) | Vercel + Railway | - | Zero-config CI/CD, easy environment management |
| Monorepo | Turborepo | Latest | Parallel task execution, shared packages, build caching |

### Third-Party Accounts Needed Before Development
- [ ] Supabase project (free tier to start)
- [ ] Stripe account (test mode)
- [ ] AWS account + S3 bucket
- [ ] Resend account
- [ ] Twilio account
- [ ] Vercel account
- [ ] Railway account

---

## 3. Monorepo Structure

```
property-management-webapp/
├── apps/
│   ├── web/                  # Next.js 14 — manager dashboard
│   │   ├── app/              # App Router pages and layouts
│   │   ├── components/       # Page-specific components
│   │   └── lib/              # API client, utilities
│   │
│   ├── api/                  # Node.js REST + WebSocket API
│   │   ├── src/
│   │   │   ├── routes/       # Express route handlers
│   │   │   ├── middleware/   # Auth, org isolation, validation
│   │   │   ├── services/     # Business logic layer
│   │   │   └── webhooks/     # Stripe + external event handlers
│   │   └── tests/
│   │
│   └── mobile/               # Expo React Native — tenant app
│       ├── app/              # Expo Router screens
│       ├── components/
│       └── lib/
│
├── packages/
│   ├── db/                   # Prisma schema + migrations + seed
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── seed.ts
│   │
│   ├── shared/               # Shared across apps
│   │   ├── types/            # TypeScript interfaces (User, Unit, Lease, etc.)
│   │   ├── validators/       # Zod schemas for API validation
│   │   └── constants/        # Enums, config constants
│   │
│   └── ui/                   # Shared component library (Phase 2+)
│
├── docs/
├── .env.example
├── .gitignore
├── BUILD_OUTLINE.md
├── CONTRIBUTING.md
├── README.md
├── docker-compose.yml
├── turbo.json
└── package.json
```

---

## 4. Data Model

### Entity Hierarchy

Every piece of data in the system flows from this hierarchy:

```
Organization (Management company or individual landlord)
  ├── Users (team members with roles)
  ├── Vendors (external contractors assigned to work orders)
  ├── Properties (physical addresses)
  │   └── Units (individual rentable apartments)
  │       ├── Leases (time-bounded rental contracts)
  │       │   └── LeaseParticipants (tenants on a lease)
  │       ├── WorkOrders (maintenance requests — also at property level)
  │       └── Documents (photos, inspection reports)
  ├── Tenants (user accounts, linked to units via leases)
  ├── Payments (financial ledger entries)
  ├── Messages (manager ↔ tenant threads)
  ├── Documents (polymorphic — attached to any entity)
  └── Notifications (user-targeted system alerts)
```

### Multi-Tenancy Pattern
Every manager-facing query must filter by `organization_id`. This is enforced at the API middleware layer (not just ORM) — every protected route validates that the requesting user belongs to the organization being queried.

### Key Entities

> **Status legend:** **Required** = must be present at creation. *Optional* = collected when available. `Module` = nullable column added now, populated when the module ships.

---

**Organization** — Top-level account (management company or individual landlord)

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | Primary key |
| `name` | string | **Required** | Company or owner name |
| `slug` | string | **Required** | URL-safe identifier |
| `logo_url` | string | *Optional* | Uploaded logo for branding |
| `email` | string | **Required** | Primary contact email |
| `phone` | string | **Required** | Primary contact phone |
| `timezone` | string | **Required** | Defaults all date/time display |
| `date_format` | enum | *Optional* | `MM/DD/YYYY` or `DD/MM/YYYY` |
| `plan_tier` | enum | **Required** | `starter / pro / enterprise` |
| `stripe_customer_id` | string | **Required** | Stripe billing reference |
| `stripe_subscription_id` | string | **Required** | Active subscription ID |
| `subscription_status` | enum | **Required** | `active / trialing / past_due / canceled` |
| `trial_ends_at` | timestamp | *Optional* | Null if not on trial |
| `late_fee_amount` | decimal | **Required** | Default late fee — overridable per lease |
| `grace_period_days` | integer | **Required** | Days after due date before late fee applies |
| `rent_due_day` | integer | **Required** | Day of month rent is due (e.g. 1) |
| `created_at` | timestamp | **Required** | |

---

**User** — Staff accounts (managers, admins, maintenance workers — not tenants)

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `organization_id` | UUID FK | **Required** | Links to Organization |
| `name` | string | **Required** | Display name |
| `email` | string | **Required** | Used for login and notifications |
| `phone` | string | *Optional* | For urgent maintenance alerts |
| `avatar_url` | string | *Optional* | |
| `role` | enum | **Required** | `owner / manager / maintenance` |
| `status` | enum | **Required** | `active / invited / deactivated` |
| `invited_at` | timestamp | **Required** | |
| `last_login_at` | timestamp | *Optional* | Useful for audit trail |
| `notif_rent_overdue` | enum | *Optional* | `email / in_app / both / none` |
| `notif_work_order` | enum | *Optional* | `email / in_app / both / none` |
| `notif_lease_expiry` | enum | *Optional* | `email / in_app / both / none` |
| `notif_new_message` | enum | *Optional* | `email / in_app / both / none` |
| `created_at` | timestamp | **Required** | |

Index: `organization_id`

---

**Property** — A physical address containing one or more units

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `organization_id` | UUID FK | **Required** | |
| `name` | string | **Required** | Display name, e.g. Elm Street Apartments |
| `type` | enum | **Required** | `multifamily / single_family / commercial / mixed_use` |
| `address` | string | **Required** | Street address |
| `city` | string | **Required** | |
| `state` | string | **Required** | 2-letter state code — drives compliance rules |
| `zip` | string | **Required** | |
| `country` | string | **Required** | Default `US` |
| `jurisdiction_notes` | text | *Optional* | Free-text field for local ordinance notes |
| `year_built` | integer | *Optional* | Useful for maintenance context |
| `unit_count` | integer | **Required** | Computed or manually set |
| `amenities` | string[] | *Optional* | Pool, gym, laundry, etc. |
| `photo_url` | string | *Optional* | |
| `notes` | text | *Optional* | |
| `tax_parcel_id` | string | `Module` | Accounting module |
| `insurance_policy_number` | string | `Module` | Insurance module |
| `insurance_expires_at` | date | `Module` | Insurance module |
| `created_at` | timestamp | **Required** | |
| `updated_at` | timestamp | **Required** | |

Index: `organization_id`

> **Critical:** The `state` field is the jurisdiction hook that everything in the compliance modules hangs on — rent control rules, security deposit limits, required notice periods, and habitability standards all vary by state. Capture it accurately from day one.

---

**Unit** — An individual rentable space within a property

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `property_id` | UUID FK | **Required** | |
| `unit_number` | string | **Required** | e.g. 4B, 101, Upper |
| `floor` | integer | *Optional* | |
| `type` | enum | **Required** | `studio / 1br / 2br / 3br / 4br+ / commercial` |
| `bedrooms` | integer | **Required** | |
| `bathrooms` | decimal | **Required** | 1.5 = one full + one half bath |
| `sq_ft` | integer | *Optional* | |
| `status` | enum | **Required** | `occupied / vacant / notice / maintenance / unlisted` |
| `market_rent` | decimal | **Required** | What the unit should rent for |
| `rent_amount` | decimal | **Required** | What the current lease charges — may differ from market_rent |
| `deposit_amount` | decimal | **Required** | |
| `available_date` | date | *Optional* | When unit will be ready if vacant |
| `parking_spaces` | string[] | *Optional* | e.g. `['P12', 'P13']` |
| `storage_unit` | string | *Optional* | |
| `utility_meter_electric` | string | *Optional* | Meter number |
| `utility_meter_gas` | string | *Optional* | Meter number |
| `utility_meter_water` | string | *Optional* | Meter number |
| `address` | string | *Optional* | Address override if different from property |
| `city` | string | *Optional* | Address override |
| `state` | string | *Optional* | Address override |
| `zip` | string | *Optional* | Address override |
| `notes` | text | *Optional* | |
| `last_inspection_at` | timestamp | `Module` | Updated by Inspections module |
| `last_renovation_at` | date | *Optional* | |
| `appliance_count` | integer | `Module` | Maintained by Unit Intelligence module |
| `created_at` | timestamp | **Required** | |
| `updated_at` | timestamp | **Required** | |

Index: `property_id, status`

---

**Tenant** — A person who rents or has rented a unit (separate from their lease record)

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `organization_id` | UUID FK | **Required** | |
| **Identity** | | | |
| `full_legal_name` | string | **Required** | Used on lease documents — not a display name |
| `preferred_name` | string | *Optional* | What to call them day-to-day |
| `date_of_birth` | date | **Required** | Required for background/credit screening |
| `email` | string | **Required** | Portal login and notifications |
| `phone_primary` | string | **Required** | |
| `phone_secondary` | string | *Optional* | |
| `preferred_contact` | enum | *Optional* | `email / sms / call` |
| `language_preference` | string | *Optional* | ISO code, e.g. `en / es` — for future i18n |
| `avatar_url` | string | *Optional* | |
| **Screening Data** | | | |
| `ssn_last4` | string | **Required** | Minimum for identity confirmation |
| `ssn_full_encrypted` | string | `Module` | Full SSN — Screening module only, encrypted at rest |
| `govt_id_type` | enum | *Optional* | `drivers_license / state_id / passport` |
| `govt_id_number` | string | `Module` | Store encrypted — Screening module |
| `screening_consent_at` | timestamp | `Module` | Legally required before running a credit/background check |
| **Address History** | | | |
| `current_address` | string | **Required** | Where they live before moving in |
| `previous_address` | string | *Optional* | One prior address minimum for screening |
| **Employment & Income** | | | |
| `employer_name` | string | *Optional* | Collected during application |
| `employer_phone` | string | *Optional* | |
| `monthly_gross_income` | decimal | *Optional* | Used to verify rent-to-income ratio (standard: rent ≤ 30% of gross) |
| `income_source` | enum | *Optional* | `employment / self_employed / benefits / other` |
| **Emergency Contacts** | | | |
| `emergency_contact_1_name` | string | **Required** | |
| `emergency_contact_1_phone` | string | **Required** | |
| `emergency_contact_1_relationship` | string | **Required** | |
| `emergency_contact_1_email` | string | *Optional* | |
| `emergency_contact_2_name` | string | *Optional* | Second contact strongly recommended |
| `emergency_contact_2_phone` | string | *Optional* | |
| `emergency_contact_2_relationship` | string | *Optional* | |
| **Vehicles & Pets** | | | |
| `vehicles` | JSONB | *Optional* | Array: `{make, model, color, plate, state}` |
| `pets` | JSONB | *Optional* | Array: `{type, breed, weight, name}` |
| **Portal** | | | |
| `portal_status` | enum | **Required** | `invited / active / never_logged_in` |
| `portal_invited_at` | timestamp | **Required** | |
| `notif_payment_confirm` | enum | *Optional* | `email / push / both` |
| `notif_work_order_update` | enum | *Optional* | `email / push / both` |
| `notif_message` | enum | *Optional* | `email / push / both` |
| `created_at` | timestamp | **Required** | |
| `updated_at` | timestamp | **Required** | |

Index: `organization_id, email`

> **Why `date_of_birth` is Required:** It's not about age — background screening services like TransUnion SmartMove legally require it to run a check. Without it, the Screening module cannot ship without a painful migration.

> **Why JSONB for vehicles and pets:** Rather than separate tables for a small list of attributes, structured JSON in Postgres keeps the schema clean while still being queryable. When the Parking module ships, vehicles can be promoted to their own table without data loss.

---

**Lease** — One lease per occupancy period. A unit can have many leases over time.

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `unit_id` | UUID FK | **Required** | |
| `status` | enum | **Required** | `draft / active / month_to_month / notice_given / expired / terminated` |
| `type` | enum | **Required** | `fixed_term / month_to_month` |
| **Dates & Terms** | | | |
| `start_date` | date | **Required** | |
| `end_date` | date | **Required** | Null if month-to-month |
| `move_in_date` | date | **Required** | May differ from lease start date |
| `move_out_date` | date | *Optional* | Populated at move-out |
| `notice_period_days` | integer | **Required** | Days notice required to vacate |
| `rent_amount` | decimal | **Required** | Monthly rent for this lease |
| `rent_due_day` | integer | **Required** | Overrides organization default |
| `grace_period_days` | integer | **Required** | Overrides organization default |
| `late_fee_amount` | decimal | **Required** | Overrides organization default |
| **Security Deposit** | | | |
| `deposit_amount` | decimal | **Required** | |
| `security_deposit_paid_at` | date | **Required** | |
| `security_deposit_status` | enum | **Required** | `held / partial_return / full_return / applied_to_balance` |
| `security_deposit_returned_at` | date | *Optional* | Populated at move-out |
| `security_deposit_return_amount` | decimal | *Optional* | |
| `security_deposit_deductions` | JSONB | *Optional* | Itemized deductions with amounts and reasons |
| **Utilities & Addenda** | | | |
| `utilities_included` | string[] | *Optional* | `water / gas / electric / trash` |
| `has_pet_addendum` | boolean | *Optional* | |
| `pet_deposit_amount` | decimal | *Optional* | |
| `has_parking_addendum` | boolean | *Optional* | |
| `parking_fee` | decimal | *Optional* | |
| **Occupancy** | | | |
| `occupant_count` | integer | **Required** | Total number of people living in unit |
| `occupant_names` | string[] | *Optional* | Including minors — for headcount compliance |
| **Documents & Signing** | | | |
| `document_url` | string | **Required** | S3 path to signed lease PDF |
| `esignature_status` | enum | **Required** | `pending / partially_signed / completed` |
| `tenant_signed_at` | timestamp | *Optional* | |
| `manager_signed_at` | timestamp | *Optional* | |
| `renewal_of_lease_id` | UUID FK | *Optional* | Links to prior lease if this is a renewal |
| `notes` | text | *Optional* | |
| `created_at` | timestamp | **Required** | |
| `updated_at` | timestamp | **Required** | |

Index: `unit_id, status, end_date`

> **Key structural decision:** The Lease is its own table, not part of the Tenant. A tenant can renew (multiple leases, same unit), transfer (same tenant, different unit), or co-sign (multiple tenants, one lease). Collapsing lease data into the tenant record is the most common early mistake and causes real pain at scale.

---

**LeaseParticipant** — Junction table linking tenants to a lease

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `lease_id` | UUID FK | **Required** | |
| `tenant_id` | UUID FK | **Required** | |
| `is_primary` | boolean | **Required** | One primary leaseholder per lease |

---

**Payment** — All money movements (rent, fees, deposits). One record per transaction.

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `lease_id` | UUID FK | **Required** | |
| `tenant_id` | UUID FK | **Required** | |
| `amount` | decimal | **Required** | |
| `type` | enum | **Required** | `rent / late_fee / deposit / pet_deposit / parking / credit / other` |
| `status` | enum | **Required** | `pending / completed / failed / waived / refunded` |
| **Timing** | | | |
| `due_date` | date | **Required** | |
| `paid_at` | timestamp | *Optional* | Null until payment clears |
| `period_start` | date | **Required** | First day of the period this payment covers |
| `period_end` | date | **Required** | Last day of the period |
| **Payment Method** | | | |
| `method` | enum | **Required** | `ach / card / check / cash / money_order / other` |
| `stripe_payment_intent_id` | string | *Optional* | Null for offline payments |
| `check_number` | string | *Optional* | For check payments |
| `reference_note` | string | *Optional* | Manager notes on manual payments |
| **Late Fees** | | | |
| `is_late` | boolean | **Required** | Auto-set by system |
| `late_fee_applied` | boolean | **Required** | |
| `late_fee_waived` | boolean | *Optional* | Manager can override |
| `late_fee_waived_reason` | string | *Optional* | |
| `notes` | text | *Optional* | |
| `created_at` | timestamp | **Required** | |

Index: `lease_id, status, due_date`

---

**WorkOrder** — Maintenance requests submitted by tenants or initiated by managers

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `unit_id` | UUID FK | **Required** | |
| `property_id` | UUID FK | **Required** | Enables property-level (common area) work orders |
| `submitted_by_tenant_id` | UUID FK | *Optional* | Null if manager-initiated |
| `submitted_by_user_id` | UUID FK | *Optional* | Null if tenant-submitted |
| `assigned_to_user_id` | UUID FK | *Optional* | Internal staff if assigned |
| `vendor_id` | UUID FK | *Optional* | External contractor if assigned |
| `title` | string | **Required** | Short description |
| `description` | text | **Required** | Full details from submitter |
| `category` | enum | **Required** | `plumbing / electrical / hvac / appliance / pest / structural / cosmetic / grounds / other` |
| **Priority & Status** | | | |
| `priority` | enum | **Required** | `emergency / urgent / routine` |
| `status` | enum | **Required** | `open / assigned / in_progress / pending_parts / completed / closed / cancelled` |
| `sla_deadline_at` | timestamp | **Required** | Auto-computed from priority at creation |
| `sla_breached` | boolean | **Required** | Auto-set if deadline passes without completion |
| **Access & Scheduling** | | | |
| `entry_permission_granted` | boolean | **Required** | Has tenant authorized entry without being present |
| `preferred_contact_window` | string | *Optional* | e.g. Weekdays 9am–5pm |
| `scheduled_at` | timestamp | *Optional* | |
| **Completion & Cost** | | | |
| `completed_at` | timestamp | *Optional* | |
| `resolution_notes` | text | *Optional* | What was done |
| `labor_cost` | decimal | *Optional* | |
| `parts_cost` | decimal | *Optional* | |
| `total_cost` | decimal | *Optional* | Computed: labor + parts |
| `charged_to_tenant` | boolean | *Optional* | |
| `tenant_charge_amount` | decimal | *Optional* | |
| **Media** | | | |
| `photos_before` | string[] | *Optional* | S3 URLs |
| `photos_after` | string[] | *Optional* | S3 URLs |
| `video_url` | string | *Optional* | Tenant-submitted video |
| `created_at` | timestamp | **Required** | |
| `updated_at` | timestamp | **Required** | |

Index: `unit_id, status, priority, created_at`

---

**Vendor** — External contractors and service providers assigned to work orders

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `organization_id` | UUID FK | **Required** | |
| **Identity** | | | |
| `company_name` | string | **Required** | |
| `contact_name` | string | **Required** | Primary contact person |
| `email` | string | **Required** | |
| `phone_primary` | string | **Required** | |
| `phone_emergency` | string | *Optional* | For after-hours emergency call-outs |
| **Specialty & Status** | | | |
| `specialties` | string[] | **Required** | `plumbing / electrical / hvac / general / etc.` |
| `status` | enum | **Required** | `active / inactive` |
| `preferred` | boolean | *Optional* | Flag for go-to vendor by category |
| `rating` | decimal | *Optional* | Internal 1–5 rating |
| `notes` | text | *Optional* | |
| **Compliance** | | | |
| `license_number` | string | *Optional* | |
| `license_expires_at` | date | *Optional* | Expiry alert hook |
| `insurance_on_file` | boolean | **Required** | Flag — actual doc stored in Documents table |
| `insurance_expires_at` | date | *Optional* | Expiry alert hook |
| `w9_on_file` | boolean | `Module` | Needed for Accounting/1099 module |
| `created_at` | timestamp | **Required** | |
| `updated_at` | timestamp | **Required** | |

Index: `organization_id`

---

**Message** — In-app communication threads between manager and tenant

*Thread record:*

| Field | Type | Status | Notes |
|---|---|---|---|
| `thread_id` | UUID | **Required** | Groups messages into a conversation |
| `unit_id` | UUID FK | **Required** | Thread tied to a unit for context |
| `lease_id` | UUID FK | *Optional* | |
| `work_order_id` | UUID FK | *Optional* | Null unless thread is about a work order |
| `subject` | string | *Optional* | Optional thread subject line |

*Message record:*

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `thread_id` | UUID FK | **Required** | |
| `sender_tenant_id` | UUID FK | *Optional* | Null if sent by staff |
| `sender_user_id` | UUID FK | *Optional* | Null if sent by tenant |
| `body` | text | **Required** | |
| `attachments` | string[] | *Optional* | S3 URLs |
| `sent_at` | timestamp | **Required** | |
| `read_at` | timestamp | *Optional* | Null until recipient opens it |

---

**Document** — Files attached to any entity (leases, insurance certs, inspection photos, etc.)

| Field | Type | Status | Notes |
|---|---|---|---|
| `id` | UUID | **Required** | |
| `organization_id` | UUID FK | **Required** | |
| `file_name` | string | **Required** | Original filename |
| `file_url` | string | **Required** | S3 path |
| `file_type` | string | **Required** | MIME type |
| `file_size_bytes` | integer | **Required** | |
| `uploaded_by_user_id` | UUID FK | *Optional* | Null if system-generated |
| `uploaded_at` | timestamp | **Required** | |
| `entity_type` | enum | **Required** | `lease / unit / tenant / property / work_order / vendor` |
| `entity_id` | UUID | **Required** | FK to whichever entity this belongs to |
| `doc_category` | enum | *Optional* | `lease / inspection / insurance / id / photo / other` |
| `label` | string | *Optional* | Human-readable label |
| `visible_to_tenant` | boolean | **Required** | Controls whether tenant portal can see this file |

Index: `organization_id, entity_type, entity_id`

> **Polymorphic association pattern:** `entity_type + entity_id` lets one table hold files for leases, units, vendors, work orders, and tenants without needing a separate documents table for each. File management stays centralized.

---

**Notification** — User-targeted system alerts

`id, user_id, type, title, body, read_at, action_url, created_at`

Index: `user_id, read_at`

### Soft Deletes
Tenants, Leases, and Payments use soft deletes (`deleted_at` nullable timestamp) rather than hard deletes. This preserves financial history and prevents referential integrity issues.

---

## 5. Standard Operating Procedures

Beyond data fields, real-world property management requires the system to guide workflows. The base product must enforce these procedural flows.

### Move-In Process
1. Application submitted → screening triggered → approved/denied
2. Lease generated with correct dates and terms
3. Security deposit payment collected and recorded
4. Move-in inspection completed with timestamped photos
5. Keys issued — logged with date
6. Tenant portal invitation sent
7. First rent payment confirmed

### Move-Out Process
1. Notice to vacate received and logged (with date — notice period compliance tracked)
2. Move-out inspection scheduled and completed
3. Move-out inspection compared against move-in inspection
4. Security deposit disposition calculated (full return, partial, or none — with itemized reasons)
5. Security deposit returned within state-mandated timeframe — **app flags the deadline automatically**
6. Unit status set to vacant and available

### Rent Collection Workflow
1. Rent due date triggers reminder to tenant (configurable days before)
2. Grace period tracked per lease (overrides org default)
3. Late fee auto-applied after grace period — or flagged for manual application
4. Day 5, 10, 15 escalation alerts surfaced to manager
5. Pay-or-quit notice workflow — add-on module candidate (requires jurisdiction data)

### Maintenance Response SLAs
The system auto-computes `sla_deadline_at` on work order creation and tracks whether SLAs are met. Breaches surface on the dashboard.

| Priority | SLA | Trigger Examples |
|---|---|---|
| Emergency | Escalated within 1 hour | No heat, flooding, no hot water, gas leak |
| Urgent | Response within 24 hours | Broken appliance, no AC in summer |
| Routine | Acknowledged 48hr, scheduled within 7 days | Cosmetic repairs, minor plumbing |

---

## 6. Phased Build Plan

> **Note on schema:** The expanded Tenant and Lease schemas (Section 4) should be fully reflected in the Prisma schema, seed data, and Zod validators from Week 1 of Phase 1 — not incrementally. Adding nullable module-flagged columns now costs nothing and prevents breaking migrations later.

### Phase 1 — Foundation (Months 1–3)
**Goal:** A manager can log in, add properties and units, add tenants with leases, and manually record a rent payment. The app becomes the system of record.

| Week | Milestone |
|---|---|
| 1–2 | Monorepo scaffold, Prisma schema v1 (full expanded schema), Supabase Auth working, CI pipeline (GitHub Actions) |
| 3–4 | Property + Unit CRUD — API routes + web UI |
| 5–6 | Tenant + Lease CRUD — API routes + web UI |
| 7–8 | Manual payment logging, basic dashboard with KPI widgets |
| 9–10 | Email notifications via Resend (rent reminders, lease expiry alerts) |
| 11–12 | Document upload to S3, QA, staging deploy |

**Deliverable:** Internal demo-ready. Manager can populate their full portfolio.

### Phase 2 — Core Workflows (Months 3–5)
**Goal:** Money moves through the platform. Maintenance is tracked. Manager and tenant can communicate.

| Week | Milestone |
|---|---|
| 13–14 | Stripe Connect onboarding for manager bank accounts |
| 15–16 | ACH payment initiation + Stripe webhook handling + ledger updates |
| 17–18 | Work order creation flow (manager + tenant-facing web) |
| 19–20 | Work order assignment, status updates, SLA tracking, notifications |
| 21–22 | In-app messaging (REST polling first, WebSocket in Phase 3) |
| 23–24 | Late fee automation, payment reminders, QA |

**Deliverable:** First paying customer can go live.

### Phase 3 — Tenant Mobile App (Months 5–7)
**Goal:** Tenants can do everything from their phone.

| Week | Milestone |
|---|---|
| 25–26 | Expo app scaffold — auth, home screen, pay rent |
| 27–28 | Work order submission with photo upload |
| 29–30 | Messaging, push notifications (Expo + APNs/FCM) |
| 31–32 | Lease documents, payment history, profile |
| 33–34 | Settings + admin screens, renewal workflow |
| 35–36 | App store submission prep, QA |

**Deliverable:** Tenant app live on iOS and Android.

### Phase 4 — First Add-on Module (Months 7–9)
**Goal:** First module generating upsell revenue.

Decision checkpoint at end of Phase 3: let early user feedback determine which module to build first. Leading candidates:
- **Unit Intelligence & Appliance Registry** — strongest differentiator, nothing like it in market
- **Advanced Tenant Onboarding** — high demand from managers still doing paper applications

Module architecture:
- Feature-flagged at API middleware (check `organization.active_modules` array)
- Billed as additional Stripe Subscription Items
- UI components behind `<ModuleGate module="unit_intelligence">` wrapper

---

## 7. Module Roadmap

| Module | Target Price | Key Features | Priority | Dependencies |
|---|---|---|---|---|
| Advanced Tenant Onboarding | $25–40/mo | Digital application, background/credit check (TransUnion), e-lease signing, move-in inspection with photos | High | Lease Mgmt, Stripe, Resend |
| Unit Intelligence & Appliance Registry | $20–35/mo | Per-unit appliance records (make/model/serial/warranty), maintenance cost tracking, age-based replacement alerts, QR code labels | High | Unit Mgmt, S3 |
| Grounds & Property Maintenance | $25–40/mo | Recurring task scheduling for common areas, vendor assignment, inspection logs, completion photo | Medium | Work Orders, Vendor |
| Advanced Payments & Accounting | $30–50/mo | Card payments, partial payments, security deposit reconciliation, owner disbursements, P&L by property, Schedule E export | Medium | Stripe, Payment Ledger |
| Vendor & Contractor Management | $20–30/mo | Vendor database, license/insurance expiry alerts, work history, ratings, preferred vendor by property | Medium | Work Orders |
| Inspections & Compliance | $25–40/mo | Move-in/out templates, scheduled inspections, photo/video docs, digital signature, automated reports | Medium | Unit Mgmt, S3 |
| Lease Renewal | $15–25/mo | Renewal offer tracking, rent increase history, market rate comparison, countersignature workflow | Medium | Lease Mgmt |
| Eviction Management | $30–50/mo | Notice type tracking (pay-or-quit, cure-or-quit, unconditional quit), delivery method logging (certified mail, personal service, posting), court date tracking, jurisdiction-specific notice period lookup | Medium | Lease Mgmt, Property jurisdiction data |
| Owner Portal | $25–40/mo | Owner entity above property level, ownership percentage for co-owned properties, distribution/disbursement records, owner-facing reporting | Low | Payments, Properties |
| Communications & Resident Engagement | $20–30/mo | Bulk messaging, automated notices, SMS integration, community bulletin board, resident satisfaction surveys | Low | Messaging, Notifications |
| Reporting & Analytics | $25–40/mo | Custom reports, portfolio performance trends, maintenance spend by unit, rent roll, vacancy rate history | Low | All modules |

### Module Data Hooks — Build Now, Use Later

These nullable columns must exist in the base schema from day one. Adding them costs nothing. Not adding them forces a breaking migration when the module ships.

| Column | Table | Used By | Notes |
|---|---|---|---|
| `ssn_full_encrypted` | Tenant | Screening module | Encrypted at rest — never logged or exposed |
| `screening_consent_at` | Tenant | Screening module | Legally required before running any check |
| `govt_id_number` | Tenant | Screening module | Store encrypted |
| `tax_parcel_id` | Property | Accounting module | Needed for Schedule E and tax reporting |
| `appliance_count` | Unit | Unit Intelligence module | Maintained by module, surfaced on unit detail |
| `last_inspection_at` | Unit | Inspections module | Timestamp of last inspection — any type |
| `w9_on_file` | Vendor | Accounting / 1099 module | Required for contractor tax reporting |

---

## 8. Screen-by-Screen Feature List

### Manager Web App (Next.js)

**Auth**
- `/login` — Email/password + Google SSO via Supabase
- `/signup` — Create org account, choose plan
- `/forgot-password` — Password reset email
- `/onboarding` — Multi-step wizard: org name, logo, billing, first property

**Dashboard**
- `/dashboard` — KPI widgets: total units, occupancy %, rent collected this month vs expected, open work orders count, SLA breaches, leases expiring in 30/60 days, recent messages. All widgets are clickable.

**Properties**
- `/properties` — Card grid of all properties, add property button
- `/properties/[id]` — Property detail: unit grid (vacant/occupied color-coded), occupancy stats, property-level docs
- `/properties/[id]/units/[unitId]` — **Core screen.** Current tenant + lease summary, rent status, last 5 work orders, appliances (base list), documents, notes. Action buttons: Add Work Order, Message Tenant, View Lease.

**Tenants**
- `/tenants` — Searchable list. Filter by: late on rent, lease expiring, open work orders. Columns: name, unit, property, lease end, payment status.
- `/tenants/[id]` — Profile: contact info, current lease, payment history (6 months), work order history, message thread, documents, move-out section.
- `/tenants/invite` — Select property + unit, enter email, set lease terms. System sends invite link.

**Leases**
- `/leases` — List with expiration color coding (green 6mo+, yellow 60–90 days, red under 60 days)
- `/leases/[id]` — Terms, parties, rent schedule, attached document, renewal status. One-click renewal action.

**Payments**
- `/payments` — Full ledger: all payments across all units. Filter by property/unit/tenant/date/status.
- `/payments/new` — Manual payment entry form.

**Work Orders**
- `/work-orders` — Table view with status filters (New, Assigned, In Progress, Completed). SLA breach flag on overdue items.
- `/work-orders/[id]` — Description, photos, category, priority, assigned to, vendor, status timeline with timestamps, SLA status, manager notes, resolution notes, cost breakdown.

**Messages**
- `/messages` — Conversation list, unread badges
- `/messages/[threadId]` — Full thread with tenant, file attachment support

**Documents**
- `/documents` — Browse by property/unit/tenant/type. Upload button.

**Notifications**
- `/notifications` — Full history. Grouped by date. Mark all read.

**Settings**
- `/settings/organization` — Name, logo, contact info, timezone, org-level rent defaults (due day, grace period, late fee)
- `/settings/team` — Invite by email, assign roles, deactivate
- `/settings/billing` — Current plan, payment method, invoice history, module management
- `/settings/notifications` — Per-alert type: email, in-app, or both

---

### Tenant Mobile App (Expo React Native)

**Onboarding**
- Splash / Welcome screen
- Enter invite code (from manager email link)
- Set password + complete profile (name, phone, emergency contact)

**Home Tab**
- Next rent payment: amount + due date + Pay Now button
- Open work orders: count + quick list
- Unread messages badge
- Lease expiration reminder (when within 90 days)

**Payments Tab**
- Current balance due
- Pay Now: link bank account via Stripe/Plaid, confirm amount
- Set up autopay toggle
- Full payment history with receipts

**Maintenance Tab**
- My open requests (status chips: Open, In Progress, Completed)
- Submit New Request: category select, description, up to 5 photos, availability note, entry permission toggle
- Request detail: status timeline, manager notes, SLA status

**Messages Tab**
- Conversation with property manager
- Text + photo attachments

**Documents Tab**
- Lease agreement (PDF viewer)
- Move-in inspection
- Notices and letters (shared by manager)

**Account Tab**
- Profile info, photo
- Notification preferences
- Contact manager shortcut
- Sign out

---

## 9. API Design Conventions

### URL Structure
```
/api/v1/organizations/:orgId/properties
/api/v1/organizations/:orgId/properties/:propertyId/units
/api/v1/organizations/:orgId/tenants
/api/v1/organizations/:orgId/work-orders
/api/v1/organizations/:orgId/payments
/api/v1/organizations/:orgId/messages
/api/v1/organizations/:orgId/vendors
```

### Auth
- All protected routes require `Authorization: Bearer <supabase_jwt>` header
- Middleware decodes JWT, extracts `user_id`, looks up `organization_id` from `User` table
- Org isolation check: every route handler verifies the resource belongs to `organization_id` from the token — not from the URL parameter alone

### Error Response Shape
```json
{
  "error": {
    "code": "LEASE_NOT_FOUND",
    "message": "No lease found with that ID in your organization.",
    "details": {}
  }
}
```

### Pagination
Cursor-based pagination for all list endpoints:
```
GET /api/v1/.../work-orders?cursor=<id>&limit=25
Response: { data: [...], nextCursor: "<id>" | null }
```

### Webhooks
- Stripe events: `POST /api/webhooks/stripe` (no auth, verified by Stripe signature header)
- Supabase auth events: `POST /api/webhooks/auth`

---

## 10. Environment & Infrastructure

### Local Development
- Docker Desktop (Windows) runs PostgreSQL 15 + Redis 7 via `docker-compose.yml`
- No XAMPP dependency — PostgreSQL replaces MySQL for this project
- Each developer runs `docker compose up -d` before starting the dev servers

### Staging
- Auto-deploys from `main` branch via Vercel (web) and Railway (API)
- Separate Supabase project for staging
- Stripe test mode

### Production
- Manual promote from staging
- Secrets managed via Vercel/Railway environment variables
- AWS Secrets Manager for sensitive keys (Stripe secret, Supabase service role)
- Daily automated backups of PostgreSQL via Railway or AWS RDS

### Port Map (local)
| Service | Port |
|---|---|
| Next.js web | 3000 |
| Node.js API | 3001 |
| Expo mobile (Metro) | 8081 |
| PostgreSQL | 5432 |
| Redis | 6379 |

> **XAMPP conflict note:** If XAMPP Apache is running on port 80/443, there is no conflict with this stack. If XAMPP MySQL is running on 3306, there is also no conflict since Postgres uses 5432.
