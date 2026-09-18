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

| Layer             | Technology           | Version     | Rationale                                                 |
| ----------------- | -------------------- | ----------- | --------------------------------------------------------- |
| Manager Web App   | Next.js (App Router) | 14+         | SSR performance, file-based routing, React ecosystem      |
| Tenant Mobile App | React Native (Expo)  | SDK 51+     | Single codebase for iOS + Android, shared types with web  |
| Backend API       | Node.js + Express    | Node 20 LTS | Real-time capability (WebSocket), JS across full stack    |
| Primary Database  | PostgreSQL           | 15          | ACID compliance, relational integrity for financial data  |
| Cache / Sessions  | Redis                | 7           | Session tokens, notification queuing, rate limiting       |
| Auth              | Supabase Auth        | Latest      | Managed JWT auth, row-level security, no custom auth risk |
| ORM               | Prisma               | 5+          | Type-safe queries, migration management, schema as code   |
| Payments          | Stripe               | Latest API  | ACH bank transfers, card payments, webhook events         |
| File Storage      | AWS S3               | -           | Presigned URL upload pattern, cost-effective at scale     |
| Email             | Resend               | -           | Developer-friendly, reliable transactional delivery       |
| SMS               | Twilio               | -           | Programmatic SMS for rent and maintenance alerts          |
| Hosting (staging) | Vercel + Railway     | -           | Zero-config CI/CD, easy environment management            |
| Monorepo          | Turborepo            | Latest      | Parallel task execution, shared packages, build caching   |

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

> **Status legend:** **Required** = must be present at creation. _Optional_ = collected when available. `Module` = nullable column added now, populated when the module ships.

---

**Organization** — Top-level account (management company or individual landlord)

| Field                    | Type      | Status       | Notes                                       |
| ------------------------ | --------- | ------------ | ------------------------------------------- |
| `id`                     | UUID      | **Required** | Primary key                                 |
| `name`                   | string    | **Required** | Company or owner name                       |
| `slug`                   | string    | **Required** | URL-safe identifier                         |
| `logo_url`               | string    | _Optional_   | Uploaded logo for branding                  |
| `email`                  | string    | **Required** | Primary contact email                       |
| `phone`                  | string    | **Required** | Primary contact phone                       |
| `timezone`               | string    | **Required** | Defaults all date/time display              |
| `date_format`            | enum      | _Optional_   | `MM/DD/YYYY` or `DD/MM/YYYY`                |
| `plan_tier`              | enum      | **Required** | `starter / pro / enterprise`                |
| `stripe_customer_id`     | string    | **Required** | Stripe billing reference                    |
| `stripe_subscription_id` | string    | **Required** | Active subscription ID                      |
| `subscription_status`    | enum      | **Required** | `active / trialing / past_due / canceled`   |
| `trial_ends_at`          | timestamp | _Optional_   | Null if not on trial                        |
| `late_fee_amount`        | decimal   | **Required** | Default late fee — overridable per lease    |
| `grace_period_days`      | integer   | **Required** | Days after due date before late fee applies |
| `rent_due_day`           | integer   | **Required** | Day of month rent is due (e.g. 1)           |
| `active_modules`         | string[]  | **Required** | Default `[]`. Add-on module keys the org has active — see §14 |
| `created_at`             | timestamp | **Required** |                                             |

---

**User** — Staff accounts (managers, admins, maintenance workers — not tenants)

| Field                | Type      | Status       | Notes                            |
| -------------------- | --------- | ------------ | -------------------------------- |
| `id`                 | UUID      | **Required** |                                  |
| `organization_id`    | UUID FK   | **Required** | Links to Organization            |
| `name`               | string    | **Required** | Display name                     |
| `email`              | string    | **Required** | Used for login and notifications |
| `phone`              | string    | _Optional_   | For urgent maintenance alerts    |
| `avatar_url`         | string    | _Optional_   |                                  |
| `role`               | enum      | **Required** | `owner / manager / maintenance`  |
| `status`             | enum      | **Required** | `active / invited / deactivated` |
| `invited_at`         | timestamp | **Required** |                                  |
| `last_login_at`      | timestamp | _Optional_   | Useful for audit trail           |
| `notif_rent_overdue` | enum      | _Optional_   | `email / in_app / both / none`   |
| `notif_work_order`   | enum      | _Optional_   | `email / in_app / both / none`   |
| `notif_lease_expiry` | enum      | _Optional_   | `email / in_app / both / none`   |
| `notif_new_message`  | enum      | _Optional_   | `email / in_app / both / none`   |
| `created_at`         | timestamp | **Required** |                                  |

Index: `organization_id`

---

**Property** — A physical address containing one or more units

| Field                     | Type      | Status       | Notes                                                  |
| ------------------------- | --------- | ------------ | ------------------------------------------------------ |
| `id`                      | UUID      | **Required** |                                                        |
| `organization_id`         | UUID FK   | **Required** |                                                        |
| `name`                    | string    | **Required** | Display name, e.g. Elm Street Apartments               |
| `type`                    | enum      | **Required** | `multifamily / single_family / commercial / mixed_use` |
| `address`                 | string    | **Required** | Street address                                         |
| `city`                    | string    | **Required** |                                                        |
| `state`                   | string    | **Required** | 2-letter state code — drives compliance rules          |
| `zip`                     | string    | **Required** |                                                        |
| `country`                 | string    | **Required** | Default `US`                                           |
| `jurisdiction_notes`      | text      | _Optional_   | Free-text field for local ordinance notes              |
| `year_built`              | integer   | _Optional_   | Useful for maintenance context                         |
| `unit_count`              | integer   | **Required** | Computed or manually set                               |
| `amenities`               | string[]  | _Optional_   | Pool, gym, laundry, etc.                               |
| `photo_url`               | string    | _Optional_   |                                                        |
| `notes`                   | text      | _Optional_   |                                                        |
| `tax_parcel_id`           | string    | `Module`     | Accounting module                                      |
| `insurance_policy_number` | string    | `Module`     | Insurance module                                       |
| `insurance_expires_at`    | date      | `Module`     | Insurance module                                       |
| `created_at`              | timestamp | **Required** |                                                        |
| `updated_at`              | timestamp | **Required** |                                                        |

Index: `organization_id`

> **Critical:** The `state` field is the jurisdiction hook that everything in the compliance modules hangs on — rent control rules, security deposit limits, required notice periods, and habitability standards all vary by state. Capture it accurately from day one.

---

**Unit** — An individual rentable space within a property

| Field                    | Type      | Status       | Notes                                                        |
| ------------------------ | --------- | ------------ | ------------------------------------------------------------ |
| `id`                     | UUID      | **Required** |                                                              |
| `property_id`            | UUID FK   | **Required** |                                                              |
| `unit_number`            | string    | **Required** | e.g. 4B, 101, Upper                                          |
| `floor`                  | integer   | _Optional_   |                                                              |
| `type`                   | enum      | **Required** | `studio / 1br / 2br / 3br / 4br+ / commercial`               |
| `bedrooms`               | integer   | **Required** |                                                              |
| `bathrooms`              | decimal   | **Required** | 1.5 = one full + one half bath                               |
| `sq_ft`                  | integer   | _Optional_   |                                                              |
| `status`                 | enum      | **Required** | `occupied / vacant / notice / maintenance / unlisted`        |
| `market_rent`            | decimal   | **Required** | What the unit should rent for                                |
| `rent_amount`            | decimal   | **Required** | What the current lease charges — may differ from market_rent |
| `deposit_amount`         | decimal   | **Required** |                                                              |
| `available_date`         | date      | _Optional_   | When unit will be ready if vacant                            |
| `parking_spaces`         | string[]  | _Optional_   | e.g. `['P12', 'P13']`                                        |
| `storage_unit`           | string    | _Optional_   |                                                              |
| `utility_meter_electric` | string    | _Optional_   | Meter number                                                 |
| `utility_meter_gas`      | string    | _Optional_   | Meter number                                                 |
| `utility_meter_water`    | string    | _Optional_   | Meter number                                                 |
| `address`                | string    | _Optional_   | Address override if different from property                  |
| `city`                   | string    | _Optional_   | Address override                                             |
| `state`                  | string    | _Optional_   | Address override                                             |
| `zip`                    | string    | _Optional_   | Address override                                             |
| `notes`                  | text      | _Optional_   |                                                              |
| `last_inspection_at`     | timestamp | `Module`     | Updated by Inspections module                                |
| `last_renovation_at`     | date      | _Optional_   |                                                              |
| `appliance_count`        | integer   | `Module`     | Maintained by Unit Intelligence module                       |
| `created_at`             | timestamp | **Required** |                                                              |
| `updated_at`             | timestamp | **Required** |                                                              |

Index: `property_id, status`

---

**Tenant** — A person who rents or has rented a unit (separate from their lease record)

| Field                              | Type      | Status       | Notes                                                               |
| ---------------------------------- | --------- | ------------ | ------------------------------------------------------------------- |
| `id`                               | UUID      | **Required** |                                                                     |
| `organization_id`                  | UUID FK   | **Required** |                                                                     |
| **Identity**                       |           |              |                                                                     |
| `full_legal_name`                  | string    | **Required** | Used on lease documents — not a display name                        |
| `preferred_name`                   | string    | _Optional_   | What to call them day-to-day                                        |
| `date_of_birth`                    | date      | **Required** | Required for background/credit screening                            |
| `email`                            | string    | **Required** | Portal login and notifications                                      |
| `phone_primary`                    | string    | **Required** |                                                                     |
| `phone_secondary`                  | string    | _Optional_   |                                                                     |
| `preferred_contact`                | enum      | _Optional_   | `email / sms / call`                                                |
| `language_preference`              | string    | _Optional_   | ISO code, e.g. `en / es` — for future i18n                          |
| `avatar_url`                       | string    | _Optional_   |                                                                     |
| **Screening Data**                 |           |              |                                                                     |
| `ssn_last4`                        | string    | **Required** | Minimum for identity confirmation                                   |
| `ssn_full_encrypted`               | string    | `Module`     | Full SSN — Screening module only, encrypted at rest                 |
| `govt_id_type`                     | enum      | _Optional_   | `drivers_license / state_id / passport`                             |
| `govt_id_number`                   | string    | `Module`     | Store encrypted — Screening module                                  |
| `screening_consent_at`             | timestamp | `Module`     | Legally required before running a credit/background check           |
| **Address History**                |           |              |                                                                     |
| `current_address`                  | string    | **Required** | Where they live before moving in                                    |
| `previous_address`                 | string    | _Optional_   | One prior address minimum for screening                             |
| **Employment & Income**            |           |              |                                                                     |
| `employer_name`                    | string    | _Optional_   | Collected during application                                        |
| `employer_phone`                   | string    | _Optional_   |                                                                     |
| `monthly_gross_income`             | decimal   | _Optional_   | Used to verify rent-to-income ratio (standard: rent ≤ 30% of gross) |
| `income_source`                    | enum      | _Optional_   | `employment / self_employed / benefits / other`                     |
| **Emergency Contacts**             |           |              |                                                                     |
| `emergency_contact_1_name`         | string    | **Required** |                                                                     |
| `emergency_contact_1_phone`        | string    | **Required** |                                                                     |
| `emergency_contact_1_relationship` | string    | **Required** |                                                                     |
| `emergency_contact_1_email`        | string    | _Optional_   |                                                                     |
| `emergency_contact_2_name`         | string    | _Optional_   | Second contact strongly recommended                                 |
| `emergency_contact_2_phone`        | string    | _Optional_   |                                                                     |
| `emergency_contact_2_relationship` | string    | _Optional_   |                                                                     |
| **Vehicles & Pets**                |           |              |                                                                     |
| `vehicles`                         | JSONB     | _Optional_   | Array: `{make, model, color, plate, state}`                         |
| `pets`                             | JSONB     | _Optional_   | Array: `{type, breed, weight, name}`                                |
| **Portal**                         |           |              |                                                                     |
| `portal_status`                    | enum      | **Required** | `invited / active / never_logged_in`                                |
| `portal_invited_at`                | timestamp | **Required** |                                                                     |
| `notif_payment_confirm`            | enum      | _Optional_   | `email / push / both`                                               |
| `notif_work_order_update`          | enum      | _Optional_   | `email / push / both`                                               |
| `notif_message`                    | enum      | _Optional_   | `email / push / both`                                               |
| `created_at`                       | timestamp | **Required** |                                                                     |
| `updated_at`                       | timestamp | **Required** |                                                                     |

Index: `organization_id, email`

> **Why `date_of_birth` is Required:** It's not about age — background screening services like TransUnion SmartMove legally require it to run a check. Without it, the Screening module cannot ship without a painful migration.

> **Why JSONB for vehicles and pets:** Rather than separate tables for a small list of attributes, structured JSON in Postgres keeps the schema clean while still being queryable. When the Parking module ships, vehicles can be promoted to their own table without data loss.

---

**Lease** — One lease per occupancy period. A unit can have many leases over time.

| Field                            | Type      | Status       | Notes                                                                   |
| -------------------------------- | --------- | ------------ | ----------------------------------------------------------------------- |
| `id`                             | UUID      | **Required** |                                                                         |
| `unit_id`                        | UUID FK   | **Required** |                                                                         |
| `status`                         | enum      | **Required** | `draft / active / month_to_month / notice_given / expired / terminated` |
| `type`                           | enum      | **Required** | `fixed_term / month_to_month`                                           |
| **Dates & Terms**                |           |              |                                                                         |
| `start_date`                     | date      | **Required** |                                                                         |
| `end_date`                       | date      | **Required** | Null if month-to-month                                                  |
| `move_in_date`                   | date      | **Required** | May differ from lease start date                                        |
| `move_out_date`                  | date      | _Optional_   | Populated at move-out                                                   |
| `notice_period_days`             | integer   | **Required** | Days notice required to vacate                                          |
| `rent_amount`                    | decimal   | **Required** | Monthly rent for this lease                                             |
| `rent_due_day`                   | integer   | **Required** | Overrides organization default                                          |
| `grace_period_days`              | integer   | **Required** | Overrides organization default                                          |
| `late_fee_amount`                | decimal   | **Required** | Overrides organization default                                          |
| **Security Deposit**             |           |              |                                                                         |
| `deposit_amount`                 | decimal   | **Required** |                                                                         |
| `security_deposit_paid_at`       | date      | **Required** |                                                                         |
| `security_deposit_status`        | enum      | **Required** | `held / partial_return / full_return / applied_to_balance`              |
| `security_deposit_returned_at`   | date      | _Optional_   | Populated at move-out                                                   |
| `security_deposit_return_amount` | decimal   | _Optional_   |                                                                         |
| `security_deposit_deductions`    | JSONB     | _Optional_   | Itemized deductions with amounts and reasons                            |
| **Utilities & Addenda**          |           |              |                                                                         |
| `utilities_included`             | string[]  | _Optional_   | `water / gas / electric / trash`                                        |
| `has_pet_addendum`               | boolean   | _Optional_   |                                                                         |
| `pet_deposit_amount`             | decimal   | _Optional_   |                                                                         |
| `has_parking_addendum`           | boolean   | _Optional_   |                                                                         |
| `parking_fee`                    | decimal   | _Optional_   |                                                                         |
| **Occupancy**                    |           |              |                                                                         |
| `occupant_count`                 | integer   | **Required** | Total number of people living in unit                                   |
| `occupant_names`                 | string[]  | _Optional_   | Including minors — for headcount compliance                             |
| **Documents & Signing**          |           |              |                                                                         |
| `document_url`                   | string    | **Required** | S3 path to signed lease PDF                                             |
| `esignature_status`              | enum      | **Required** | `pending / partially_signed / completed`                                |
| `tenant_signed_at`               | timestamp | _Optional_   |                                                                         |
| `manager_signed_at`              | timestamp | _Optional_   |                                                                         |
| `renewal_of_lease_id`            | UUID FK   | _Optional_   | Links to prior lease if this is a renewal                               |
| `notes`                          | text      | _Optional_   |                                                                         |
| `created_at`                     | timestamp | **Required** |                                                                         |
| `updated_at`                     | timestamp | **Required** |                                                                         |

Index: `unit_id, status, end_date`

> **Key structural decision:** The Lease is its own table, not part of the Tenant. A tenant can renew (multiple leases, same unit), transfer (same tenant, different unit), or co-sign (multiple tenants, one lease). Collapsing lease data into the tenant record is the most common early mistake and causes real pain at scale.

---

**LeaseParticipant** — Junction table linking tenants to a lease

| Field        | Type    | Status       | Notes                             |
| ------------ | ------- | ------------ | --------------------------------- |
| `id`         | UUID    | **Required** |                                   |
| `lease_id`   | UUID FK | **Required** |                                   |
| `tenant_id`  | UUID FK | **Required** |                                   |
| `is_primary` | boolean | **Required** | One primary leaseholder per lease |

---

**Payment** — All money movements (rent, fees, deposits). One record per transaction.

| Field                      | Type      | Status       | Notes                                                                |
| -------------------------- | --------- | ------------ | -------------------------------------------------------------------- |
| `id`                       | UUID      | **Required** |                                                                      |
| `lease_id`                 | UUID FK   | **Required** |                                                                      |
| `tenant_id`                | UUID FK   | **Required** |                                                                      |
| `amount`                   | decimal   | **Required** |                                                                      |
| `type`                     | enum      | **Required** | `rent / late_fee / deposit / pet_deposit / parking / credit / other` |
| `status`                   | enum      | **Required** | `pending / completed / failed / waived / refunded`                   |
| **Timing**                 |           |              |                                                                      |
| `due_date`                 | date      | **Required** |                                                                      |
| `paid_at`                  | timestamp | _Optional_   | Null until payment clears                                            |
| `period_start`             | date      | **Required** | First day of the period this payment covers                          |
| `period_end`               | date      | **Required** | Last day of the period                                               |
| **Payment Method**         |           |              |                                                                      |
| `method`                   | enum      | **Required** | `ach / card / check / cash / money_order / other`                    |
| `stripe_payment_intent_id` | string    | _Optional_   | Null for offline payments                                            |
| `check_number`             | string    | _Optional_   | For check payments                                                   |
| `reference_note`           | string    | _Optional_   | Manager notes on manual payments                                     |
| **Late Fees**              |           |              |                                                                      |
| `is_late`                  | boolean   | **Required** | Auto-set by system                                                   |
| `late_fee_applied`         | boolean   | **Required** |                                                                      |
| `late_fee_waived`          | boolean   | _Optional_   | Manager can override                                                 |
| `late_fee_waived_reason`   | string    | _Optional_   |                                                                      |
| `notes`                    | text      | _Optional_   |                                                                      |
| `created_at`               | timestamp | **Required** |                                                                      |

Index: `lease_id, status, due_date`

---

**WorkOrder** — Maintenance requests submitted by tenants or initiated by managers

| Field                      | Type      | Status       | Notes                                                                                       |
| -------------------------- | --------- | ------------ | ------------------------------------------------------------------------------------------- |
| `id`                       | UUID      | **Required** |                                                                                             |
| `unit_id`                  | UUID FK   | **Required** |                                                                                             |
| `property_id`              | UUID FK   | **Required** | Enables property-level (common area) work orders                                            |
| `submitted_by_tenant_id`   | UUID FK   | _Optional_   | Null if manager-initiated                                                                   |
| `submitted_by_user_id`     | UUID FK   | _Optional_   | Null if tenant-submitted                                                                    |
| `assigned_to_user_id`      | UUID FK   | _Optional_   | Internal staff if assigned                                                                  |
| `vendor_id`                | UUID FK   | _Optional_   | External contractor if assigned                                                             |
| `title`                    | string    | **Required** | Short description                                                                           |
| `description`              | text      | **Required** | Full details from submitter                                                                 |
| `category`                 | enum      | **Required** | `plumbing / electrical / hvac / appliance / pest / structural / cosmetic / grounds / other` |
| **Priority & Status**      |           |              |                                                                                             |
| `priority`                 | enum      | **Required** | `emergency / urgent / routine`                                                              |
| `status`                   | enum      | **Required** | `open / assigned / in_progress / pending_parts / completed / closed / cancelled`            |
| `sla_deadline_at`          | timestamp | **Required** | Auto-computed from priority at creation                                                     |
| `sla_breached`             | boolean   | **Required** | Auto-set if deadline passes without completion                                              |
| **Access & Scheduling**    |           |              |                                                                                             |
| `entry_permission_granted` | boolean   | **Required** | Has tenant authorized entry without being present                                           |
| `preferred_contact_window` | string    | _Optional_   | e.g. Weekdays 9am–5pm                                                                       |
| `scheduled_at`             | timestamp | _Optional_   |                                                                                             |
| **Completion & Cost**      |           |              |                                                                                             |
| `completed_at`             | timestamp | _Optional_   |                                                                                             |
| `resolution_notes`         | text      | _Optional_   | What was done                                                                               |
| `labor_cost`               | decimal   | _Optional_   |                                                                                             |
| `parts_cost`               | decimal   | _Optional_   |                                                                                             |
| `total_cost`               | decimal   | _Optional_   | Computed: labor + parts                                                                     |
| `charged_to_tenant`        | boolean   | _Optional_   |                                                                                             |
| `tenant_charge_amount`     | decimal   | _Optional_   |                                                                                             |
| **Media**                  |           |              |                                                                                             |
| `photos_before`            | string[]  | _Optional_   | S3 URLs                                                                                     |
| `photos_after`             | string[]  | _Optional_   | S3 URLs                                                                                     |
| `video_url`                | string    | _Optional_   | Tenant-submitted video                                                                      |
| `created_at`               | timestamp | **Required** |                                                                                             |
| `updated_at`               | timestamp | **Required** |                                                                                             |

Index: `unit_id, status, priority, created_at`

---

**Vendor** — External contractors and service providers assigned to work orders

| Field                  | Type      | Status       | Notes                                           |
| ---------------------- | --------- | ------------ | ----------------------------------------------- |
| `id`                   | UUID      | **Required** |                                                 |
| `organization_id`      | UUID FK   | **Required** |                                                 |
| **Identity**           |           |              |                                                 |
| `company_name`         | string    | **Required** |                                                 |
| `contact_name`         | string    | **Required** | Primary contact person                          |
| `email`                | string    | **Required** |                                                 |
| `phone_primary`        | string    | **Required** |                                                 |
| `phone_emergency`      | string    | _Optional_   | For after-hours emergency call-outs             |
| **Specialty & Status** |           |              |                                                 |
| `specialties`          | string[]  | **Required** | `plumbing / electrical / hvac / general / etc.` |
| `status`               | enum      | **Required** | `active / inactive`                             |
| `preferred`            | boolean   | _Optional_   | Flag for go-to vendor by category               |
| `rating`               | decimal   | _Optional_   | Internal 1–5 rating                             |
| `notes`                | text      | _Optional_   |                                                 |
| **Compliance**         |           |              |                                                 |
| `license_number`       | string    | _Optional_   |                                                 |
| `license_expires_at`   | date      | _Optional_   | Expiry alert hook                               |
| `insurance_on_file`    | boolean   | **Required** | Flag — actual doc stored in Documents table     |
| `insurance_expires_at` | date      | _Optional_   | Expiry alert hook                               |
| `w9_on_file`           | boolean   | `Module`     | Needed for Accounting/1099 module               |
| `created_at`           | timestamp | **Required** |                                                 |
| `updated_at`           | timestamp | **Required** |                                                 |

Index: `organization_id`

---

**Message** — In-app communication threads between manager and tenant

_Thread record:_

| Field           | Type    | Status       | Notes                                    |
| --------------- | ------- | ------------ | ---------------------------------------- |
| `thread_id`     | UUID    | **Required** | Groups messages into a conversation      |
| `unit_id`       | UUID FK | **Required** | Thread tied to a unit for context        |
| `lease_id`      | UUID FK | _Optional_   |                                          |
| `work_order_id` | UUID FK | _Optional_   | Null unless thread is about a work order |
| `subject`       | string  | _Optional_   | Optional thread subject line             |

_Message record:_

| Field              | Type      | Status       | Notes                         |
| ------------------ | --------- | ------------ | ----------------------------- |
| `id`               | UUID      | **Required** |                               |
| `thread_id`        | UUID FK   | **Required** |                               |
| `sender_tenant_id` | UUID FK   | _Optional_   | Null if sent by staff         |
| `sender_user_id`   | UUID FK   | _Optional_   | Null if sent by tenant        |
| `body`             | text      | **Required** |                               |
| `attachments`      | string[]  | _Optional_   | S3 URLs                       |
| `sent_at`          | timestamp | **Required** |                               |
| `read_at`          | timestamp | _Optional_   | Null until recipient opens it |

---

**Document** — Files attached to any entity (leases, insurance certs, inspection photos, etc.)

| Field                 | Type      | Status       | Notes                                                    |
| --------------------- | --------- | ------------ | -------------------------------------------------------- |
| `id`                  | UUID      | **Required** |                                                          |
| `organization_id`     | UUID FK   | **Required** |                                                          |
| `file_name`           | string    | **Required** | Original filename                                        |
| `file_url`            | string    | **Required** | S3 path                                                  |
| `file_type`           | string    | **Required** | MIME type                                                |
| `file_size_bytes`     | integer   | **Required** |                                                          |
| `uploaded_by_user_id` | UUID FK   | _Optional_   | Null if system-generated                                 |
| `uploaded_at`         | timestamp | **Required** |                                                          |
| `entity_type`         | enum      | **Required** | `lease / unit / tenant / property / work_order / vendor` |
| `entity_id`           | UUID      | **Required** | FK to whichever entity this belongs to                   |
| `doc_category`        | enum      | _Optional_   | `lease / inspection / insurance / id / photo / other`    |
| `label`               | string    | _Optional_   | Human-readable label                                     |
| `visible_to_tenant`   | boolean   | **Required** | Controls whether tenant portal can see this file         |

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

| Priority  | SLA                                        | Trigger Examples                          |
| --------- | ------------------------------------------ | ----------------------------------------- |
| Emergency | Escalated within 1 hour                    | No heat, flooding, no hot water, gas leak |
| Urgent    | Response within 24 hours                   | Broken appliance, no AC in summer         |
| Routine   | Acknowledged 48hr, scheduled within 7 days | Cosmetic repairs, minor plumbing          |

---

## 6. Phased Build Plan

> **Note on schema:** The expanded Tenant and Lease schemas (Section 4) should be fully reflected in the Prisma schema, seed data, and Zod validators from Week 1 of Phase 1 — not incrementally. Adding nullable module-flagged columns now costs nothing and prevents breaking migrations later.

### Phase 1 — Foundation (Months 1–3)

**Goal:** A manager can log in, add properties and units, add tenants with leases, and manually record a rent payment. The app becomes the system of record.

| Week  | Milestone                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------- |
| 1–2   | Monorepo scaffold, Prisma schema v1 (full expanded schema), Supabase Auth working, CI pipeline (GitHub Actions) |
| 3–4   | Property + Unit CRUD — API routes + web UI                                                                      |
| 5–6   | Tenant + Lease CRUD — API routes + web UI                                                                       |
| 7–8   | Manual payment logging, basic dashboard with KPI widgets                                                        |
| 9–10  | Email notifications via Resend (rent reminders, lease expiry alerts)                                            |
| 11–12 | Document upload to S3, QA, staging deploy                                                                       |

**Deliverable:** Internal demo-ready. Manager can populate their full portfolio.

### Phase 2 — Core Workflows (Months 3–5)

**Goal:** Money moves through the platform. Maintenance is tracked. Manager and tenant can communicate.

| Week  | Milestone                                                          |
| ----- | ------------------------------------------------------------------ |
| 13–14 | Stripe Connect onboarding for manager bank accounts                |
| 15–16 | ACH payment initiation + Stripe webhook handling + ledger updates  |
| 17–18 | Work order creation flow (manager + tenant-facing web)             |
| 19–20 | Work order assignment, status updates, SLA tracking, notifications |
| 21–22 | In-app messaging (REST polling first, WebSocket in Phase 3)        |
| 23–24 | Late fee automation, payment reminders, QA                         |

**Deliverable:** First paying customer can go live.

### Phase 3 — Tenant Mobile App (Months 5–7)

**Goal:** Tenants can do everything from their phone.

| Week  | Milestone                                       |
| ----- | ----------------------------------------------- |
| 25–26 | Expo app scaffold — auth, home screen, pay rent |
| 27–28 | Work order submission with photo upload         |
| 29–30 | Messaging, push notifications (Expo + APNs/FCM) |
| 31–32 | Lease documents, payment history, profile       |
| 33–34 | Settings + admin screens, renewal workflow      |
| 35–36 | App store submission prep, QA                   |

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

| Module                                 | Target Price | Key Features                                                                                                                                                                                               | Priority | Dependencies                           |
| -------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------- |
| Advanced Tenant Onboarding             | $25–40/mo    | Digital application, background/credit check (TransUnion), e-lease signing, move-in inspection with photos                                                                                                 | High     | Lease Mgmt, Stripe, Resend             |
| Unit Intelligence & Appliance Registry | $20–35/mo    | Per-unit appliance records (make/model/serial/warranty), maintenance cost tracking, age-based replacement alerts, QR code labels                                                                           | High     | Unit Mgmt, S3                          |
| Grounds & Property Maintenance         | $25–40/mo    | Recurring task scheduling for common areas, vendor assignment, inspection logs, completion photo                                                                                                           | Medium   | Work Orders, Vendor                    |
| Advanced Payments & Accounting         | $30–50/mo    | Card payments, partial payments, security deposit reconciliation, owner disbursements, P&L by property, Schedule E export                                                                                  | Medium   | Stripe, Payment Ledger                 |
| Vendor & Contractor Management         | $20–30/mo    | Vendor database, license/insurance expiry alerts, work history, ratings, preferred vendor by property                                                                                                      | Medium   | Work Orders                            |
| Inspections & Compliance               | $25–40/mo    | Move-in/out templates, scheduled inspections, photo/video docs, digital signature, automated reports                                                                                                       | Medium   | Unit Mgmt, S3                          |
| Lease Renewal                          | $15–25/mo    | Renewal offer tracking, rent increase history, market rate comparison, countersignature workflow                                                                                                           | Medium   | Lease Mgmt                             |
| Eviction Management                    | $30–50/mo    | Notice type tracking (pay-or-quit, cure-or-quit, unconditional quit), delivery method logging (certified mail, personal service, posting), court date tracking, jurisdiction-specific notice period lookup | Medium   | Lease Mgmt, Property jurisdiction data |
| Owner Portal                           | $25–40/mo    | Owner entity above property level, ownership percentage for co-owned properties, distribution/disbursement records, owner-facing reporting                                                                 | Low      | Payments, Properties                   |
| Communications & Resident Engagement   | $20–30/mo    | Bulk messaging, automated notices, SMS integration, community bulletin board, resident satisfaction surveys                                                                                                | Low      | Messaging, Notifications               |
| Reporting & Analytics                  | $25–40/mo    | Custom reports, portfolio performance trends, maintenance spend by unit, rent roll, vacancy rate history                                                                                                   | Low      | All modules                            |

### Module Data Hooks — Build Now, Use Later

These nullable columns must exist in the base schema from day one. Adding them costs nothing. Not adding them forces a breaking migration when the module ships.

| Column                 | Table    | Used By                  | Notes                                         |
| ---------------------- | -------- | ------------------------ | --------------------------------------------- |
| `ssn_full_encrypted`   | Tenant   | Screening module         | Encrypted at rest — never logged or exposed   |
| `screening_consent_at` | Tenant   | Screening module         | Legally required before running any check     |
| `govt_id_number`       | Tenant   | Screening module         | Store encrypted                               |
| `tax_parcel_id`        | Property | Accounting module        | Needed for Schedule E and tax reporting       |
| `appliance_count`      | Unit     | Unit Intelligence module | Maintained by module, surfaced on unit detail |
| `last_inspection_at`   | Unit     | Inspections module       | Timestamp of last inspection — any type       |
| `w9_on_file`           | Vendor   | Accounting / 1099 module | Required for contractor tax reporting         |

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

- Stripe events: `POST /api/webhooks/stripe` (no auth, verified by Stripe signature header
  via `stripe.webhooks.constructEvent` against the raw request body — see the security
  review write-up in §12 Cross-Cutting Status, which confirmed this is implemented
  correctly and can't be bypassed)
- No Supabase auth webhook exists in the codebase today — a prior version of this doc
  claimed a `POST /api/webhooks/auth` endpoint that was never actually built; corrected
  09-17-2026. `apps/api/src/index.ts` registers exactly one webhook route
  (`/api/webhooks/stripe`).

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

| Service             | Port |
| ------------------- | ---- |
| Next.js web         | 3000 |
| Node.js API         | 3001 |
| Expo mobile (Metro) | 8081 |
| PostgreSQL          | 5432 |
| Redis               | 6379 |

> **XAMPP conflict note:** If XAMPP Apache is running on port 80/443, there is no conflict with this stack. If XAMPP MySQL is running on 3306, there is also no conflict since Postgres uses 5432.

---

## 11. Implementation Delta Appendix

This appendix captures what is currently implemented in the repo beyond or different from the original roadmap text.

### Stack / Versions

- Manager web is currently on Next.js `15.1.7` (update 03-21-2026)
- Tenant mobile is currently on Expo SDK `54` (update 03-31-2026)
- Prisma runtime/tooling is currently on Prisma `6.x` (update 03-21-2026)

### API Surface Deltas

- Tenant portal API surface exists under `/api/v1/tenant/*` with routes for profile, dashboard, payments, work orders, messaging, documents, and push token registration. (Added 03-28-2026)
- Stripe Connect API routes are implemented at `/api/v1/organizations/:orgId/connect/*` for status, account link, and sync flows. (Added 03-26-2026)
- Ledger API route is implemented at `/api/v1/organizations/:orgId/ledger` with manager/owner role gating. (Added 03-28-2026)
- Staff admin route behavior has been hardened with explicit role-gating (`owner/manager`), input validation, and self-lockout/last-privileged checks. (update 04-04-2026)
- Maintenance-role restrictions were enforced across API and web settings/admin surfaces after initial Phase 3 week 33-34 delivery. (update 04-05-2026)

### Manager Web Deltas

- Settings now uses a shared settings shell/navigation component for consistent Organization/Team/Notifications/Billing/Stripe Connect UX. (Added 04-04-2026)
- `/settings/billing` is currently implemented as read-only billing/subscription/connect metadata, not payment-method edits or invoice actions. (update 04-04-2026)
- Lease renewal UX now includes stronger validation, renewal linkage visibility (`renewed from/to`), and query-driven renewal entry from lease-expiry notifications. (update 04-04-2026)
- Lease list/detail currently includes renewal-chain context fields in UI/API payloads beyond the original baseline lease screen wording. (update 04-04-2026)

### Tenant Mobile Deltas

- Tenant onboarding currently ships as welcome + login flow and does not currently expose an invite-code entry screen. (update 03-31-2026)
- Payments tab currently supports balance + pay-now + payment history/detail modal; autopay toggle is not currently shipped in tab UI. (update 04-04-2026)
- Account tab currently ships profile/emergency-contact editing + preferred contact + sign out; in-tab notification preference controls and dedicated contact-manager shortcut are not currently shipped. (update 04-04-2026)
- Messaging uses tab thread list plus dedicated `conversation` route/screen implementation. (Added 04-04-2026)
- Expo push token registration is implemented and persisted to tenant profile via tenant portal API. (Added 04-04-2026)

### Data Model / Enum Deltas

- Organization includes implemented Stripe Connect fields: `stripe_account_id`, `stripe_account_status`, and `stripe_account_details_submitted`. (Added 03-26-2026)
- Tenant includes implemented auth/mobile fields: `supabase_user_id` and `expo_push_token`. (Added 04-04-2026)
- Lease renewal linkage is implemented with self-referential relation via `renewal_of_lease_id` and exposed in service include shapes. (Added 03-29-2026)
- Unit and work order enum sets include legacy compatibility values in Prisma schema (for backward compatibility with seed/migrations), which extends beyond the stricter normalized values described in the original outline tables. (update 03-23-2026)
- Work order status implementation uses normalized lifecycle values (`new_order`, `assigned`, `in_progress`, `pending_parts`, `completed`, `closed`, `cancelled`) rather than the simplified status labels shown in early outline text. (update 03-29-2026)

### Phase Progress Snapshot

- Phase 1 and Phase 2 planned foundations/workflows are materially implemented in the current branch lineage, including properties/units/tenants/leases/payments/work-orders/messages/documents/notifications. (update 03-29-2026)
- Phase 3 weeks 25-34 features are implemented across the mobile app and supporting API, including scaffold, maintenance submission, messaging/push, lease docs/payment history/profile, and settings/admin/renewal hardening. (update 04-04-2026)
- Additional post-week-34 hardening landed for role enforcement and work-order attribution display. (update 04-05-2026)
- File storage migrated from AWS S3 to Supabase Storage; all remaining Supabase-sent transactional emails switched to Resend. (update 06-06-2026)
- Property-level (common-area/capital-project) work orders added to schema, API services, reports, and web UI, with a follow-up fix for a cross-org scoping leak. (update 07-19-2026)
- Sentry error monitoring wired into web, API, and mobile (was console.error-only). (update 05-31-2026)
- Rate limiting middleware added and applied to invite/apply/e-sign public routes (`apps/api/src/middleware/rate-limit.ts`). (update 05-31-2026)
- SMS notifications via Twilio shipped, with automatic fallback to email when SMS is unconfigured; message file/photo attachments shipped on both web and mobile. (update 05-29-2026 / 05-30-2026)
- Payment void now posts a real ledger reversal (update 09-16-2026): `voidPayment()` still sets `voidedAt`/`voidReason`/`status: 'voided'`, but now also nets whatever the payment already posted to the ledger (e.g. an ACH credit from the Stripe webhook) and creates a counterpart reversing entry in the same transaction, so the ledger balance is restored to what it would be had the payment never completed. No-ops for payments that never posted a ledger entry (cash/check/waived). Covered by `payment.service.test.ts` (ledger balance before/after). (see `payment.service.ts`, `ledger.service.ts`)
- Mobile invite-code activation screen shipped (`apps/mobile/app/(auth)/activate.tsx`) and autopay toggle shipped in the mobile Payments tab (`AutopaySetupSheet.tsx`).
- Online rental application form + e-signature flow shipped (`routes/apply.ts`, `routes/sign.ts`, `rental-application.service.ts`) — core of Module 1's leasing funnel. **Update (2026-09-17):** the background/credit check step now also ships, gated behind `advanced_tenant_onboarding` in `Organization.activeModules`. The application form captures a dedicated screening consent + full SSN + govt ID (encrypted at rest via `encryption.service.ts`, AES-256-GCM) alongside the existing base consent; `screeningConsentAt`/`ssnFullEncrypted`/`govtIdNumber` are populated at that point instead of remaining dormant, then copied onto the `Tenant` record on approval. A new `ScreeningCheck` model records background/credit check runs (`POST`/`GET .../applications/:id/screening`), and the applications review page shows the result with an approve/deny flow that still drives the existing tenant+lease creation path. The TransUnion SmartMove provider call itself is mocked (`screening-provider.client.ts`) — no SmartMove credentials exist in any environment yet; swapping in the real API is isolated behind that one file. See `docs/reference/modules.md` and `docs/reference/schema.md`.
- Module 9 (Owner Portal / Financial Reporting & Owner Statements) and Module 11 (Reporting & Analytics) are now both fully built functionally (update 09-16-2026), well ahead of their "Low priority" roadmap position — see §7 note and `docs/reference/modules.md`. Module 9 ships `Owner`/`PropertyOwner`/`OwnerStatement` data and manager-facing routes (`routes/owners.ts`), plus a separate owner-facing auth path (`Owner.supabaseUserId`/`portalStatus`, `requireOwnerAuth` middleware) and a read-only owner portal web UI (`apps/web/app/owner-portal/*` — login, set-password, dashboard, properties, statements, reports) backed by `routes/owner-portal.ts`. Module 11 adds a configurable report builder (`POST /reports/builder`, column/filter selection over the existing report sources, with saved configs via `SavedReport`), vacancy-rate history with manual market-rate comparison (`VacancyHistory` model, `/reports/vacancy-history*`), and PDF export alongside the existing CSV export (`apps/web/lib/exportPdf.ts` via `jspdf`), on top of the fixed report endpoints. **Update (2026-09-17):** both are now feature-flagged — `Organization.activeModules`, the `requireModule(...)` API middleware, and the web `<ModuleGate>` component all exist and are wired to these two routes/pages — see item 16 below and `docs/reference/modules.md`. Activation is a manual toggle for now, not Stripe Subscription Item billing.

---

## 12. Phase-by-Phase Implementation Status

_Last updated: 2026-09-16. Status reflects the `main` branch._

> **Legend:** ✅ Done — ⚠️ Partial — ❌ Not yet built — 🔴 Blocker (pilot) — 🟡 Required (production)

---

### Phase 1 — Foundation

| Item                                                                | Status | Notes                                                                                                                   |
| ------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Monorepo scaffold (Turborepo, packages/db, packages/shared)         | ✅     |                                                                                                                         |
| Prisma schema — all core entities                                   | ✅     |                                                                                                                         |
| Supabase auth + org isolation middleware                            | ✅     |                                                                                                                         |
| Property / Unit CRUD — API + web                                    | ✅     |                                                                                                                         |
| Tenant / Lease CRUD — API + web                                     | ✅     |                                                                                                                         |
| Manual payment logging                                              | ✅     |                                                                                                                         |
| Dashboard with KPI cards (clickable)                                | ✅     |                                                                                                                         |
| Email notifications via Resend                                      | ✅     | All remaining Supabase-sent emails also switched to Resend (06-06-2026)                                                 |
| Document upload — file storage                                      | ✅     | Migrated from AWS S3 to Supabase Storage (06-06-2026)                                                                   |
| CI pipeline (GitHub Actions — web + API + mobile)                   | ✅     | Mobile lint step added to CI (09-16-2026); mobile build already covered via `turbo run build`                          |
| Role-based access (owner / manager / maintenance)                   | ✅     |                                                                                                                         |
| Onboarding wizard — org name + logo + billing + first property      | ✅     | Multi-step onboarding completed with auth callback/invite flow hardening and idempotent step-1 behavior.                |
| Billing/settings — payment method, invoice history, plan management | ✅     | Billing settings now supports plan updates, Stripe portal handoff, payment-method display, and invoice history listing. |
| Web TypeScript build passing                                        | ✅     | Fixed 2026-04-09                                                                                                        |
| API TypeScript build passing                                        | ✅     | Fixed 2026-04-09                                                                                                        |

**Pilot blockers:** Onboarding must complete without manual DB intervention. Build must be green.
**Production gaps:** Auth + CRUD integration tests needed. Payment void now posts a real ledger reversal (see above); an audit trail for lease changes is still needed.

---

### Phase 2 — Core Workflows

| Item                                                                  | Status | Notes                                                                                                |
| --------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Stripe Connect onboarding for manager bank accounts                   | ✅     | `connect.ts`                                                                                         |
| ACH payment initiation + Stripe webhook handling                      | ✅     | `payments.ts`, `stripe.ts`                                                                           |
| Ledger entries                                                        | ✅     | `ledger.service.ts`                                                                                  |
| Work order CRUD, assignment, SLA breach job                           | ✅     |                                                                                                      |
| In-app messaging (REST polling, 5 s interval)                         | ✅     | WebSocket deferred to Phase 4+                                                                       |
| Email notifications — rent reminders, overdue, lease expiry, late fee | ✅     |                                                                                                      |
| Late fee auto-apply job                                               | ✅     |                                                                                                      |
| Rent generation job (monthly Payment records from leases)             | ✅     | `rentGenerationJob.ts`                                                                               |
| Lease renewal with linkage tracking                                   | ✅     |                                                                                                      |
| Vendor management                                                     | ✅     | Basic vendor list only, until Module 5 (§14) shipped full CRUD + expiry alerts/work-history/ratings/preferred-assignment logic on 2026-09-18 |
| Staff roles + permissions                                             | ✅     |                                                                                                      |
| Tenant list — search + operational filters                            | ✅     | Search by name/email/unit/property; lease-status and expiry (30d/60d) filters implemented (`tenants/page.tsx`) |
| Tenant detail — payment history section                               | ✅     | Payment history rendered at `tenants/[id]/page.tsx:502`                                              |
| Tenant detail — manager message thread                                | ✅     | Thread list + compose + send implemented at `tenants/[id]/page.tsx:547`                              |
| Tenant detail — move-out workflow                                     | ✅     | Move-out modal: date, deposit deductions, live return calc, terminates lease + creates deposit Payment |
| Message file/photo attachments (web)                                  | ✅     | Shipped alongside mobile attachment support (05-30-2026)                                             |
| ACH end-to-end flow validated (success + failure + refund)            | ✅     | Smoke-tested 2026-09-17 against real Stripe test-mode API — see write-up below |
| Financial controls (reconciliation, duplicate prevention, audit)      | ⚠️     | Payment void status-tracking (`voidPayment()`, `voidedAt`/`voidReason`) shipped, but it does not post a ledger reversal; reconciliation, duplicate-prevention, and true accounting reversal still not built |

**Pilot blockers:** None — all pilot-blocking items are implemented.
**Production gaps:** Financial reconciliation, duplicate-payment prevention, and an actual ledger-reversal on void (status-only void support now exists).

**ACH smoke test write-up (2026-09-17):** Ran against Stripe's real test-mode
API (not a live inbound webhook — see caveat below), driving the app's own
`stripe.service.ts` and `webhooks/stripe.ts` code, against a real local
Postgres:

- **Connect account setup** — `stripeService.getOrCreateConnectAccount` and
  `createAccountLink` genuinely exercised: created a real Express account
  (`acct_...`) and a real hosted onboarding URL via the live API. Completing
  onboarding itself (`charges_enabled`/`payouts_enabled` → true) requires
  Stripe's hosted, human-driven onboarding UI for Express accounts — Stripe
  rejects direct API writes of identity/business fields on Express accounts
  with `StripePermissionError: oauth_not_supported` (confirmed empirically,
  not assumed), so that step is inherently outside what any unattended
  script — ours or Stripe's own tooling — can complete. This is a real
  platform boundary, not a gap in this test.
- **ACH payment initiation** — real `PaymentMethod`s created with Stripe's
  documented test bank accounts (routing `110000000`) and confirmed with
  `mandate_data` + micro-deposit verification (`amounts: [32, 45]`, Stripe's
  test-mode instant-verify values). Account `000123456789` → PaymentIntent
  reached `succeeded`; account `000111111113` → reached
  `requires_payment_method` with a real `account_closed` decline. Because
  the connected account above couldn't complete onboarding, these
  PaymentIntents were created without `transfer_data.destination` (platform
  charge, not a Connect destination charge) — confirmed separately that
  attempting `transfer_data.destination` against an unactivated connected
  account fails with `insufficient_capabilities_for_transfer`, which is the
  correct, expected Stripe behavior.
- **Webhook receipt → ledger update** — the real succeeded/failed
  PaymentIntents (and a real `Refund` issued via `stripe.refunds.create`)
  were wrapped in genuine Stripe event envelopes and delivered to the
  app's actual `stripeWebhookHandler`, signed with
  `Stripe.webhooks.generateTestHeaderString` so the handler's real HMAC
  verification (`stripe.webhooks.constructEvent`) ran unmodified — this
  is the one substitution: Stripe couldn't deliver the webhook to a public
  endpoint from this sandboxed environment, so the event envelope was
  relayed locally instead of over the wire, everything downstream of
  signature verification is the real handler running unmodified. Verified
  against the real local DB: `payment_intent.succeeded` → `Payment.status`
  → `completed` + ledger credit; `payment_intent.payment_failed` →
  `Payment.status` → `failed`; `charge.refunded` (issued on the successful
  payment) → `Payment.status` → `refunded` + ledger debit. No bugs found —
  all three scenarios passed on the first fully-wired run.
- **Regression coverage** — `apps/api/tests/stripe-webhook-ach.test.ts`
  already covered `payment_intent.succeeded`/`payment_intent.payment_failed`
  and `setup_intent.succeeded`; this pass added mocked coverage for
  `charge.refunded` (full + partial/incremental refund amount, and the
  no-matching-payment case) and `refund.updated` (including ignoring a
  refund that hasn't succeeded yet) — 48 tests passing across the API suite.

---

### Phase 3 — Tenant Mobile App

| Item                                                                       | Status | Notes                                                                      |
| -------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Expo Router scaffold + auth flow (welcome → login → forgot-password)       | ✅     |                                                                            |
| Home tab: rent due, open work orders, messages badge                       | ✅     |                                                                            |
| Payments tab: balance, Pay Now sheet, payment history + detail             | ✅     |                                                                            |
| Maintenance tab: active orders + submit new (with photo upload)            | ✅     |                                                                            |
| Messages tab: thread list → conversation screen                            | ✅     |                                                                            |
| Documents tab: lease/notices download                                      | ✅     |                                                                            |
| Account tab: profile, emergency contacts, current lease, sign out          | ✅     |                                                                            |
| Push token registration (Expo push)                                        | ✅     |                                                                            |
| Mobile build (`expo export`) passing                                       | ✅     | Fixed 2026-04-09 — added `platforms: ["ios","android"]` to app.json        |
| Mobile lint (ESLint v9) passing                                            | ✅     | Fixed 2026-04-09 — created `eslint.config.mjs`                             |
| Resident activation / invite-code entry screen                             | ✅     | Shipped: `apps/mobile/app/(auth)/activate.tsx`                             |
| Autopay / recurring payment toggle                                         | ✅     | Shipped: `AutopaySetupSheet.tsx` in Payments tab                           |
| Message photo/file attachments (mobile)                                    | ✅     | Document picker for message attachments shipped 05-30-2026                 |
| Notification preferences on Account tab                                    | ❌     | Not implemented — no notif-related code in `account.tsx`                  |
| Contact manager shortcut on Account/Home tab                               | ❌     | Not implemented                                                            |
| iOS + Android device smoke test                                            | ⚠️     | Not evidenced still — **could not be performed in the P3 review environment** (no macOS/Xcode for the iOS Simulator, no `/dev/kvm` or Android SDK for the Android Emulator; confirmed empirically, see 09-17-2026 write-up below). `expo export` (both platforms), lint, and typecheck all pass, and the core-flow screens (login, pay rent, submit work order with photo, send message) were verified by source review against their backing API routes. This is not a substitute for an on-device pass — still required before submission. |
| App Store submission readiness (icons, splash, EAS config, privacy policy) | ⚠️     | Icons/splash were literal 1×1 placeholder PNGs — replaced 09-17-2026 with real 1024×1024 brand-color assets (`apps/mobile/assets/{icon,adaptive-icon,splash-icon}.png`); still not final designer artwork. Privacy policy added: `apps/web/app/privacy/page.tsx`, linked from the mobile Account tab and the web signup page. EAS build credentials and Apple/Google developer account access are outside what this environment can verify or configure — still required before an actual submission. |
| Mobile CI coverage                                                         | ✅     | Mobile lint step added to `.github/workflows/ci.yml` (09-16-2026); mobile build already covered via `turbo run build` |

**Pilot blockers:** None remaining from this list — activation screen, autopay, and mobile CI are now in place.
**Production gaps:** Notification preferences + contact-manager shortcut on Account tab. Real on-device iOS/Android smoke test (still unverified — see note above). EAS build credentials and Apple/Google developer account setup, which this environment cannot provide.

**Mobile verification write-up (2026-09-17):** Ran in the same sandboxed Linux
container as the rest of this P3 pass, which has no iOS Simulator (no macOS/Xcode)
and no Android Emulator (`/dev/kvm` absent, no Android SDK installed) —
confirmed by directly checking for both before concluding device testing
wasn't possible here, rather than assuming it. What *was* verified:
`expo export` succeeds for both `ios` and `android` bundles (2,949/2,947
modules respectively, including the new icon assets); `eslint` and `tsc
--noEmit` are clean; and the four core-flow screens (login, Pay Now sheet,
`SubmitWorkOrderSheet` with `expo-image-picker` + upload flow, messages
compose/attach) were read end-to-end and checked against the API routes and
services they call, all of which were separately verified during the
security review below to be correctly org-scoped and auth-gated. This is a
source-level review, not a live device run, and does not exercise real touch
input, native permission prompts, push delivery, or platform-specific
rendering — an actual iOS/Android device or simulator pass is still needed
before submission and is the responsibility of whoever has that hardware/
tooling available.

---

### Cross-Cutting Status

| Item                                                             | Status |
| ---------------------------------------------------------------- | ------ |
| Web build (`tsc --noEmit`) green                                 | ✅     |
| API build (`tsc --noEmit`) green                                 | ✅     |
| Mobile build (`expo export`) green                               | ✅     |
| Mobile lint green (now covered in CI)                             | ✅     |
| API automated tests runnable on clean install                    | ⚠️     |
| Seed / demo environment end-to-end workflow                      | ⚠️     |
| Real observability (logs, error monitoring, alerting)            | ✅     | Sentry wired into web, API, and mobile (05-31-2026) |
| Rate limiting on public/auth/payment endpoints                   | ✅     | `middleware/rate-limit.ts` now applied to invite/apply/sign routes **and** `/auth/register`, `/auth/forgot-password`, `/auth/signup-initiate` (`authRateLimit`, previously defined but never wired — closed 09-17-2026), plus tenant-portal payment-initiation routes (`paymentRateLimit`, same gap) |
| Security review (auth, file access, org isolation, webhook HMAC) | ✅     | Formal audit completed 09-17-2026 — see write-up below. Findings fixed; none deferred. |
| Financial accuracy tests (payments, refunds, late fees, ledger)  | ❌     |

**Security review write-up (2026-09-17, P3):** Systematic pass across API route
files, their backing services, the webhook handler, and rate-limit config,
following on from the reactive work-order leak fix (07-19-2026, `75b0bb8`).
Findings, all fixed in this pass:

- **Org isolation — `workOrder.service.ts`, `createWorkOrder`:** a
  caller-supplied `tenantId` was written to a unit-scoped work order without
  verifying it belonged to the requesting org, letting an authenticated user
  in Org A attach (and thereby expose, via the response's `tenant` include)
  another org's tenant name/email/phone to a work order in Org A — and
  surface that work order in the wrong tenant's own portal. Fixed by
  verifying the tenant against `organizationId` before use, mirroring the
  existing unit/property verification in the same function.
- **Org isolation — `workOrder.service.ts`, `updateWorkOrder`:**
  `vendorId`/`assignedToUserId` were written directly from the request body
  with no org check, letting a work order in Org A be assigned to a vendor
  or staff user belonging to a different org (leaking their contact info via
  the same `include`). Fixed by verifying both against `organizationId`
  before the update.
- **Identity spoofing — `routes/documents.ts`:** `resolveUserId()` fell back
  to a client-controlled `x-user-id` header whenever `req.user` was unset.
  In the current route wiring `requireAuth` always runs first so this path
  wasn't reachable, but it was a live spoofing vector waiting for any future
  reordering or reuse of the helper, and served no legitimate purpose.
  Removed; the function now only reads `req.user.userId`.
- **Rate limiting gap:** `authRateLimit` and `paymentRateLimit` were defined
  in `middleware/rate-limit.ts` but never applied anywhere. The public,
  unauthenticated `/auth/register`, `/auth/forgot-password`, and
  `/auth/signup-initiate` endpoints (prime email-enumeration/spam targets)
  had only the blanket 500-req/15-min global limit. Wired `authRateLimit`
  (10/15 min) onto all three, and `paymentRateLimit` (30/15 min) onto the
  tenant-portal payment-initiation routes it was evidently built for.
- **Timing side-channel — `routes/notificationJobs.ts`:** the `CRON_SECRET`
  check used `!==` string comparison. Switched to `crypto.timingSafeEqual`
  with a length check first (equal-length buffers required for
  `timingSafeEqual`).
- **Documentation bug:** `BUILD_OUTLINE.md` §9 and `docs/reference/routes.md`
  both claimed a `POST /api/webhooks/auth` Supabase auth webhook existed;
  `apps/api/src/index.ts` registers only `/api/webhooks/stripe`. No such
  endpoint — and therefore no such attack surface — ever existed. Corrected
  both docs.

Areas reviewed and found correctly implemented, no changes needed: the
Stripe webhook's HMAC verification (`stripe.webhooks.constructEvent` against
the raw body, registered before `express.json()`, rejects on bad signature);
Supabase Storage document/attachment access (org-scoped `findFirst` before
every signed-URL mint, 900s upload / 3600s download expiry, org-prefixed
storage keys); tenant-portal and owner-portal data access (every query
scoped to the authenticated tenant's/owner's own ID, never a client-supplied
one); module-gating (`requireModule` resolves org fresh per request from
whichever auth identity is present, fails closed); and role-gating
consistency with `docs/reference/rbac.md`'s documented (intentional) gaps —
no route was found open to a wider audience than that doc already describes.
A broader Explore-agent pass across the remaining service files
(property/unit/lease/tenant/owner/staff/ledger/notification/report/payment/
vendor/lease-esignature/rental-application/screening) found no further
org-scoping gaps.

---

## 13. Priority Roadmap Recommendation

_Sourced from MVP review, 2026-05-26. Re-verified against code 2026-09-16 — items 1–4 and 6–9 below have since shipped and are struck through; see §11/§12 for what landed and when._

### Now (before any paying customers)

1. ~~Tenant invite-code activation screen (mobile)~~ — **Done.** `apps/mobile/app/(auth)/activate.tsx`.
2. ~~Stripe webhook security audit + rate limiting~~ — **Done (2026-09-17).** Rate limiting now covers invite/apply/sign routes plus the auth and tenant-payment endpoints it was missing from. The formal security audit (webhook HMAC, org isolation, file access, auth/role gating) is complete — see Cross-Cutting Status for the full write-up.
3. ~~Error monitoring (Sentry)~~ — **Done.** Wired into API, mobile, and web.
4. ~~Autopay UI toggle (mobile)~~ — **Done.** `AutopaySetupSheet.tsx`.
5. ~~End-to-end ACH smoke test in Stripe sandbox~~ — **Done (2026-09-17).** Success, failure, and refund all verified against real Stripe test-mode objects through the app's actual webhook handler — see §12's write-up. Connect onboarding *completion* (charges/payouts enabled) remains a Stripe-hosted, human-driven step by design — confirmed via a real `StripePermissionError` when attempting to bypass it via API — not something any automated test can complete.

### Next 60 days (MVP launch)

6. ~~Online rental application form + e-signature (Module 1)~~ — **Done** (`routes/apply.ts`, `routes/sign.ts`). Note: this covers the application + e-sign steps only — background/credit check integration (TransUnion or similar) is still not built.
7. ~~Message file attachments (Web + Mobile)~~ — **Done** on both platforms.
8. ~~SMS via Twilio~~ — **Done**, with fallback to email when unconfigured.
9. ~~Financial audit trail~~ — **Partially done.** Payment void status-tracking shipped (`voidPayment()`, `voidedAt`/`voidReason`), but it only flags the payment — it does not post a counterpart ledger entry or restore the ledger balance. Reconciliation, duplicate-prevention, and true accounting reversal still not built.
10. **Guided onboarding walkthrough with help text** — still open. The onboarding wizard exists but has no tooltips or empty-state coaching for first-time property managers.

### New since last pass (found in this review)

16. ~~Module gating infrastructure~~ — **Done (2026-09-17).** `Organization.activeModules`, the `requireModule(...)` API middleware, and the web `<ModuleGate>` component now exist and are wired to Modules 9 (Owner Portal) and 11 (Reporting & Analytics) — see #12 and `docs/reference/modules.md`. Activation is currently a manual toggle (Settings → Organization, or `PATCH /organizations/:orgId`), not Stripe Subscription Item billing — that wiring is still open and is the remaining step before selling these as paid upsells.
17. **Background/credit check integration for Module 1** — the application + e-signature flow is built; the screening/credit-check step (TransUnion SmartMove or equivalent) against the existing `screeningConsentAt`/`ssnFullEncrypted`/`govtIdNumber` fields is not.
18. ~~Formal security review~~ — **Done (2026-09-17).** Systematic audit across auth, file access, org isolation, and webhook HMAC verification, following on from the reactive 07-19-2026 work-order leak fix; found and fixed two further org-scoping gaps plus a rate-limiting gap and an identity-spoofing vector — see Cross-Cutting Status for the full write-up.
19. **Notification preferences + contact-manager shortcut (mobile Account tab)** — spec'd in §8 but not implemented.
20. **iOS/Android device smoke test + full App Store submission prep** — icons/splash and a privacy policy landed 09-17-2026 (see Phase 3 table), but a real on-device pass, EAS build credentials, and Apple/Google developer account setup are still outside what this environment can verify or provide.

### Months 3–6 (growth phase)

11. **Full accounting module (P&L, bank reconciliation, Schedule E)** — Module 4 in the roadmap (renumbered from the module table in §7). Required to compete with DoorLoop and Buildium at scale.
12. ~~Owner portal~~ — **Done** (Module 9), ahead of schedule: `Owner`/`PropertyOwner`/`OwnerStatement` data model, manager-facing routes, owner-facing auth (`requireOwnerAuth`), and the owner portal web UI all exist; it still needs module-gating (see #16).
13. **Tenant credit reporting** — free differentiator that drives mobile adoption; tenants who report rent to credit bureaus are stickier.
14. **Vacancy listing syndication** — Module 8. Top-of-funnel capture from Zillow/Apartments.com.
15. **AI maintenance triage** — differentiator; auto-categorizes and prioritizes work orders on submission.

> **Bottom line (updated 2026-09-17):** The product has moved past most of its original MVP gap list — activation flow, autopay, Sentry, rate limiting, SMS, and attachments are all fully shipped, and two "Low priority" modules (Owner Portal, Reporting & Analytics) are now fully built functionally, ahead of schedule, including payment void's ledger reversal. Module gating infrastructure has also landed (`activeModules`, `requireModule`, `<ModuleGate>`), so Modules 9 and 11 are no longer unbilled free features — they're now behind a manual on/off toggle pending real Stripe billing. The ACH money-movement path has also now been smoke-tested end-to-end (success, failure, refund) against real Stripe test-mode objects, with no bugs found. The formal security review is also now done (org isolation, file access, webhook HMAC, auth/role gating), with the gaps it found fixed in the same pass. What's left before a confident launch is narrower and more operational: Stripe Subscription Item billing to replace the manual module toggle, finishing Module 1's screening step, and a real on-device mobile smoke test plus App Store/Play Store submission logistics (EAS credentials, developer accounts) that no sandboxed environment can complete. The data model was already designed for all of this — execution continues to be the remaining work, not redesign.

---

## 14. Add-On Module Documentation

> Add-on modules are Phase 4+ features. They are outside base-product scope and will not be built until the pilot gate is cleared and early user feedback has been collected. Each module is feature-flagged at the API middleware layer via `organization.activeModules` and billed as additional Stripe Subscription Items. UI components are gated behind a `<ModuleGate module="...">` wrapper.
>
> **Update (2026-09-17):** the gating mechanism itself now exists —
> `Organization.activeModules` (String[]), the `requireModule(...)` API
> middleware, and the web `<ModuleGate>` component — and is wired to
> Modules 9 and 11 (the two modules that had shipped functionality ahead of
> gating) plus the screening step of Module 1, built in this same update
> (see their sections below and `docs/reference/modules.md`). Stripe
> Subscription Item billing is still not wired; activation today is a manual
> `activeModules` toggle (Settings → Organization → "Add-On Modules", or
> `PATCH /organizations/:orgId`), open to any owner/manager. No other module
> has functionality built yet, so no other module needs gating today.

---

### Module 1 — Advanced Tenant Onboarding

**Target price:** $25–40/mo
**Priority:** High

**What it adds:**

- Digital rental application with configurable question sets
- Background and credit check integration (TransUnion SmartMove or similar)
- E-lease signing via DocuSign or HelloSign
- Move-in inspection template with timestamped photo capture
- Screening consent capture (legally required before running any check)

**Data hooks already in schema:**

- `ssn_full_encrypted` (Tenant, RentalApplication) — encrypted at rest, never logged
- `screening_consent_at` (Tenant, RentalApplication) — required before check is triggered
- `govt_id_number` (Tenant, RentalApplication) — stored encrypted

**Status (2026-09-17):** the digital rental application and e-lease signing
shipped ahead of the module (see §14 intro / §11 delta appendix) and remain
ungated, since they're base-product functionality. The screening step —
consent capture, encrypted SSN/govt ID capture, and a background/credit
check — is now built and **gated behind `advanced_tenant_onboarding`** in
`Organization.activeModules`:

- Consent + SSN/govt ID are captured as an extra step in the same
  `POST /apply/:token` submission (`ssnFullEncrypted`/`govtIdNumber`
  encrypted via `encryption.service.ts`, AES-256-GCM — an application-level
  stand-in for envelope/KMS encryption), only when the org has the module
  active (`GET /apply/:token` now returns `screeningModuleActive` so the
  form can show/hide the step).
- `requireModule('advanced_tenant_onboarding')` gates
  `POST`/`GET /organizations/:orgId/applications/:id/screening` — applied
  per-route rather than at router mount, since the rest of
  `applications.ts` (link generation, review, e-sign) ships ungated as base
  product. See `docs/reference/modules.md` and `docs/reference/rbac.md`.
- A new `ScreeningCheck` model (per-RentalApplication) records each check's
  status/decision. Running a check requires `screeningConsentAt` to be set
  first (`SCREENING_CONSENT_REQUIRED` otherwise).
- The manager review page (`/applications/:id`) shows consent status, lets
  a manager trigger a check, and displays the resulting status/decision
  before they approve or deny — approval still drives the existing
  tenant + draft-lease creation path, now also copying the encrypted
  SSN/govt ID and consent timestamp onto the new `Tenant` record.
- **The TransUnion SmartMove API call itself is mocked** —
  `screening-provider.client.ts` defines a `ScreeningProviderClient`
  interface; `MockTransUnionSmartMoveClient` (always used today, no
  environment has SmartMove credentials) fabricates a `recommend` result
  without any network call. `TransUnionSmartMoveClient` sketches the real
  integration but its request/response shape is unverified against
  TransUnion's actual API and needs confirmation once credentials exist.

Not yet built: move-in inspection template, and any DocuSign/HelloSign
integration (e-signing already ships via PropFlow's own in-house flow, not
a third-party e-sign vendor).

**Dependencies:** Lease management, Stripe, Resend, third-party screening API

---

### Module 2 — Unit Intelligence & Appliance Registry

**Target price:** $20–35/mo
**Priority:** High

**What it adds:**

- Per-unit appliance records: make, model, serial number, warranty expiry, purchase date
- Maintenance cost tracking per appliance over time
- Age-based replacement alerts (e.g. HVAC approaching end of life)
- QR code label generation for each appliance (scannable in the field)
- Appliance-linked work orders (tie a work order directly to a specific appliance)

**Status (2026-09-17):** Built and gated behind `requireModule('unit_intelligence')` —
see `docs/reference/modules.md` for the full gating detail. Summary:

- **Appliance records** — shipped. A new `Appliance` model (`unitId` FK, `category`,
  `make`, `model`, `serialNumber`, `purchaseDate`, `installDate`,
  `warrantyExpiresAt`, `notes`) with full CRUD (`GET/POST/PATCH/DELETE
  .../units/:unitId/appliances[/:applianceId]`) and a matching card on the
  existing unit detail page — no separate appliance-management page.
- **Maintenance cost tracking** — shipped, but reuses `WorkOrder`'s existing
  `laborCost`/`partsCost`/`totalCost` fields rather than a dedicated cost
  ledger. Each appliance exposes a `totalMaintenanceCost` (sum of
  `totalCost` across its linked work orders) and a `maintenanceHistory` list
  (the linked work orders themselves, most recent first) on `GET
  .../appliances/:applianceId`. There's no separate cost-over-time chart —
  just the running total and the underlying work order list.
- **Age-based replacement alerts** — shipped, computed on read (not
  persisted, no background job or notification). Each category has a rough
  industry-standard expected lifespan in years (`APPLIANCE_EXPECTED_LIFESPAN_YEARS`
  in `packages/shared/src/constants/index.ts`, e.g. 15 years for HVAC, 10 for
  a water heater) — not manufacturer-specific data. An appliance is flagged
  `approaching` within 2 years of that threshold and `overdue` once past it,
  measured from `installDate` (falling back to `purchaseDate`, or no alert
  at all if neither is recorded). Surfaced as a badge in the unit detail
  appliance table only — not on the manager dashboard.
- **QR code label generation** — shipped, using the `qrcode` npm package
  client-side (no new API endpoint). There is **no dedicated per-appliance
  detail page** in the app — the QR code encodes a link back to the unit
  detail page with `?appliance=<id>`, which scrolls to and highlights that
  appliance's row. "Print" opens the browser print dialog scoped to the
  label via a print media query; it is not a formatted label-stock template.
- **Appliance-linked work orders** — shipped. `WorkOrder.applianceId`
  (optional FK, `ON DELETE SET NULL`) can be set on work order creation or
  update; the API verifies the appliance belongs to the *same unit* as the
  work order. Deleting an appliance keeps its work order history — the FK
  is nulled out, not cascaded.
- **`Unit.applianceCount`** — no longer a dormant placeholder. It's
  recomputed (via `appliance.count()`, not an in-place increment/decrement —
  see `docs/reference/schema.md` for why) inside the same transaction as
  every appliance create/delete/retire/replace, so it always reflects the
  live count of currently-*active* appliances rather than being maintained
  by a separate reconciliation job.
- **Appliance replacement history** — shipped (2026-09-17). An appliance is
  never silently overwritten or lost when it's swapped out: `Appliance.status`
  (`active`/`removed`) plus `removedAt` let a manager either **retire** an
  appliance (`POST .../appliances/:id/retire` — marked removed, no
  replacement) or **replace** it (`POST .../appliances/:id/replace` — retires
  the old one and creates a new one in one step, linked via the new
  `Appliance.replacesApplianceId` self-relation). The unit detail page splits
  appliances into a "Current Appliances" section and an "Appliance History"
  section showing each retired appliance's install→removed date range and a
  link to what replaced it (and vice versa). `DELETE` (hard delete) still
  exists separately, for correcting a mistaken/duplicate record — it's not
  the retirement path. `Unit.applianceCount` only counts active appliances,
  so replacing one appliance for another leaves the count unchanged.
- **Not built**: no S3-backed photo/document attachment specific to
  appliances (the module roadmap lists S3 as a dependency, but appliance
  records don't yet hook into the existing `Document` model the way units
  and leases do), no manufacturer-specific lifespan data or recall lookups
  (the expected-lifespan table is a rough per-category heuristic), and no
  UI restriction preventing a hard `DELETE` of an appliance that already has
  replacement history (deleting it just nulls out the `replacesApplianceId`
  FK on whatever replaced it, per standard `ON DELETE SET NULL`).

**Dependencies:** Unit management, S3

---

### Module 3 — Grounds & Property Maintenance

**Target price:** $25–40/mo
**Priority:** Medium

**What it adds:**

- Recurring task scheduling for common areas (landscaping, HVAC filter changes, pest control)
- Vendor assignment to recurring tasks
- Inspection log with completion photo requirement
- Task completion history and compliance reporting

**Status (2026-09-18): gated + shipped.** Read this before assuming any
bullet above is fully built as originally scoped — see `docs/reference/modules.md`
for the full gating detail.

- **Recurring task scheduling — the net-new piece.** A new `MaintenanceSchedule`
  model (`property`, `title`, `category`/`locationType` reusing `WorkOrder`'s
  own enums, `cadence: weekly|monthly|quarterly|semi_annual|annual`,
  `vendorId?`, `nextDueDate`, `active`) with CRUD at
  `.../properties/:propertyId/maintenance-schedules[/:scheduleId]`. A daily
  recurrence job (`groundsMaintenanceJob.ts`) generates a real `WorkOrder`
  for each due, active schedule and advances `nextDueDate` forward by one
  cadence period — mirrors how `rentGenerationJob.ts` generates monthly
  `Payment` records from active leases. **Cadence is a fixed set, not a
  full cron-style recurrence-rule engine** — no "every 2nd Tuesday", no
  custom day-of-month/interval, and a schedule missed for multiple periods
  (e.g. after downtime) generates exactly one catch-up work order per run
  rather than backfilling every missed occurrence.
- **Vendor assignment to recurring tasks** — shipped as scoped:
  `MaintenanceSchedule.vendorId` (reusing the existing `Vendor` model, not a
  new one) auto-populates `WorkOrder.vendorId` on every generated work
  order, which also auto-transitions the generated order's status to
  `assigned` instead of `new_order`. This is a single preferred/default
  vendor per schedule, not the fuller "preferred vendor per category" logic
  Module 5 (Vendor & Contractor Management) added later (2026-09-18, see
  §14) — that fallback only applies when this field is left unset; a
  schedule's own explicit vendor still always wins.
- **Inspection log with completion-photo requirement** — reuses Module 6's
  `Inspection`/`InspectionMedia` models rather than a second, parallel
  table: `Inspection.unitId` is now nullable and a nullable `propertyId` FK
  was added, plus a new `InspectionType.grounds` value, so a property-scoped
  "grounds" inspection is just another row in the same table as unit-scoped
  move-in/move-out/etc inspections. Property-scoped inspections are created
  and completed through a **separate, parallel set of service functions and
  routes** (`.../properties/:propertyId/inspections[/:id]`) rather than the
  existing unit-scoped ones, since every function in `inspection.service.ts`
  built for Module 6 hard-requires a `unitId` — see `docs/reference/schema.md`
  for why sharing them wasn't worth threading unitId-or-propertyId through
  every function. Grounds inspections skip checklist templates, leases, and
  signature capture entirely (those stay unit-scoped Module 6 concepts) —
  they're just a scheduled/in-progress/completed/cancelled record with
  attached media. **The completion-photo requirement is real and enforced
  server-side**: `POST .../inspections/:id/complete` 400s with
  `PHOTO_REQUIRED` unless at least one `InspectionMedia` row with
  `mediaType: photo` already exists on that inspection — a video alone does
  not satisfy it.
- **Task completion history and compliance reporting** — `GET
  .../reports/grounds-maintenance-compliance`, per property: generated
  work-order count, completed-on-time vs. completed-late (comparing
  `completedAt` to the `scheduledAt` the work order was generated with),
  still-open-and-overdue count, a photo-compliance rate (% of completed
  generated work orders with at least one `photosAfter` entry), and a
  separate completed-grounds-inspection count. **Recurring task generation
  and the grounds inspection log are two independent mechanisms in this
  v1** — a generated work order is not required to have a matching grounds
  `Inspection`, and the photo-compliance rate only looks at `photosAfter`
  on the generated work orders themselves, not whether an inspection was
  also logged for the same period. Gating decision, made explicit here per
  the pattern Module 4's Schedule E export established: this report is
  gated behind **both** `grounds_maintenance` and `reporting_analytics`
  (stacked on top of `reports.ts`'s existing Module 11 mount-level gate) —
  it lives alongside this org's other reports rather than under its own
  module's CRUD routes, but still requires Module 3 active since the data
  it reports on is Module 3's own.

**Not built**: custom/interval-based recurrence rules beyond the fixed
cadence set, a per-category "preferred vendor" picker (single vendor per
schedule only), linking a generated work order to a specific grounds
`Inspection`, and any standalone nav page — both features live as cards on
the existing property detail page (`/properties/[id]`), mirroring how
Modules 2/6 avoided sidebar nav complexity.

**Data hooks now in schema:** `WorkOrder.scheduleId` (FK →
`MaintenanceSchedule`, `ON DELETE SET NULL`) and `Inspection.propertyId` —
see `docs/reference/schema.md`. Module 3 no longer has "no dedicated schema
hooks" as previously noted; that note has been removed from
`docs/reference/modules.md`.

**Dependencies:** Work orders, Vendor management

---

### Module 4 — Advanced Payments & Accounting

**Target price:** $30–50/mo
**Priority:** Medium

**What it adds:**

- Card payment acceptance (in addition to ACH)
- Partial payment handling with balance carry-forward
- Security deposit reconciliation against move-in/move-out inspections
- Owner disbursements with configurable management fee deductions
- Profit & loss reporting by property
- Schedule E export for tax filing

**Status (2026-09-17):** Built and gated behind `requireModule('advanced_payments_accounting')`
— see `docs/reference/modules.md` for the per-feature gating detail and what's
partial. Summary:

- **Card payments** — shipped. `POST /payments/:paymentId/initiate-card`
  (manager) and `POST /tenant/payments/initiate-card` (tenant) create a
  Stripe PaymentIntent with `payment_method_types: ['card']` instead of
  `['us_bank_account']`; the existing `payment_intent.succeeded` webhook is
  method-agnostic and needed no changes.
- **Partial payment handling** — shipped, but scoped to manually-recorded
  payments only (cash/check/money order/card-in-person via
  `POST /payments/:paymentId/record-partial`). It splits the payment down to
  the amount actually received and creates a new pending payment for the
  remainder, due the same date. **Not supported**: a tenant paying a partial
  amount through the self-service ACH/card checkout flow — that still
  requires paying the PaymentIntent's full amount.
- **Security deposit reconciliation** — shipped as a formal
  `SecurityDepositDisposition` record (`POST`/`GET
  /leases/:leaseId/security-deposit-disposition`), built from the deposit
  amount vs. itemized deductions the existing move-out workflow already
  captures. As of Module 6 (Inspections & Compliance) shipping, it also
  looks up the lease's completed move-in/move-out `Inspection` records (if
  any) and links them via `moveInInspectionId`/`moveOutInspectionId`.
  `moveInConditionNotes`/`moveOutConditionNotes` remain as manager-entered
  free text for backward compatibility and for leases with no inspection on
  file — they're never discarded even when a linked inspection exists.
- **Owner disbursements** — shipped as a `Disbursement` record
  (`POST`/`GET /owners/statements/:statementId/disbursements`,
  `PATCH /owners/disbursements/:disbursementId`) computed from an
  `OwnerStatement.distributionAmount` minus a management-fee percentage
  (org-wide default on `Organization.defaultManagementFeePct`, overridable
  per-disbursement). **This is a bookkeeping record only** — there is no
  payout wiring to the owner's bank account, because Owner Portal doesn't
  capture owner bank details (see the Owner Portal dependency note below).
  `status` just tracks whether the manager marked the money as sent outside
  the app.
- **Profit & loss reporting by property** — already existed as Module 11's
  `GET /reports/financial-summary` (income/expenses/NOI by property, with
  owner-share breakdown), built in P0 and gated behind
  `reporting_analytics`. Module 4 does not duplicate it; see the gating
  decision in `docs/reference/modules.md`.
- **Schedule E export** — shipped as `GET /reports/schedule-e-export`, gated
  behind **both** `reporting_analytics` (the router mount) and
  `advanced_payments_accounting` (per-route). It's a data export for a tax
  preparer to transfer into the real form — projecting rents received, other
  income, repairs/maintenance expenses, recorded management fees, and
  `Property.taxParcelId` per property — **not** a filled IRS Schedule E PDF.

**Data hooks already in schema:**

- `tax_parcel_id` (Property) — needed for Schedule E

**Dependencies:** Stripe, Payment ledger, Owner Portal module (for
disbursements) — Owner Portal itself has no owner-facing bank-account
capture or payout flow, which is why disbursements stop at a bookkeeping
record rather than an actual funds transfer.

---

### Module 5 — Vendor & Contractor Management

**Target price:** $20–30/mo
**Priority:** Medium

**Status: gated + shipped (2026-09-18).** What actually built, and exactly
how it's simplified relative to the original spec above — read this before
assuming any bullet below is fully built as originally scoped:

- **Full vendor database with contact info, license numbers, insurance
  certificates — built out as ungated base product, not gated.** The
  `Vendor` model already had every field the spec needed, but the API only
  ever exposed a list endpoint before this change — there was no
  create/get/update/delete at all. `vendor.service.ts`/`routes/vendors.ts`
  now have full CRUD (`GET`/`POST`/`PATCH`/`DELETE .../vendors[/:vendorId]`),
  ungated, same reasoning as every other resource's base CRUD in this
  codebase (record-keeping, not a paid add-on capability). Deleting a
  vendor is blocked once it has any linked `WorkOrder` or
  `MaintenanceSchedule` history (`400 VENDOR_HAS_HISTORY`) — set it inactive
  instead.
- **License and insurance expiry alerts — gated, real, computed live.**
  `GET .../vendors/expiry-alerts` (gated behind `vendor_management`) flags
  active vendors whose `licenseExpiresAt`/`insuranceExpiresAt` is already
  past or within a 30-day lookahead (`VENDOR_EXPIRY_ALERT_LOOKAHEAD_DAYS`).
  Surfaced on the manager dashboard as a "Vendor License/Insurance Alerts"
  card, gated with `<ModuleGate module="vendor_management">` and fetched
  only when the org's `activeModules` already includes the key. A daily
  `vendorExpiryAlertJob.ts` mirrors `rentGenerationJob.ts`'s scan-and-log
  pattern, but — unlike that job or the SLA breach job — it doesn't persist
  anything new: expiry status is fully derivable from the two existing date
  columns, so the job only logs a per-org count for ops visibility, and it
  is not the source the dashboard/endpoint read from (both compute the same
  set live on each request).
- **Work history and spend tracking per vendor — gated, real.**
  `GET .../vendors/:vendorId/work-history?months=` aggregates completed/
  closed `WorkOrder`s by count, total spend (`totalCost` if set, else
  `laborCost + partsCost`), and category breakdown, over a selectable
  lookback window (default 12 months). This automatically covers Module 3
  schedule-generated work orders too — they're just ordinary `WorkOrder`
  rows with `vendorId` set, no special-casing needed. **Decision: this
  endpoint is gated behind `vendor_management`, not Module 11's
  `reporting_analytics`** — it's vendor-specific detail info (like Module
  2's per-appliance `totalMaintenanceCost` rollup, gated under
  `unit_intelligence` rather than reporting), not a cross-vendor report.
  There's no dedicated vendor detail page in the web app to display it on
  (see below) — it's reachable via the API only as of this change.
- **Star ratings and notes per work order completion — gated, real, but a
  separate action from completion.** A new `VendorWorkOrderRating` model
  (`workOrderId` unique — one rating per work order, `vendorId`, `rating`
  1-5, `note?`) is captured via `POST
  .../work-orders/:workOrderId/vendor-rating`, which requires the work
  order to already be `completed`/`closed` and have a vendor assigned. This
  is **not** folded into the completion `PATCH` itself — rating a vendor is
  a follow-up call a manager makes after marking a work order complete, not
  an atomic part of that transition. Each new rating recomputes
  `Vendor.rating` as the average of all of that vendor's ratings (kept as a
  rolling-average field rather than replaced, so its existing consumers —
  e.g. vendor list ordering — are unaffected).
- **Preferred vendor assignments per property or category — gated, real,
  but category-required, not a fully independent two-dimension system.** A
  new `PreferredVendorAssignment` model (`propertyId?`, `category`
  required, `vendorId`) replaces `Vendor.preferred`'s role in
  auto-assignment (the boolean is kept, unused, for display/back-compat).
  `propertyId` narrows an assignment to one property; omitting it makes it
  the org-wide default for that category. **There is no property-scoped,
  category-agnostic assignment** ("always use vendor X for this property
  regardless of category") — every assignment needs a category, since
  work-order creation always has one to match on. Resolution is
  property+category first, then org-wide-by-category, else no default.
  Consulted by **both** manually-created work orders
  (`workOrder.service.ts`'s `createWorkOrder`, when no `vendorId` is
  explicitly supplied) and Module 3's recurrence job
  (`generateWorkOrderForSchedule`, when the schedule itself has no vendor of
  its own — the schedule's own `vendorId` still always wins over this
  fallback). CRUD for assignments lives at
  `GET`/`POST`/`DELETE .../vendors/preferred-assignments[/:assignmentId]`,
  gated.
- **Vendor management web UI — added as a follow-up on this PR.** The
  gated dashboard alert widget described above shipped first; a dedicated
  vendor list/detail/CRUD page followed in the same PR:
  - `/vendors` — vendor list (ungated base CRUD): search/filter by
    status and specialty, a create form, and license/insurance expiry
    badges (the list endpoint's `select` was extended to include
    `licenseExpiresAt`/`insuranceExpiresAt`, which weren't previously
    selected there).
  - `/vendors/[vendorId]` — vendor detail (ungated base CRUD for
    view/edit/delete), plus two sections gated behind
    `<ModuleGate module="vendor_management">`: a work-history/spend view
    (`GET .../vendors/:vendorId/work-history?months=`, selectable
    3/6/12/24-month range) and a "Preferred For" list (reads
    `GET .../vendors/preferred-assignments`, filtered client-side to the
    current vendor).
  - Preferred-vendor-assignment CRUD itself lives on
    `/settings/organization` (a new gated "Preferred Vendors" card), not
    the vendor detail page — it's a property/category × vendor matrix,
    a better fit next to the existing module-toggle settings than
    duplicated per-vendor UI.
  - The work-order detail page (`/work-orders/[id]`) gained a gated
    "Vendor Rating" sidebar card, shown only when the order has an
    assigned vendor and is `completed`/`closed`, posting to
    `POST .../work-orders/:workOrderId/vendor-rating`.
    `workOrder.service.ts`'s `getWorkOrder`/`getWorkOrders` `include` was
    extended with a `vendorRating` select so the UI knows whether a
    rating already exists without an extra request.
  - A "Vendors" nav link was added (ungated, shown to `maintenance` too,
    matching that role's existing access to `vendors.ts`), with an
    expiry-alert count badge next to it, gated.
  - **What's still not covered**: there is no endpoint to list a vendor's
    full rating history. The detail page's work-history/spend view only
    surfaces the up-to-10 most recent ratings *within the selected month
    range* (`getVendorWorkHistory`'s existing `ratings.recent` field) plus
    the all-time rolling `Vendor.rating` average — a dedicated "list every
    rating for this vendor" endpoint would be new backend work and was
    judged out of scope for this UI follow-up.

**Data hooks already in schema:**

- `w9_on_file` (Vendor) — still dormant; 1099 tax-reporting export was not
  part of this change's scope.

**Dependencies:** Work orders

---

### Module 6 — Inspections & Compliance

**Target price:** $25–40/mo
**Priority:** Medium

**Status: gated + shipped (2026-09-18).** What actually built, and exactly
how it's simplified relative to the original spec above — read this before
assuming any bullet below is fully built as originally scoped:

- **Inspection scheduling & workflow** — an `Inspection` model
  (`type: move_in|move_out|scheduled|annual|semi_annual`,
  `status: scheduled|in_progress|completed|cancelled`, nullable `leaseId`
  FK so move-in/move-out inspections tie to the lease they're comparing for
  deposit purposes, nullable `inspectorUserId` FK) with CRUD + schedule +
  assign-inspector + complete + cancel at
  `.../units/:unitId/inspections[/:inspectionId]`, gated behind
  `requireModule('inspections_compliance')` at that router's mount in
  `units.ts` (same pattern as Module 2's appliances). A `maintenance`-role
  user may complete an inspection only if they're its assigned inspector;
  `owner`/`manager` may complete any.
- **Checklist templates — partially configurable, not property-type-aware.**
  An `InspectionTemplate` model (`checklistItems: Json`, array of
  `{section, item, description?}`) is real per-organization stored data
  with basic CRUD (`.../organizations/:orgId/inspection-templates`) — **not**
  a hardcoded array in code. But v1 ships with a single seeded default
  checklist (kitchen, bathrooms, bedrooms, living areas, exterior,
  appliances, safety devices) rather than a full property-type-aware
  template picker UI. Do not describe this module as having shipped
  "configurable per property type" templates — it hasn't.
- **Photo/video documentation** — an `InspectionMedia` model reusing the
  exact presigned-upload pattern already established for `Document`/
  `WorkOrder` photos (`storage.service.ts`): request an upload URL scoped to
  the inspection, upload directly to Supabase Storage, then record the
  resulting key. `capturedAt` is always populated (client timestamp or
  server `now()` fallback). **GPS metadata is best-effort and unverified**:
  captured via the browser Geolocation API only when the browser grants
  permission, and this was built and code-path-tested in a non-mobile web
  session — there was no real device to confirm GPS actually populates from
  a mobile browser. Treat it as "implemented, not verified" rather than
  "working."
- **Digital signature capture — typed name, not canvas-drawn.** Both tenant
  and manager signatures are captured as `{name, capturedAt, IP address}` on
  the same `POST .../inspections/:id/complete` request — the exact
  mechanism the lease e-signature flow already uses
  (`lease-esignature.service.ts`), not a hand-drawn canvas signature (no
  `signature_pad`-style dependency exists in the repo, and none was added).
  This means signing happens as a manager/inspector-device walkthrough
  capturing both parties in one session, **not** over a separate
  tenant-facing public signing link the way lease e-signing works. If a
  canvas-drawn signature or a public tenant-signing link is wanted later,
  that's a follow-up, not something silently included here.
- **Inspection report PDF** — client-side only
  (`apps/web/lib/exportInspectionPdf.ts`, `jspdf` — already a web
  dependency, mirroring `exportPdf.ts`'s pagination pattern). No new
  server-side PDF library was added to `apps/api`. Photos/videos are listed
  by storage key/timestamp/GPS rather than downloaded and embedded as
  images in the PDF.
- **Move-in vs. move-out comparison** — `GET
  .../leases/:leaseId/inspections/compare` (gated per-route in
  `leases.ts`) diffs the two inspections' `checklistResults` by
  section+item, flagging items whose recorded condition changed. Shown on
  the lease detail page next to `SecurityDepositDisposition`, which this
  module also wires up for real: `SecurityDepositDisposition` gained
  `moveInInspectionId`/`moveOutInspectionId` FKs, and
  `reconcileSecurityDeposit` now looks up and links the lease's completed
  move-in/move-out inspections when present (see Module 4's write-up
  above). The move-out workflow on the lease detail page links out to
  scheduling/viewing the move-out inspection.
- `Unit.lastInspectionAt` is no longer a dormant schema hook — completing
  any inspection advances it to that inspection's `completedAt`, but only
  forward (a single conditional `UPDATE ... WHERE last_inspection_at IS
  NULL OR last_inspection_at < :completedAt`, so an older inspection
  completing after a newer one never regresses it).
- **No standalone nav page** — the "Inspections" card lives on the unit
  detail page (mirrors Module 2's placement); the one new page,
  `/inspections/[id]` (checklist fill, photo/signature capture,
  completion, PDF download), is reached only by links from already-gated
  UI and isn't itself in the sidebar nav.

**Dependencies:** Unit management, S3 (Supabase Storage, in this codebase)

---

### Module 7 — Lease Renewal

**Target price:** $15–25/mo
**Priority:** Medium

**What it adds:**

- Renewal offer workflow: manager creates offer → tenant receives in app → accept/counter/decline
- Rent increase history and audit trail
- Market rate comparison (manual entry or third-party data feed)
- Countersignature workflow for finalized renewal terms

> **Note:** Basic lease renewal (one-click, no tenant-facing offer flow) is already in base product. This module adds the full negotiation and countersignature workflow.

**Dependencies:** Lease management, Messaging

---

### Module 8 — Eviction Management

**Target price:** $30–50/mo
**Priority:** Medium

**Status: gated + shipped (2026-09-18).** This is the first module in this
series flagged as legally sensitive — read the disclaimer bullet below
before assuming the jurisdiction data is anything more than a reference
starting point. What actually built, and exactly how it's simplified
relative to the original spec above:

- **Notice type tracking, delivery-method logging, deadline computation** —
  a net-new `Eviction` model (`leaseId` FK, `noticeType:
  pay_or_quit|cure_or_quit|unconditional_quit`, `noticeDate`,
  `noticePeriodDays`, `deadlineDate` computed as `noticeDate +
  noticePeriodDays` via simple calendar-day addition, `deliveryMethod:
  certified_mail|personal_service|posting` + `deliveryDate`, `servedByUserId`/
  `servedByName`) with CRUD at `.../organizations/:orgId/evictions[/:id]`,
  gated behind `requireModule('eviction_management')` at that router's
  mount — entirely net-new functionality, same gating pattern as Modules
  2/4/6.
- **Jurisdiction-specific notice-period lookup — real, but explicitly
  unverified reference data, not legal advice.** A `StateEvictionRule`
  model (`state`, `noticeType`, `noticePeriodDays`,
  `allowedDeliveryMethods`, `source`, `lastVerifiedAt`) is seeded with 51
  jurisdictions (50 states + DC) × 3 notice types = 153 rows, looked up
  automatically from the lease's property `state` when creating a notice.
  **This data was not independently verified against primary statute
  text** — this build's sandboxed environment returned a network-egress
  error on every legal-reference site it attempted to fetch (nolo.com,
  ipropertymanagement.com, law.cornell.edu, evictionrules.com), so the
  table was assembled from general trained knowledge of US landlord-tenant
  law, cross-checked only against reachable search-result snippets. Every
  row carries a `source` citation and a `notes` field flagging known
  low-confidence figures (states with no fixed statutory minimum for
  nonpayment notice, unusually complex structures like Virginia's 21/30
  cure window or Oregon's graduated nonpayment schedule, etc.).
  `lastVerifiedAt` records when the row was *compiled*, not when it was
  legally reviewed — do not describe this table as "verified" or
  "compliance-ready." A persistent "not legal advice" banner is shown on
  every eviction-facing screen in the web app (the creation form, the
  detail page, and the jurisdiction-lookup preview) precisely because of
  this. A manager can override the looked-up notice period or delivery
  method on an individual eviction with a required reason. **The reference
  table itself has no API write endpoint, by design** — `StateEvictionRule`
  has no `organizationId` (it's shared across every tenant), and this
  codebase's RBAC has no platform-admin concept, so an owner/manager route
  to edit it would let one customer overwrite the data every other
  customer's deadline computations depend on (a real finding from review on
  this module's first PR — fixed by removing the endpoint, not by bolting
  on auth this codebase doesn't have). Correcting a seeded row today
  requires direct database/ops access; `eviction.service.ts` has the
  functions to do it, just not wired to a route.
  **Delivery methods are not modeled per state** — every seeded row allows
  all three values rather than asserting a state disallows one, since
  per-state service requirements often hinge on nuances (e.g. "posting
  alone" vs. "posting plus mailing") a single enum value can't safely
  capture without real verification.
- **Delivery method logging, "who served it"** — `deliveryDate`,
  `servedByUserId` (FK to `User`, for staff-served notices), and
  `servedByName` (free text, for third-party service like a process
  server) are all captured on the notice record.
- **Notice generation workflow, full lifecycle tracking** — `status:
  notice_served → (cured|paid|expired) → filed → court_date_set →
  judgment → writ_issued → completed`, or `dismissed` at any point once
  filed. Each transition is its own endpoint
  (`.../evictions/:id/{resolve,file,court-date,judgment,writ,complete,dismiss}`),
  not a generic status field a manager can hand-edit — enforced in
  `eviction.service.ts`. `cured`/`paid` only apply to their matching notice
  type (`cure_or_quit`/`pay_or_quit` respectively); a writ of possession can
  only be issued after a judgment awarding possession to the landlord.
- **Court date and case number tracking through judgment** — once a notice
  expires uncured, filing captures a case number, optional court name, and
  filing date; a court date can then be set (and rescheduled); judgment
  captures an outcome (`possession_landlord|possession_tenant|dismissed|settled`)
  and timestamp; a writ of possession and final completion follow from
  there. A case can be dismissed at any point after filing, with a
  required reason.
- **Eviction timeline dashboard with deadline flags** — unlike most
  modules in this series (which fold their gated feature into an existing
  page), this one gets a real standalone nav page: `/evictions`, a
  portfolio-wide list with search/status filtering and color-coded
  deadline flags (red/yellow, `EVICTION_DEADLINE_WARNING_DAYS`), computed
  client-side from `deadlineDate`/`courtDate` the same way `/leases`
  already color-codes `endDate` — plus `/evictions/[id]` for full detail
  and every lifecycle action. A `<ModuleGate>`-wrapped card on the lease
  detail page (`/leases/[id]`) also lists any evictions on file for that
  lease and links to start a new one, so the feature is reachable from
  both places.
- **Notifications** — `runEvictionDeadlineJob` (`notification.service.ts`)
  reuses the existing notification system, mirroring `runLeaseExpiryJob`'s
  threshold-scan pattern (7/3/1 days out) for both the cure/pay deadline
  and the court date, triggered the same cron-endpoint way as
  `lease-expiry`/`rent-reminders`
  (`POST .../notifications/jobs/eviction-deadlines`). It reuses
  `User.notifLeaseExpiry` as the closest existing "date-driven manager
  alert" preference rather than adding a new `notifEviction` column — a
  manager who has muted lease-expiry alerts will also miss eviction
  deadline alerts, a real (if narrow) gap worth knowing about rather than
  silently accepted.

**Not built / explicitly simplified — do not describe as complete:**

- Jurisdiction data is not verified against primary statute text for any
  of the 51 seeded jurisdictions (see above) — it needs legal review
  before an org relies on it for a real eviction.
- Deadline computation is plain calendar-day addition, not adjusted for
  the weekend/court-holiday exclusion rules some states apply to some
  notice types (flagged per-state in the seed data's `notes` where known).
- Delivery-method eligibility is not modeled per state.
- No dedicated `notifEviction` preference — deadline reminders ride on
  `notifLeaseExpiry`.
- No self-service way to correct the jurisdiction reference table —
  `.../state-eviction-rules` is read-only; fixing a row requires direct
  database/ops access until a platform-admin auth layer exists.

**Dependencies:** Lease management, Property jurisdiction data (`state` field)

---

### Module 9 — Owner Portal

**Target price:** $25–40/mo
**Priority:** Low

**What it adds:**

- Owner entity above the property level (owner of record separate from manager)
- Ownership percentage tracking for co-owned properties
- Owner-facing read-only portal (separate login)
- Distribution and disbursement records with PDF statements
- Owner-level reporting: income, expenses, NOI by property

**Status (2026-09-17):** Fully built and now module-gated — see
`docs/reference/modules.md` and §12. `requireModule('owner_portal')` guards
both the manager-facing `/owners` route and the owner-facing `/owner-portal`
route; `<ModuleGate>` guards the web `/owners` page and nav entry. Not yet
behind Stripe billing — activation is a manual `activeModules` toggle.

**Dependencies:** Payments, Properties, Advanced Payments & Accounting module

---

### Module 10 — Communications & Resident Engagement

**Target price:** $20–30/mo
**Priority:** Low

**What it adds:**

- Bulk messaging to all tenants in a property or unit group
- Automated notice delivery (rent increase, policy change, community alert)
- SMS integration via Twilio (opt-in, per-tenant)
- Community bulletin board visible in tenant mobile app
- Resident satisfaction surveys (move-in, maintenance completion, annual)

> **Note:** Base messaging (one-to-one manager ↔ tenant thread) is already in base product. This module adds broadcast, automation, SMS, and community features.

**Dependencies:** Messaging, Notifications, Twilio

---

### Module 11 — Reporting & Analytics

**Target price:** $25–40/mo
**Priority:** Low

**What it adds:**

- Custom report builder (drag-and-drop column selection)
- Portfolio performance trends (occupancy rate, rent collected, vacancy days)
- Maintenance spend breakdown by unit, property, category
- Rent roll report (standard format for lenders and accountants)
- Vacancy rate history and market comparison
- Export to CSV and PDF

**Status (2026-09-17):** Fully built and now module-gated — see
`docs/reference/modules.md` and §12. `requireModule('reporting_analytics')`
guards `/reports`; `<ModuleGate>` guards the web `/reports` page and nav
entry. Not yet behind Stripe billing — activation is a manual
`activeModules` toggle.

**Dependencies:** All base modules; enhanced by all add-on modules

---

### Open API / Developer Platform

**Target availability:** Premium plan or enterprise tier (Phase 5+)

**What it adds:**

- REST API with per-organization API keys
- Webhook subscriptions (push events to external systems)
- Official API documentation (OpenAPI spec)
- Rate limiting and usage dashboard
- Integration library: QuickBooks, Yardi, property listing feeds

**Competitive context:** Buildium exposes an Open API on their Premium plan. AppFolio exposes API access by plan tier. PropFlow's open API is a long-term platform play that enables integrations with accounting software, listing platforms, and custom tooling that larger customers need.
