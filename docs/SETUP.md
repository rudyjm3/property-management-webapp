# Local Development Setup

This guide walks through setting up PropFlow for local development on Windows. Follow each step in order.

---

## Prerequisites

Install the following before proceeding:

### 1. Docker Desktop for Windows
Docker runs PostgreSQL and Redis locally so you don't need to install them directly on your machine.

- Download: [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
- Requires Windows 11 (WSL2 backend — already supported on your machine)
- After installing, start Docker Desktop and verify it's running (whale icon in system tray)

**Verify installation:**
```bash
docker --version
docker compose version
```

> **Note on XAMPP:** XAMPP can remain installed. There are no port conflicts — PostgreSQL uses port 5432, Redis uses 6379, and neither conflicts with XAMPP's Apache (80/443) or MySQL (3306).

### 2. Node.js 20+
Recommend installing via [nvm-windows](https://github.com/coreybutler/nvm-windows) so you can switch Node versions if needed.

```bash
# After installing nvm-windows:
nvm install 20
nvm use 20
node --version  # Should show v20.x.x
```

Alternatively, download the LTS installer directly from [nodejs.org](https://nodejs.org/).

### 3. Git
Already installed. Verify with `git --version`.

---

## First-Time Setup

### Step 1: Clone the repository
```bash
git clone <repo-url>
cd property-management-webapp
```

### Step 2: Copy environment variables
```bash
cp .env.example .env
```

Open `.env` and fill in the values. For initial local development, only the database and Redis values are required — the Docker Compose defaults are pre-filled in `.env.example` and will work without changes.

Services you'll need to set up for full functionality:
- **Supabase Auth** — Create a free project at [supabase.com](https://supabase.com)
- **Stripe** — Create a free account at [stripe.com](https://stripe.com), use test keys
- **AWS S3** — Create a free-tier bucket (or skip for Phase 1 — file upload is Phase 1 week 9–10)
- **Resend** — Create a free account at [resend.com](https://resend.com)
- **Twilio** — Create a free trial account at [twilio.com](https://twilio.com) (optional for Phase 1)

### Step 3: Start local database services
```bash
docker compose up -d
```

This starts:
- PostgreSQL 15 on `localhost:5432`
- Redis 7 on `localhost:6379`

Verify both are running:
```bash
docker compose ps
```

Both services should show status `running`.

### Step 4: Install dependencies
```bash
npm install
```

This installs all workspace dependencies across `apps/` and `packages/`.

### Step 5: Run database migrations
```bash
npm run db:migrate
```

This applies all Prisma migrations to your local PostgreSQL database and generates the Prisma client.

### Step 6: Seed the database (optional)
```bash
npm run db:seed
```

This creates sample data: one organization, one property with 10 units, and two test tenants. Useful for development and testing.

### Step 7: Start development servers
```bash
npm run dev
```

Turborepo will start all apps in parallel:
- Web app: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001](http://localhost:3001)
- Mobile (Metro bundler): [http://localhost:8081](http://localhost:8081)

To run only the web app and API (without mobile):
```bash
npm run dev --filter=web --filter=api
```

---

## Stripe Webhook Local Testing

For local testing of Stripe payment webhooks, install the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
# Download Stripe CLI for Windows from:
# https://github.com/stripe/stripe-cli/releases
# Then run:
stripe login
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

The CLI will output a webhook signing secret — add it to your `.env` as `STRIPE_WEBHOOK_SECRET`.

---

## Common Errors & Fixes

### "Cannot connect to PostgreSQL"
- Make sure Docker Desktop is running (check system tray)
- Run `docker compose up -d` to start the containers
- Check port 5432 is not in use: `netstat -an | findstr 5432`

### "docker compose command not found"
- Update Docker Desktop to a recent version (Docker Compose v2 is bundled)
- Or install Docker Compose separately

### "Port 5432 already in use"
- Another PostgreSQL instance (from a previous install) may be running
- Stop it via Windows Services, or change the port in `docker-compose.yml` and `DATABASE_URL` in `.env`

### "Prisma Client not generated"
```bash
cd packages/db
npx prisma generate
```

### "XAMPP MySQL conflicts"
- No conflict — PostgreSQL uses 5432, XAMPP MySQL uses 3306
- If XAMPP Apache is on port 80, Next.js on 3000 and the API on 3001 won't conflict

### "Module not found" errors after `npm install`
```bash
# Clear all node_modules and reinstall
npm run clean
npm install
```

---

## Database Management

### View database in a GUI
Connect with [TablePlus](https://tableplus.com/) (free tier is sufficient) or [DBeaver](https://dbeaver.io/) (free):
- Host: `localhost`
- Port: `5432`
- Database: `propflow_dev`
- User: `propflow`
- Password: `propflow_dev`

### Reset the database
```bash
# Drop all data and re-run migrations from scratch
npm run db:reset
```

### Create a new migration
```bash
# After editing packages/db/prisma/schema.prisma:
npm run db:migrate:dev -- --name describe_your_change
```

---

## Stopping Local Services

```bash
# Stop Docker containers (keeps data)
docker compose stop

# Stop and remove containers + data volumes (full reset)
docker compose down -v
```
