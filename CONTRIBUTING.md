# Contributing to PropFlow

This project is built collaboratively. This guide defines how we work so the codebase stays clean and consistent from the first commit.

---

## Branch Strategy

All work happens in feature branches off `main`. `main` is always in a deployable state.

| Prefix | Use for |
|---|---|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `chore/` | Tooling, deps, config |
| `refactor/` | Code changes with no behavior change |
| `docs/` | Documentation only |

**Examples:**
```
feature/tenant-invite-flow
fix/stripe-webhook-signature
chore/upgrade-prisma-v5
docs/update-setup-guide
```

Never commit directly to `main`.

---

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This keeps the git history readable and enables automated changelog generation later.

**Format:**
```
<type>: <short description>

[optional body]

[optional footer]
```

**Types:**

| Type | Use for |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `chore` | Tooling, dependencies, build config |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `style` | Formatting only (no logic change) |

**Examples:**
```
feat: add ACH payment initiation via Stripe

fix: correct late fee calculation on grace period boundary

docs: add Docker setup instructions for Windows

chore: upgrade Next.js to 14.2
```

---

## Pull Request Process

1. Create a branch from `main` using the naming convention above
2. Make your changes with clear, atomic commits
3. Open a PR against `main` with the following in the description:
   - **What:** What does this PR do?
   - **Why:** Why is this change needed?
   - **How to test:** Steps to verify it works
   - **Screenshots:** If any UI changes are included
4. Request a review before merging
5. Squash and merge — keep `main`'s history clean

---

## Code Style

Code style is enforced automatically via ESLint and Prettier. A pre-commit hook (Husky + lint-staged) runs these checks before every commit.

Key conventions:
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Trailing commas (ES5 style)
- TypeScript strict mode — no `any` without justification

Run manually at any time:
```bash
npm run lint        # Check for lint errors
npm run lint:fix    # Auto-fix lint errors
npm run format      # Format with Prettier
```

---

## Environment

Never commit `.env`. Always keep `.env.example` up to date if you add a new environment variable. Include a comment explaining what the variable is and where to get the value.

---

## Database Changes

All schema changes go through Prisma migrations:
```bash
# After editing packages/db/prisma/schema.prisma
npm run db:migrate:dev -- --name describe_your_change
```

Never edit migration files manually after they have been committed. Create a new migration instead.

---

## Testing

(Test setup will be added in Phase 1. This section will be updated with test conventions once the framework is chosen.)

As a general principle:
- Unit tests for business logic in `packages/shared` and `apps/api/src/services`
- Integration tests for API routes that hit the real database
- No mocking the database in integration tests — use a dedicated test database

---

## Questions

If you're unsure about an approach, open a discussion in the PR or ask before building. It's cheaper to align early than to refactor late.
