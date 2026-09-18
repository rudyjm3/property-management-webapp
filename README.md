# PropFlow - Property Management Platform

A modular SaaS property management platform built for small-to-mid apartment managers (20-300 units). Built collaboratively by the owner and Claude Code.

---

## The Problem

Property managers juggle rent collection in one tool, maintenance in another, and tenant records in a spreadsheet. PropFlow replaces all of it with a single platform -- a web dashboard for managers and a mobile app for tenants -- designed around the real daily workflows of apartment management.

**Target market:** Apartment managers and small-to-mid property management companies overseeing 20-300 units who find enterprise tools like AppFolio too expensive and generic tools like Buildium too complex.

---

## Architecture

```
+------------------+     +------------------+
|  Manager Web     |     |  Tenant Mobile   |
|  (Next.js)       |     |  (Expo/RN)       |
+--------+---------+     +--------+---------+
         |                        |
         +----------+-------------+
                    |
         +----------v-----------+
         |   Node.js REST API   |
         +----------+-----------+
                    |
      +-------------+---------------+
      |             |               |
 +----v----+  +-----v---+   +------v---------+
 |Postgres |  | Redis   |   |Supabase Storage|
 |  (DB)   |  |(planned)|   |   (Files)      |
 +---------+  +---------+   +----------------+
                    |
      +-------------+---------------+
      |             |               |
 +----v-----+  +----v-----+   +----v------+
 | Stripe   |  | Resend   |   | Twilio    |
 |(Payments)|  | (Email)  |   | (SMS)     |
 +----------+  +----------+   +-----------+
```

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Manager Web App | Next.js 15 (App Router) | SSR for dashboard performance, file-based routing |
| Tenant Mobile App | React Native (Expo SDK 54) | Single codebase for iOS + Android |
| Backend API | Node.js + Express | JS across full stack; in-app messaging currently uses REST polling, not WebSocket |
| Primary Database | PostgreSQL 15 | Relational integrity for lease and financial data |
| Cache / Sessions | Redis 7 | Provisioned via Docker Compose for future session/cache use; not yet wired into the app — rate limiting today runs in-memory via `express-rate-limit` |
| Auth | Supabase Auth | Managed auth with row-level security |
| Payments | Stripe (ACH + Card) | Verified ACH, recurring billing |
| File Storage | Supabase Storage | Lease PDFs, inspection photos, document vault (migrated off AWS S3) |
| Email | Resend | Transactional email |
| SMS | Twilio | Rent reminders, work order notifications |
| Hosting | Vercel (web) + Railway (API) | Zero-config deploys |
| Monorepo | Turborepo | Parallel builds, shared packages |
| ORM | Prisma | Type-safe DB queries, migration management |

---

## Features

### Base App (all plans)

- **Auth & Account Setup** -- Manager and tenant portals, role-based access (Owner, Manager, Maintenance Staff)
- **Manager Dashboard** -- Occupancy, rent collection status, open work orders, expiring leases at a glance
- **Property & Unit Management** -- Multi-property support, unit grid view, per-unit detail with full history
- **Tenant Management** -- Profiles, contact info, lease history, payment history
- **Lease Management** -- Terms, renewal tracking, document attachments, expiration alerts
- **Rent Collection** -- Online ACH payments via Stripe, autopay, late fee automation, payment history
- **Work Orders** -- Tenant-submitted requests with photos, priority triage, status tracking
- **In-App Messaging** -- Manager to tenant threads, broadcast announcements
- **Document Storage** -- Per-property, per-unit, per-tenant document vault
- **Notifications & Alerts** -- Automated alerts for late rent, expiring leases, new work orders
- **Settings & Admin** -- Org profile, team members, roles, billing

### Add-on Modules (upsell)

| Module | Target Price |
|---|---|
| Advanced Tenant Onboarding (application, screening, e-lease) | $25-40/mo |
| Unit Intelligence & Appliance Registry | $20-35/mo |
| Grounds & Property Maintenance | $25-40/mo |
| Advanced Payments & Accounting | $30-50/mo |
| Vendor & Contractor Management | $20-30/mo |
| Inspections & Compliance | $25-40/mo |
| Lease Renewal (negotiation & countersignature) | $15-25/mo |
| Eviction Management | $30-50/mo |
| Owner Portal | $25-40/mo |
| Communications & Resident Engagement | $20-30/mo |
| Reporting & Analytics | $25-40/mo |

Nine of the eleven modules above now have a functional implementation
behind module-based feature gating (`Organization.activeModules` +
`requireModule()`/`<ModuleGate>` — see `docs/reference/modules.md`);
**Lease Renewal's negotiation/countersignature workflow and Communications
& Resident Engagement's broadcast/SMS features are not yet built** (each
module's base-product overlap — one-click renewal, one-to-one messaging —
already ships). Full Stripe Subscription Item billing per module isn't
wired yet either, so activation today is manual rather than self-service.
For exactly what's built vs. still partial in each module, see
`docs/reference/modules.md` and `BUILD_OUTLINE.md` §12/§14 — those are kept
current as modules ship and are the source of truth over this table, which
is pricing/roadmap-oriented.

---

## Pricing

| Plan | Price | Includes |
|---|---|---|
| Base | $49-79/mo (up to 20 units) | Base app only |
| Starter Bundle | $99/mo | Base + Tenant Onboarding + Payments |
| Professional Bundle | $149-179/mo | Starter + Unit Intelligence + Vendor + Inspections |
| Enterprise Bundle | $249-349/mo | Everything + white-label + priority support |

Per-unit fee applies above 20 units on Base plan.

---

## Repository Structure

```
property-management-webapp/
├── apps/
│   ├── web/                  # Next.js manager dashboard
│   ├── api/                  # Node.js REST + WebSocket API
│   └── mobile/               # Expo React Native tenant app
├── packages/
│   ├── db/                   # Prisma schema, migrations, seed
│   ├── shared/               # Shared types, validators, constants
│   └── ui/                   # Shared component library (future)
├── docs/
│   ├── SETUP.md              # Local development setup guide
│   └── reference/            # Hand-maintained, kept current as code changes
│       ├── schema.md         # Every Prisma model, key fields, FKs
│       ├── rbac.md           # Roles, auth middleware, role-gating
│       ├── routes.md         # API route mount points and auth chains
│       └── modules.md        # Add-on module roadmap + build status
├── .env.example              # Environment variable template
├── .gitignore
├── BUILD_OUTLINE.md          # Full technical build blueprint
├── CONTRIBUTING.md           # Development workflow and standards
├── docker-compose.yml        # Local PostgreSQL + Redis
├── turbo.json                # Turborepo pipeline config
└── package.json              # Root workspace
```

---

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/) (recommend installing via [nvm-windows](https://github.com/coreybutler/nvm-windows))
- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) -- runs PostgreSQL and Redis locally
- Git (already installed)

> **Note:** XAMPP is not used for the database layer. PostgreSQL runs in Docker. XAMPP can remain installed but is not required for this project.

### Local Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd property-management-webapp

# 2. Copy environment variables
cp .env.example .env
# Fill in your values -- see docs/SETUP.md for guidance

# 3. Start local database services
docker compose up -d

# 4. Install dependencies
npm install

# 5. Run database migrations
npm run db:migrate

# 6. Start development servers
npm run dev
```

See [docs/SETUP.md](docs/SETUP.md) for the full detailed setup guide including Windows-specific notes.

---

## Development Workflow

- **Branches:** `feature/short-description`, `fix/short-description`, `chore/short-description`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) -- `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
- **PRs:** See [CONTRIBUTING.md](CONTRIBUTING.md) for the full PR checklist

---

## Build Roadmap & Current Status

See [BUILD_OUTLINE.md](BUILD_OUTLINE.md) for the complete phased build plan, data model, screen-by-screen feature list, and module roadmap — §12 tracks phase-by-phase implementation status and §14 the add-on module build status, both kept current as work ships. For a compressed, code-linked view of exactly what each add-on module does and doesn't do today, see [docs/reference/modules.md](docs/reference/modules.md).

---

## License

Proprietary -- All rights reserved.
