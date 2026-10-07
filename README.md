# Kampus

CRM for learning centers: leads, teachers, groups, students, attendance, payments, exams, tests and
coins, finance and payroll, reports, integrations and a dashboard. Functionally modelled on the
reference system documented in [docs/EXPLORATION.md](docs/EXPLORATION.md); the design, name and code
are original.

## Status

All thirteen build phases of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) are merged (PRs #1 to #12).
[docs/TRACEABILITY.md](docs/TRACEABILITY.md) maps every page of the reference to its code, tests and
assumptions, and lists the few items left out on purpose. Decisions that go beyond what was observed
are numbered in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md); the ones still marked **OPEN** need an
answer from the product owner before the behaviour is treated as final.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui-style components ·
PostgreSQL 16 · Prisma 7 · Zod 4 · next-intl (uz / ru / en) · exceljs · Vitest · Playwright · Docker ·
GitHub Actions

## Modules

| Module             | What it covers                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard          | Twelve KPI cards (masked until "show numbers"), room schedule grid, finance summary, utilisation badge                                                                 |
| Leads              | Boards and columns (Kanban), lead form, move / archive / restore, SMS to a column, add leads to a group, return a student to leads, sources report, public lead forms  |
| Teachers and staff | Staff with roles, branches, salary methods and photos; teacher profile; roles with a permission matrix and custom roles                                                |
| Groups             | Schedule patterns and rooms, up to three teachers with pay shares, members with statuses, attendance, grades, notes, exams, tests, discounts, coins, comments, history |
| Students           | Profile with groups, progress, test results, comments, SMS, history, parents, calls; payments, refunds, printable receipts and badges; Excel import and export         |
| Exams              | Group and mock exams, registrations, grading sheet with levels, finish and reopen                                                                                      |
| Tests and coins    | Question bank, tests, staff-entered attempts, knowledge analysis; coin rules and manual reasons, group ranking, marketplace with purchase requests                     |
| Finance            | Overview figures and charts, monthly plan, categories and ledger (expenses, incomes, advances, marketing, bonuses, fines, investments), payroll with approvals         |
| Reports            | Payments, student payments, left students, graduates, staff attendance, coins, leads, students, center statistics; Excel on every report                               |
| Settings           | General switches, payment methods, courses, rooms, days off, schools, grading systems, receipt layout, SMS templates and auto-SMS, logs                                |
| Integrations       | Eskiz SMS, Telegram bot notifications, AmoCRM lead push, telephony webhook with click-to-call, FaceID webhook with staff attendance                                    |
| Header             | Global search over students, leads and groups; payment button; notifications bell and page; branch and language switch                                                 |
| Help               | In-app manuals in uz / ru / en for every role (CEO, branch manager, admin, cashier, teacher, student) with screenshots and a search that leads to the section          |

## Quick start (local)

```bash
cp .env.example .env            # adjust DATABASE_URL if needed
npm ci
npx prisma generate
npx prisma migrate deploy       # or: npm run db:migrate (creates migrations in dev)
npm run db:seed                 # fake demo data
npm run dev                     # http://localhost:3000
```

Sign in with the demo CEO: `+998 90 000 00 01` and the `SEED_ADMIN_PASSWORD` from `.env`
(default `Kampus!2026`). Other demo users (`…0002` admin, `…0003` cashier, `…0004` teacher,
`…0005` branch manager) share the same password. The seed is fake data only.

Background jobs (SMS sending, AmoCRM pushes, the daily scan for auto-SMS, birthdays and debtors)
run from a Postgres-backed queue. Start the worker next to the app with `npm run worker`
(`WORKER_INTERVAL_MS` sets the polling interval), or have a cron call `POST /api/v1/jobs/run`.

## Quick start (Docker)

```bash
SEED=true docker compose up --build
```

Starts PostgreSQL, runs migrations (and the demo seed when `SEED=true`), then the app and the worker
on `http://localhost:3000`.

## Deploying

[docs/DEPLOY.md](docs/DEPLOY.md) walks through a single-server deployment (Hetzner CX23 or any Ubuntu
VPS) with `docker-compose.prod.yml`: Caddy for HTTPS, the worker, nightly database dumps and a
first-start bootstrap (`npm run db:bootstrap`) that creates the organisation and the CEO login from
environment variables instead of demo data.

## Integrations

Provider credentials are entered in the app under Settings → Integrations (and Settings → Bot,
Calls, FaceID), never in `.env`. Each integration sits behind an interface with a fake adapter, so the
app and its tests run without any external account. Webhooks: `POST /api/v1/webhooks/telegram`,
`/webhooks/telephony` and `/webhooks/face-id`, each authorised by the secret stored in its settings.

## Scripts

| Script                     | What it does                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`              | Dev server                                                                          |
| `npm run build`            | Production build (standalone output)                                                |
| `npm run lint`             | ESLint                                                                              |
| `npm run format:check`     | Prettier check (`npm run format` to fix)                                            |
| `npm run typecheck`        | `tsc --noEmit`                                                                      |
| `npm test`                 | Vitest unit + DB integration tests                                                  |
| `npm run test:e2e`         | Playwright end-to-end tests (needs a database)                                      |
| `npm run db:migrate`       | Create/apply a migration in development                                             |
| `npm run db:deploy`        | Apply committed migrations                                                          |
| `npm run db:seed`          | Load fake demo data                                                                 |
| `npm run db:bootstrap`     | First-start setup from `BOOTSTRAP_*` variables                                      |
| `npm run worker`           | Background job worker                                                               |
| `npm run help:screenshots` | Re-takes the manual's screenshots from a seeded local run (`public/help/<locale>/`) |

## Testing and CI

- Unit and service tests (`tests/unit`) run against a real PostgreSQL database; a global setup applies
  migrations and the seed, and each file tags and removes its own rows.
- End-to-end tests (`tests/e2e`) sign in as the seeded users and drive the real UI in Chromium. Set
  `PLAYWRIGHT_CHROMIUM_PATH` to reuse an installed browser.
- `.github/workflows/ci.yml` runs lint, format check, typecheck, unit tests, the production build
  and the Playwright suite against a PostgreSQL service on every pull request and push to `main`.

## Project layout

```
prisma/                 schema, versioned migrations, seed
messages/               uz.json, ru.json, en.json (identical key sets)
src/app/[locale]/       pages: (auth)/login, (app)/<module>, (print)/receipts and badges, (public)/forms
src/app/api/v1/         thin HTTP handlers
src/components/         ui/ (shadcn-style primitives), data/ (search, sort, paging, dialogs), layout/
src/features/<module>/  client UI per module: tables, dialogs, forms, charts
src/lib/                shared by client and server: zod schemas, rbac catalogue, api client, dates
src/server/             auth, rbac, audit, errors, http helpers, services, jobs, excel, storage, db
scripts/worker.ts       background job worker
tests/unit, tests/e2e   Vitest and Playwright suites
docs/                   ARCHITECTURE.md, ASSUMPTIONS.md, EXPLORATION.md, TRACEABILITY.md
```

Layering rule: UI → `/api/v1` route → `server/services` → Prisma. Components never import from
`src/server` (types excepted). Every service call is authorized with `authorize(actor, permission)`
and every create/update/delete writes an `AuditLog` row inside the same transaction.

## Security notes

- Passwords: Argon2id (`@node-rs/argon2`).
- Sessions: opaque 256-bit token in an `httpOnly` `SameSite=Lax` cookie; only its SHA-256 is stored;
  12 h sliding expiry.
- CSRF: Origin check + double-submit token (`kampus_csrf` cookie ↔ `x-csrf-token` header) on every
  mutating request; public lead forms rely on the Origin check and a per-IP limit.
- Login lockout: 5 failures per phone or IP in 15 minutes.
- Branch scope and "own groups only" for teachers are enforced in the services, not only in the UI.
- Secrets only via environment variables (`.env.example` lists them) or the integration settings
  stored in the database; nothing is committed to the repository.
