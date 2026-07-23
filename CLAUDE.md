# PropFlow

Multi-tenant property management platform (Turborepo monorepo). Manager web
app, tenant mobile app, and a shared API/DB layer.

## Layout

- `apps/web` — manager-facing web app (Next.js App Router)
- `apps/api` — Express API, mounted under `/api/v1` (`apps/api/src/index.ts`)
- `apps/mobile` — tenant portal app (Expo / React Native)
- `packages/db` — Prisma schema, migrations, generated client (`@propflow/db`)
- `packages/shared` — code shared across apps

## Read these first

Before exploring the codebase for schema, auth/roles, or API-route
questions, read the reference docs below — they're hand-maintained compact
summaries meant to save a re-discovery pass through the source:

- `docs/reference/schema.md` — every Prisma model, key fields, FKs, and which
  fields are module-deferred (nullable now, populated once an add-on module ships)
- `docs/reference/rbac.md` — roles, auth middleware, and where role-gating is
  actually applied
- `docs/reference/routes.md` — API route mount points and their auth chains
- `docs/reference/modules.md` — the add-on module roadmap and which schema/routes
  already exist ahead of a module shipping

For narrative design/architecture context (data model rationale, phased
build plan, screen-by-screen feature list, API conventions), see
`BUILD_OUTLINE.md` at the repo root — the reference docs above summarize it,
they don't replace it. `docs/SETUP.md` covers local dev environment setup.

These reference docs are hand-maintained, not auto-generated — if a change
touches the Prisma schema, auth middleware, or route mounting, update the
corresponding doc in the same change.
