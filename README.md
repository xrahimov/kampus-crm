# Kampus

CRM for learning centers: leads, teachers, groups, students, attendance, payments, finance and reports.
Functionally modelled on the reference system documented in `docs/EXPLORATION.md`; the design,
name and code are original.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui-style components ·
PostgreSQL 16 · Prisma 7 · Zod 4 · next-intl (uz / ru / en) · Vitest · Playwright · Docker · GitHub Actions

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
`…0005` branch manager) share the same password.

## Quick start (Docker)

```bash
SEED=true docker compose up --build
```

Starts PostgreSQL, runs migrations (and the demo seed when `SEED=true`), then the app on
`http://localhost:3000`.

## Scripts

| Script                 | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Dev server                                     |
| `npm run build`        | Production build (standalone output)           |
| `npm run lint`         | ESLint                                         |
| `npm run format:check` | Prettier check (`npm run format` to fix)       |
| `npm run typecheck`    | `tsc --noEmit`                                 |
| `npm test`             | Vitest unit + DB integration tests             |
| `npm run test:e2e`     | Playwright end-to-end tests (needs a database) |
| `npm run db:migrate`   | Create/apply a migration in development        |
| `npm run db:deploy`    | Apply committed migrations                     |
| `npm run db:seed`      | Load fake demo data                            |

## Project layout

```
prisma/                 schema, versioned migrations, seed
messages/               uz.json, ru.json, en.json
src/app/[locale]/       pages: (auth)/login, (app)/<module>
src/app/api/v1/         thin HTTP handlers
src/components/         ui/ (shadcn-style primitives), layout/
src/lib/                shared by client and server: zod schemas, rbac catalogue, api client
src/server/             auth, rbac, audit, errors, http helpers, services, db
tests/unit, tests/e2e   Vitest and Playwright suites
docs/                   ARCHITECTURE.md, ASSUMPTIONS.md, EXPLORATION.md, TRACEABILITY.md
```

Layering rule: UI → `/api/v1` route → `server/services` → Prisma. Components never import from
`src/server`. Every service call is authorized with `authorize(actor, permission)` and every
create/update/delete writes an `AuditLog` row inside the same transaction.

## Security notes

- Passwords: Argon2id (`@node-rs/argon2`).
- Sessions: opaque 256-bit token in an `httpOnly` `SameSite=Lax` cookie; only its SHA-256 is stored;
  12 h sliding expiry.
- CSRF: Origin check + double-submit token (`kampus_csrf` cookie ↔ `x-csrf-token` header) on every
  mutating request.
- Login lockout: 5 failures per phone or IP in 15 minutes.
- Secrets only via environment variables (`.env.example` lists them).
