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
  ├── Properties (physical addresses)
  │   └── Units (individual rentable apartments)
  │       ├── Leases (time-bounded rental contracts)
  │       │   └── LeaseParticipants (tenants on a lease)
  │       ├── WorkOrders (maintenance requests)
  │       └── UnitDocuments (photos, inspection reports)
  ├── Tenants (user accounts, linked to units via leases)
  ├── Payments (financial ledger entries)
  ├── Messages (manager ↔ tenant threads)
  ├── Documents (polymorphic — attached to any entity)
  └── Notifications (user-targeted system alerts)
```

### Multi-Tenancy Pattern
Every manager-facing query must filter by `organization_id`. This is enforced at the API middleware layer (not just ORM) — every protected route validates that the requesting user belongs to the organization being queried.

### Key Entities

**Organization**
`id, name, slug, logo_url, stripe_customer_id, stripe_subscription_id, plan, created_at`

**User**
`id, organization_id, email, name, role (enum: owner|manager|maintenance), avatar_url, last_login_at`

**Property**
`id, organization_id, name, address, city, state, zip, type (enum: apartment|condo|house), year_built, unit_count, photo_url, notes, created_at`
Index: `organization_id`

**Unit**
`id, property_id, unit_number, floor, bedrooms, bathrooms, sq_ft, rent_amount, deposit_amount, status (enum: vacant|occupied|notice|maintenance), notes, created_at`
Index: `property_id, status`

**Tenant**
`id, organization_id, email, name, phone, emergency_contact_name, emergency_contact_phone, avatar_url, created_at`
Index: `organization_id, email`

**Lease**
`id, unit_id, rent_amount, deposit_amount, start_date, end_date, status (enum: active|month_to_month|notice_given|expired), late_fee_amount, late_fee_grace_days, document_url, notes, created_at`
Index: `unit_id, status, end_date`

**LeaseParticipant**
`id, lease_id, tenant_id, is_primary`

**Payment**
`id, lease_id, tenant_id, amount, type (enum: rent|deposit|late_fee|credit), status (enum: pending|completed|failed|waived), stripe_payment_intent_id, paid_at, due_date, notes, created_at`
Index: `lease_id, status, due_date`

**WorkOrder**
`id, unit_id, tenant_id, assigned_to_user_id, category (enum: plumbing|electrical|appliance|hvac|general|other), priority (enum: low|normal|urgent|emergency), status (enum: new|assigned|in_progress|pending_parts|completed|cancelled), description, resolution_notes, cost, completed_at, created_at`
Index: `unit_id, status, priority, created_at`

**Message**
`id, organization_id, sender_user_id, recipient_tenant_id, body, attachment_url, read_at, created_at`
Index: `organization_id, recipient_tenant_id`

**Document**
`id, organization_id, entity_type (enum: property|unit|lease|tenant|work_order), entity_id, name, s3_key, mime_type, size_bytes, uploaded_by_user_id, visible_to_tenant, created_at`
Index: `organization_id, entity_type, entity_id`

**Notification**
`id, user_id, type, title, body, read_at, action_url, created_at`
Index: `user_id, read_at`

### Soft Deletes
Tenants, Leases, and Payments use soft deletes (`deleted_at` nullable timestamp) rather than hard deletes. This preserves financial history and prevents referential integrity issues.

---

## 5. Phased Build Plan

### Phase 1 — Foundation (Months 1–3)
**Goal:** A manager can log in, add properties and units, add tenants with leases, and manually record a rent payment. The app becomes the system of record.

| Week | Milestone |
|---|---|
| 1–2 | Monorepo scaffold, Prisma schema v1, Supabase Auth working, CI pipeline (GitHub Actions) |
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
| 19–20 | Work order assignment, status updates, notifications |
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

## 6. Module Roadmap

| Module | Target Price | Key Features | Priority | Dependencies |
|---|---|---|---|---|
| Advanced Tenant Onboarding | $25–40/mo | Digital application, background/credit check (TransUnion), e-lease signing, move-in inspection with photos | High | Lease Mgmt, Stripe, Resend |
| Unit Intelligence & Appliance Registry | $20–35/mo | Per-unit appliance records (make/model/serial/warranty), maintenance cost tracking, age-based replacement alerts, QR code labels | High | Unit Mgmt, S3 |
| Grounds & Property Maintenance | $25–40/mo | Recurring task scheduling for common areas, vendor assignment, inspection logs, completion photo | Medium | Work Orders |
| Advanced Payments & Accounting | $30–50/mo | Card payments, partial payments, security deposit reconciliation, owner disbursements, P&L by property, Schedule E export | Medium | Stripe, Payment Ledger |
| Vendor & Contractor Management | $20–30/mo | Vendor database, license/insurance expiry alerts, work history, ratings, preferred vendor by property | Low | Work Orders |
| Inspections & Compliance | $25–40/mo | Move-in/out templates, scheduled inspections, photo/video docs, digital signature, automated reports | Low | Unit Mgmt, S3 |
| Communications & Resident Engagement | $20–30/mo | Bulk messaging, automated notices, SMS integration, community bulletin board, resident satisfaction surveys | Low | Messaging, Notifications |
| Reporting & Analytics | $25–40/mo | Custom reports, portfolio performance trends, maintenance spend by unit, rent roll, vacancy rate history | Low | All modules |

---

## 7. Screen-by-Screen Feature List

### Manager Web App (Next.js)

**Auth**
- `/login` — Email/password + Google SSO via Supabase
- `/signup` — Create org account, choose plan
- `/forgot-password` — Password reset email
- `/onboarding` — Multi-step wizard: org name, logo, billing, first property

**Dashboard**
- `/dashboard` — KPI widgets: total units, occupancy %, rent collected this month vs expected, open work orders count, leases expiring in 30/60 days, recent messages. All widgets are clickable.

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
- `/work-orders` — Table view with status filters (New, Assigned, In Progress, Completed). Oldest/urgent surfaced first.
- `/work-orders/[id]` — Description, photos, category, priority, assigned to, status timeline with timestamps, manager notes, resolution notes, cost.

**Messages**
- `/messages` — Conversation list, unread badges
- `/messages/[threadId]` — Full thread with tenant, file attachment support

**Documents**
- `/documents` — Browse by property/unit/tenant/type. Upload button.

**Notifications**
- `/notifications` — Full history. Grouped by date. Mark all read.

**Settings**
- `/settings/organization` — Name, logo, contact info, timezone
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
- Submit New Request: category select, description, up to 5 photos, availability note
- Request detail: status timeline, manager notes

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

## 8. API Design Conventions

### URL Structure
```
/api/v1/organizations/:orgId/properties
/api/v1/organizations/:orgId/properties/:propertyId/units
/api/v1/organizations/:orgId/tenants
/api/v1/organizations/:orgId/work-orders
/api/v1/organizations/:orgId/payments
/api/v1/organizations/:orgId/messages
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

## 9. Environment & Infrastructure

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
