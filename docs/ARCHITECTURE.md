# Phase 1 — Architecture

> App name: **Kampus** (repo `kampus-crm`).
> Source of truth: `/mnt/project-files/exploration/EXPLORATION.md` (EXP). Section references like "EXP §5" point there.
> Everything that EXP marks [INFERRED] / [NOT VERIFIED], and every decision of mine, is listed in `ASSUMPTIONS.md` (A-numbers below).
> Status: **draft for review**. No code has been written yet.

---

## 1. Tech stack and pinned versions

These are the versions published on npm on 2026-10-03, checked with `npm view`. The exact pins go into the lockfile in Phase 2.

| Concern          | Choice                                                                        | Version                                     | Note                                                                            |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Runtime          | Node.js                                                                       | 22 LTS                                      |                                                                                 |
| Web framework    | Next.js (App Router)                                                          | 16.3.x                                      |                                                                                 |
| UI               | React                                                                         | 19.x (as required by Next 16)               |                                                                                 |
| Language         | TypeScript, `strict: true`                                                    | 5.x/6.x line supported by typescript-eslint | TypeScript 7.0 is out, but lint tooling support has to be verified first (A-30) |
| Styling          | Tailwind CSS 4.x + shadcn/ui (copied components)                              | 4.3.x                                       |                                                                                 |
| ORM              | Prisma ORM + `prisma migrate` (versioned SQL migrations)                      | 7.10.x                                      | npm `latest` is an 8.0 RC; I'm pinning the stable 7.10                          |
| DB               | PostgreSQL                                                                    | 16                                          |                                                                                 |
| Validation       | Zod (one schema shared by client forms and API)                               | 4.x                                         |                                                                                 |
| i18n             | next-intl                                                                     | 4.x                                         | locales `uz` (default), `ru`, `en`                                              |
| Password hashing | argon2id via `@node-rs/argon2`                                                | 2.x                                         | prebuilt binaries, no node-gyp                                                  |
| Unit tests       | Vitest                                                                        | 5.x                                         |                                                                                 |
| E2E tests        | Playwright                                                                    | 1.6x                                        |                                                                                 |
| Lint/format      | ESLint 10 (flat config) + Prettier 3                                          |                                             |                                                                                 |
| Packaging        | Docker multi-stage + docker-compose (app + postgres)                          |                                             |                                                                                 |
| CI               | GitHub Actions: lint, typecheck, unit, migrate+e2e against a postgres service |                                             |                                                                                 |

## 2. Architecture and layering

```
Browser (React client components, shadcn/ui, react-hook-form + zod)
   │ fetch JSON (same-origin, CSRF header)
   ▼
app/api/v1/**/route.ts           ← HTTP only: parse+validate (zod), authN, call service, map errors
   ▼
server/services/*.service.ts     ← business rules, authorization (RBAC + branch scope), transactions, audit
   ▼
server/repositories/*.repo.ts    ← Prisma queries only; pagination/sort/filter helpers
   ▼
PostgreSQL
```

Rules:

- Components never import `server/**`. Server components only _read_, through services (the same service functions the API uses), so reads are authorized in exactly one place.
- Every mutation goes through `/api/v1`. Services call `authorize(actor, permission, scope)` before anything else.
- `server/integrations/*` sit behind interfaces (`SmsProvider`, `TelegramNotifier`, `AmoCrmClient`, `TelephonyProvider`, `FaceIdSource`). Each has a real adapter and a `Fake` adapter used in tests and dev (A-20).
- Background jobs (auto-SMS, debtor detection, monthly charges, payroll recalculation) run as a worker process using a Postgres-backed job queue table, `SELECT … FOR UPDATE SKIP LOCKED`, with no extra infrastructure (A-21).

### Cross-cutting

| Concern          | Design                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessions         | Opaque random 256-bit token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie. Only the SHA-256 of the token is stored in the `Session` table. 12 h sliding expiry. Logout and password change revoke sessions.              |
| CSRF             | All mutations require (a) a `SameSite` cookie, (b) an `Origin`/`Host` match and (c) a double-submit token (`csrf` cookie + `x-csrf-token` header).                                                                           |
| Login rate limit | `LoginAttempt` table keyed by phone and IP: 5 failures per 15 min locks for 15 min. DB-backed, so it works across instances.                                                                                                 |
| Errors           | `AppError` union: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTEGRATION`, `INTERNAL`. JSON shape `{ error: { code, message, fields? } }`; `message` is an i18n key.            |
| Lists            | One query contract for every list: `?page&pageSize&sort=field:asc                                                                                                                                                            | desc&q=&<filters>`. Filtering, sorting and paging all happen on the server. Response: `{ items, page, pageSize, total }`. |
| Audit            | `audit.record(tx, {actor, action, entity, entityId, before, after})` runs inside the same transaction as every create/update/delete. It powers Group history (EXP §5), Student history (EXP §6) and the Action log (EXP §8). |
| Branch scope     | Most records belong to a `Branch`. Each user has allowed branches; the header branch selector (EXP §0) sets the active branch, and services filter by it.                                                                    |
| Money            | `Decimal(15,2)`, currency UZS.                                                                                                                                                                                               |
| Files            | Photos and course materials go to local disk in dev and S3-compatible storage in prod, behind a `Storage` interface (A-22).                                                                                                  |
| i18n             | All UI strings are in `messages/{uz,ru,en}.json`; there are no literals in components. Dates and numbers are formatted per locale.                                                                                           |
| Accessibility    | shadcn/Radix primitives, labelled form fields, keyboard-navigable tables, WCAG AA contrast.                                                                                                                                  |

## 3. Entity-relationship diagram

All entities come from EXP §13. Fields in each table follow the EXP forms; the full Prisma schema is written in Phase 2 and per-module phases.

```mermaid
erDiagram
  Organization ||--o{ Branch : has
  Organization ||--o{ User : employs
  Organization ||--o{ Role : "custom roles"
  Organization ||--o{ PaymentMethod : defines
  Organization ||--|| OrgSettings : has
  Branch ||--o{ Room : has
  Branch ||--o{ Course : offers
  Branch ||--o{ DayOff : has
  School ||--o{ Student : attends

  User ||--o{ UserRole : has
  Role ||--o{ UserRole : grants
  Role ||--o{ RolePermission : has
  User }o--o{ Branch : "works in"
  User ||--o{ Session : has

  GradingSystem ||--o{ GradingLevel : has
  Course }o--|| GradingSystem : "graded by"

  Group }o--|| Course : teaches
  Group }o--|| Branch : in
  Group }o--o| GradingSystem : "override"
  Group ||--o{ GroupScheduleSlot : "meets (weekday,time,room)"
  Group ||--o{ GroupTeacher : "taught by (role, share)"
  User ||--o{ GroupTeacher : teaches
  Group ||--o{ GroupSupportTeacher : has
  Group ||--o{ Lesson : has
  Lesson ||--o{ Attendance : records
  Lesson ||--o{ Grade : records
  Group ||--o{ GroupNote : has
  Group ||--o{ GroupDayOff : "dam berish"

  Student ||--o{ Parent : has
  Student ||--o{ StudentCustomField : has
  Student ||--o{ GroupMembership : joins
  Group ||--o{ GroupMembership : contains
  GroupMembership ||--o{ Discount : has
  GroupMembership ||--o{ Charge : "monthly fee"
  Student ||--o{ Payment : makes
  Payment }o--|| GroupMembership : "for group"
  Payment ||--o{ Refund : has
  Student ||--o{ StudentComment : has
  Student ||--o{ CoinTransaction : earns

  Exam }o--o| Group : "group exam"
  Exam }o--o{ Group : "mock targets"
  Exam ||--o{ ExamResult : has

  LeadBoard ||--o{ LeadColumn : has
  LeadColumn ||--o{ Lead : holds
  LeadSource ||--o{ Lead : brings
  Lead ||--o{ LeadPhone : has
  LeadForm }o--|| LeadColumn : "drops into"
  Lead |o--o| Student : "converts to"

  FinanceCategory ||--o{ FinanceEntry : has
  User ||--o{ Advance : receives
  User ||--o{ Bonus : receives
  User ||--o{ Penalty : receives
  PayrollPeriod ||--o{ PayrollLine : has
  User ||--o{ PayrollLine : "paid by"
  Investment }o--|| Organization : "active balance"

  CoinRule ||--o{ CoinTransaction : triggers
  ProductCategory ||--o{ Product : has
  Product ||--o{ PurchaseRequest : requested

  Test ||--o{ TestQuestion : uses
  QuestionBankItem ||--o{ TestQuestion : "in"
  Test ||--o{ TestAttempt : taken

  SmsCategory ||--o{ SmsTemplate : has
  AutoSmsRule }o--|| SmsTemplate : uses
  SmsMessage }o--o| Student : to
  CallLog }o--o| Student : with
  StaffAttendance }o--|| User : of
  WorkSchedule }o--|| User : for
  LeaveReason ||--o{ GroupMembership : "left because"
  AuditLog }o--|| User : actor
  LoginLog }o--|| User : who
```

Enums, taken directly from EXP:

- `GroupStatus`: ACTIVE, ARCHIVED, TRIAL, FROZEN (EXP §5)
- `MembershipStatus`: NEW, TRIAL, ACTIVE, FROZEN, ARCHIVED, GRADUATED (EXP §5, §6; transitions in A-08)
- `AttendanceStatus`: PRESENT, ABSENT, EXCUSED, NOT_MARKED (EXP §6)
- `LeadStatus`: NEW, CONTACTED, UNREACHABLE, LOST; `LeadTemperature`: HOT, WARM, COLD (EXP §2)
- `SalaryMethod`: PERCENT, MONTHLY, PER_LESSON, PER_STUDENT; `GroupTeacherRole`: MAIN, ASSISTANT, CO_TEACHER; `ShareType`: PERCENT, PER_LESSON, PER_STUDENT (EXP §4, §5)
- `WeekdayPattern`: EVEN, ODD, EVERY_DAY, CUSTOM (EXP §5)
- `ExamType`: GROUP, MOCK; `ExamStatus`: NOT_STARTED, FINISHED (EXP §7)
- `PayrollStatus`: MODERATION, APPROVED (EXP §9, [INFERRED] → A-12)
- `Gender`: MALE, FEMALE

## 4. Roles and permission matrix

Built-in roles (EXP §8 Staff): CEO, ADMIN, BRANCH_MANAGER, CASHIER, TEACHER, SUPPORT_TEACHER, MARKETER, WATCHER, PARENT, OTHER. Custom roles can be created (EXP §8 Roles).

Permissions are `module.action`. The modules match the reference's role picker (EXP §8): dashboard, leads, teachers, groups, students, exams, tests, questionBank, finance, reports, settings. The individual permissions in the reference were **not visible** (EXP: NOT VERIFIED), so the action list and the defaults below are my design (A-05). CEO can edit roles later.

Legend: **F** = full (view/create/update/delete), **V** = view, **E** = view+create+update (no delete), **O** = only own records (e.g. a teacher's own groups), **–** = none.

| Module / special action                                            | CEO | ADMIN | BRANCH_MGR | CASHIER      | TEACHER                                | SUPPORT_T | MARKETER      | WATCHER | PARENT | OTHER |
| ------------------------------------------------------------------ | --- | ----- | ---------- | ------------ | -------------------------------------- | --------- | ------------- | ------- | ------ | ----- |
| dashboard.view (KPIs hidden behind "show numbers")                 | F   | V     | V          | V            | –                                      | –         | V             | V       | –      | –     |
| dashboard.finance                                                  | V   | –     | V          | V            | –                                      | –         | –             | V       | –      | –     |
| leads                                                              | F   | F     | F          | –            | –                                      | –         | F             | V       | –      | –     |
| teachers                                                           | F   | E     | E          | V            | –                                      | –         | –             | V       | –      | –     |
| groups                                                             | F   | F     | F          | V            | O (view, attendance, grades, notes)    | O (view)  | –             | V       | –      | –     |
| groups.attendance.mark                                             | ✓   | ✓     | ✓          | –            | O                                      | O         | –             | –       | –      | –     |
| students                                                           | F   | F     | F          | V            | O (view; create if setting on, EXP §8) | O (view)  | –             | V       | –      | –     |
| students.blacklist                                                 | ✓   | ✓     | ✓          | –            | –                                      | –         | –             | –       | –      | –     |
| payments.create                                                    | ✓   | ✓     | ✓          | ✓            | –                                      | –         | –             | –       | –      | –     |
| payments.refund (if refunds enabled)                               | ✓   | ✓*    | ✓*         | ✓*           | –                                      | –         | –             | –       | –      | –     |
| discounts.give                                                     | ✓   | ✓*    | ✓          | –            | –                                      | –         | –             | –       | –      | –     |
| exams                                                              | F   | F     | F          | –            | O (if "teachers see exam schedule")    | O         | –             | V       | –      | –     |
| tests / questionBank                                               | F   | F     | F          | –            | E                                      | E         | –             | V       | –      | –     |
| finance (entries, advances, bonus, fines, investments)             | F   | –     | E          | E            | –                                      | –         | V (marketing) | V       | –      | –     |
| finance.payroll.approve                                            | ✓   | –     | –          | –            | –                                      | –         | –             | –       | –      | –     |
| reports                                                            | V   | V     | V          | V (payments) | –                                      | –         | V (leads)     | V       | –      | –     |
| settings (org, roles, integrations)                                | F   | –     | –          | –            | –                                      | –         | –             | –       | –      | –     |
| settings (courses, rooms, days off, schools, SMS templates, forms) | F   | F     | F          | –            | –                                      | –         | – (forms: F)  | –       | –      | –     |
| logs (logins, actions, SMS)                                        | V   | V     | V          | –            | –                                      | –         | –             | V       | –      | –     |

\* If the org setting "Admin actions need CEO approval" (EXP §8) is on, these actions create a pending approval that only CEO can confirm (A-09).

PARENT and OTHER get no default permissions. A parent portal was not observed (A-07).

## 5. API list (`/api/v1`)

Every list endpoint takes the common query contract (§2). Every mutation is audited. `:id` values are cuid strings.

**Auth / session**
`POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/active-branch`

**Dashboard (EXP §1)**
✓ `GET /dashboard/kpis?branchId` · ✓ `GET /dashboard/schedule?branchId&weekday&step` · ✓ `GET /dashboard/finance?branchId&year&month&paymentMethodId`

**Leads (EXP §2–3)**
✓ `GET|POST /lead-boards` · `PATCH|DELETE /lead-boards/:id` · `POST /lead-boards/:id/columns` · `PATCH|DELETE /lead-columns/:id`
✓ `GET /leads?boardId&q&lessonTime&teacherId&days&archived` (board view) · `POST /leads` · `GET|PATCH|DELETE /leads/:id` · `POST /leads/:id/move` · `POST /leads/:id/archive` · `POST /leads/:id/restore` · `POST /leads/add-to-group` · `GET /leads/options` · ✓ `POST /lead-columns/:id/sms` (as `POST /sms/send` with a column target) · ✓ `GET /leads/export.xlsx`
✓ `GET /lead-sources?from&to` (catalogue with counts, EXP §3) · `POST /lead-sources` · `PATCH|DELETE /lead-sources/:id`
✓ `GET|POST /lead-forms` · `PATCH|DELETE /lead-forms/:id` · `GET|POST /public/lead-forms/:slug` (public, rate limited, no session); the page is `/forms/:slug`

**Teachers (EXP §4)**
`GET|POST /teachers?tab=teachers|support&archived` · `GET|PATCH|DELETE /teachers/:id` · `PUT /teachers/:id/group-rates` · `POST /teachers/sms` · ✓ `GET /teachers/export.xlsx?tab&archived`

**Groups (EXP §5)** — Phase 5 ships the lines marked ✓; the rest follow with their modules (A-49).
✓ `GET|POST /groups?status&teacherId&courseId&weekdayPattern` · `GET|PATCH|DELETE /groups/:id` · `POST /groups/:id/finish` · `POST /groups/:id/move-branch` · `POST /groups/:id/change-teacher` · `POST /groups/:id/support-teachers` · `GET|POST /groups/:id/day-off` · `GET /groups/teacher-options` · ✓ `GET /groups/export.xlsx` · ✓ `GET /groups/:id/export.xlsx?archived` · ✓ `GET /groups/:id/attendance.xlsx?month` · ✓ `GET /groups/:id/grades.xlsx?month`
✓ `GET|POST /groups/:id/members?archived&q&sort` · `PATCH /memberships/:id` (status, custom price, note) · `POST /memberships/:id/remove` · `GET /students/search?q` · `POST /memberships/:id/transfer` (Phase 6) · `POST /memberships/:id/to-lead` (Phase 7 ✓) · ✓ `POST /groups/:id/members/import` (xlsx) · ✓ `GET /groups/import-template.xlsx`
✓ `GET /groups/:id/lessons?month` · `POST /groups/:id/lessons/extra` · `PATCH /lessons/:id` (topic, attachment) · `PUT /lessons/:id/attendance` · `PUT /lessons/:id/grades`
✓ `GET|POST /groups/:id/notes` · `GET /groups/:id/history` · `GET|POST /groups/:id/discounts` (Phase 6) · `DELETE /discounts/:id` (Phase 6) · ✓ `GET /groups/:id/coins` · ✓ `POST /coins/give` · `GET|POST /groups/:id/student-comments` (Phase 6)
✓ `GET /groups/:id/tests` · ✓ `GET /groups/:id/knowledge` · ✓ `GET|POST /groups/:id/exams`

**Students (EXP §6)** — Phase 6 ships the lines marked ✓ (A-59..A-65); the rest follow with their modules.
✓ `GET|POST /students?archived&courseId&schoolId&groupId&teacherId&groupStatus&paymentStatus` · `GET|PATCH|DELETE /students/:id` · `POST /students/:id/restore` · `POST /students/:id/blacklist` · `GET /students/options` · `POST /students/activate` (Phase 7 ✓) · ✓ `POST /students/import` (xlsx) · ✓ `GET /students/import-template.xlsx` · ✓ `GET /students/export.xlsx` · ✓ `POST /students/sms` (as `POST /sms/send`) · badges are pages: `/students/:id/badge`, `/students/badges`
✓ `POST /students/:id/custom-fields` · `DELETE /custom-fields/:id` · `POST /students/:id/parents` · `DELETE /parents/:id` · `GET|POST /students/:id/comments` · `GET /students/:id/history` · `GET /memberships/:id/calendar?month` · `POST /groups/:id/activate-members`
✓ `GET /students/:id/progress` · ✓ `GET /students/:id/test-results` · ✓ `GET /students/:id/coins` · ✓ `GET /students/:id/sms` · ✓ `GET /students/:id/calls` · ✓ `POST /students/:id/call`
✓ `GET /payments?studentId&groupId&membershipId&paymentMethodId&receivedById&from&to` · ✓ `GET /payments/export.xlsx` (same filters) · `POST /payments` · `GET /payments/:id` · `POST /payments/:id/refund` · `GET /payments/options` · `GET /memberships/:id/payment-info` · `POST /memberships/:id/transfer` · `GET|PUT /settings/receipt` · the receipt is a page: `/payments/:id/receipt`

**Exams (EXP §7)**
✓ `GET|POST /exams?type=GROUP|MOCK&status&groupId&from&to` · `GET|PATCH|DELETE /exams/:id` · `POST /exams/:id/finish|reopen` · `GET|PUT /exams/:id/results` · `POST|DELETE /exams/:id/registrations` (mock "Arizalar") · `GET /exams/:id/candidates?q` · `GET /exams/options`

**Settings (EXP §8)**
✓ `GET|POST /sms-categories` · `DELETE /sms-categories/:id` · `GET|POST /sms-templates` · `PATCH|DELETE /sms-templates/:id` · `POST /sms-templates/import` · `POST /sms/send` · `POST /sms/count`
`GET|PUT /settings/receipt`
`GET|POST /courses` · `PATCH|DELETE /courses/:id` · same CRUD for `/rooms`, `/days-off`, `/schools`, `/branches`, `/payment-methods`, `/grading-systems`
✓ `GET|PUT /settings/coins` · `GET|POST /coin-reasons` · `PATCH|DELETE /coin-reasons/:id` · `GET /coins/report` · `GET /coins/options` · `GET /coins/students?q`
✓ `GET|POST /tests` · `GET|PATCH|DELETE /tests/:id` · `POST /tests/:id/status` · `POST /tests/:id/attempts` · `GET /tests/options` · `GET|POST /question-bank` · `PATCH|DELETE /question-bank/:id` · `GET /question-bank/options`
✓ `GET|PUT /settings/org` · ✓ `GET|PUT /settings/auto-sms`
`GET|POST /staff?role&archived` · ✓ `GET /staff/export.xlsx?role&archived` · `GET /staff/role-counts` · `GET|PATCH|DELETE /staff/:id` · `GET|POST /roles` · `PATCH|DELETE /roles/:id` · `GET /permissions` · `POST /uploads` · `GET /files/:key`
✓ `GET /calls` · `GET /logs/logins` · `GET /logs/actions` · `GET /logs/sms` · `GET|POST /bot-recipients` · `DELETE /bot-recipients/:id` · `POST /jobs/run`
✓ `GET /integrations` · `GET|PUT /integrations/:provider` (amocrm, face-id, sms, telegram, telephony) · `POST /integrations/amocrm-test`
`GET /approvals` · `POST /approvals/:id/approve|reject` (A-09)

**Finance (EXP §9)**
✓ `GET /finance/overview?branchId&year&month&paymentMethodId` · `GET /finance/plan?…&effective` · `GET|POST /finance/categories` · `GET|PATCH|DELETE /finance/categories/:id` · `GET|POST /finance/entries?type&categoryId&…` (one ledger for advances, marketing, bonuses, penalties, investments and category rows, A-74) · `PATCH|DELETE /finance/entries/:id` · `GET /finance/options` · `GET /finance/students?q`
✓ `GET /payroll` · `GET|PUT /payroll/:month` (PUT = draft/save status) · `POST /payroll/:month/recalculate` · `POST /payroll/:month/lines/:id/approve` · ✓ `GET /payroll/:month/export.xlsx`

**Reports (EXP §10)**
✓ `GET /reports/payments?year&month&branchId` · ✓ `GET /reports/payments/export.xlsx?tab` · ✓ `GET /reports/student-payments?…&byPaidAt&groupId&teacherId&courseId&paymentMethodId&receivedById&bonus` · ✓ `GET /reports/student-payments/options` · ✓ `GET /reports/student-payments/export.xlsx` · ✓ `GET /reports/churn?from&to&branchId&courseId&teacherId&groupId&reason&discount` · ✓ `GET /reports/churn/export.xlsx` · ✓ `GET|POST /leave-reasons` · ✓ `PATCH|DELETE /leave-reasons/:id` · ✓ `GET /reports/graduates?…&groupId&teacherId&courseId&result` · ✓ `GET /reports/graduates/export.xlsx` · ✓ `PUT /memberships/:id/graduate` · ✓ `GET /reports/staff-attendance?year&month&branchId&date` · `PUT /work-schedules` · `PUT /staff-attendance/manual` · ✓ `GET /reports/coins` (page over `/coins/report`) · ✓ `GET|POST /marketplace/categories` · `DELETE /marketplace/categories/:id` · `GET|POST /marketplace/products` · `PATCH|DELETE /marketplace/products/:id` · `GET|POST /marketplace/purchase-requests` · `PATCH /marketplace/purchase-requests/:id` · ✓ `GET /reports/leads?…&sourceId` · ✓ `GET /reports/leads/export.xlsx` · ✓ `GET /reports/students?from&to&groupId&teacherId&status&page` · ✓ `GET /reports/students/export.xlsx?tab` · ✓ `GET /reports/statistics?view&date` · ✓ `GET /reports/statistics/export.xlsx`

**Header widgets (EXP §11)**
✓ `GET /search?q` · ✓ `GET /notifications?unread&page` · ✓ `POST /notifications/read`

**Webhooks (integrations)**
✓ `POST /webhooks/telephony` · `POST /webhooks/face-id` · `POST /webhooks/telegram` (shared secret in `x-kampus-secret` or `?secret=`; `/webhooks/amocrm` is only the OAuth redirect URI)

## 6. Folder structure

```
kampus-crm/
├─ .github/workflows/ci.yml
├─ docker/ (Dockerfile, entrypoint)          docker-compose.yml   .env.example
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/                            # versioned, committed
│  └─ seed.ts                                # fake demo data only (faker, fixed seed)
├─ messages/ uz.json  ru.json  en.json
├─ src/
│  ├─ app/
│  │  ├─ [locale]/
│  │  │  ├─ (auth)/login/page.tsx
│  │  │  └─ (app)/layout.tsx                 # top bar, nav, branch selector
│  │  │     ├─ dashboard/  leads/  teachers/  groups/  students/  exams/
│  │  │     ├─ finance/  reports/  settings/
│  │  ├─ api/v1/**/route.ts                  # thin HTTP handlers
│  │  └─ public/forms/[slug]/page.tsx        # public lead form
│  ├─ components/ ui/ (shadcn)  data-table/  forms/  layout/
│  ├─ features/<module>/                     # client UI per module: tables, drawers, dialogs, hooks
│  ├─ lib/
│  │  ├─ validation/<module>.ts              # zod schemas shared client+server
│  │  ├─ api-client.ts  i18n.ts  money.ts  dates.ts
│  ├─ server/
│  │  ├─ auth/ (session, password, csrf, rate-limit)
│  │  ├─ rbac/ (permissions.ts, authorize.ts, branch-scope.ts)
│  │  ├─ audit/  errors/  http/ (handler wrapper, list-query parser)
│  │  ├─ services/<module>.service.ts
│  │  ├─ repositories/<module>.repo.ts
│  │  ├─ domain/ (billing.ts, payroll.ts, grading.ts, schedule.ts) # pure functions, unit-tested
│  │  ├─ jobs/ (queue.ts, worker.ts, handlers/)
│  │  └─ integrations/ sms/ telegram/ amocrm/ telephony/ faceid/ storage/
│  └─ middleware.ts                          # locale + session presence
├─ tests/
│  ├─ unit/        (vitest; domain + services with test DB)
│  └─ e2e/         (playwright; one spec per EXP page)
├─ docs/ ARCHITECTURE.md  ASSUMPTIONS.md  TRACEABILITY.md
└─ README.md
```

## 7. Build phases (proposed order)

Kai asked for the site-map order. I've moved the Settings core forward and the Dashboard to the end, because groups need courses, rooms and staff to exist first, and the dashboard only aggregates other modules. Everything else follows the site map.

| #     | Phase                                                                                                                                                                                                                           | EXP sections              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 2     | Skeleton: auth, sessions, RBAC, roles/staff basics, layout + nav + branch selector, i18n (uz/ru/en), audit, error handling, list contract, Docker, CI, seed                                                                     | §0, §8 Staff/Roles        |
| 3     | Settings core: org settings, branches, payment methods, grading systems, courses, rooms, days off, schools                                                                                                                      | §8                        |
| 4     | Teachers                                                                                                                                                                                                                        | §4                        |
| 5     | Groups (schedule, members, attendance, grades, notes, history; minimal students). Discounts and student comments moved to Phase 6 (A-49)                                                                                        | §5                        |
| 6     | Students + payments, refunds, receipts, parents, badges, discounts, student comments, transfer; Settings → receipt and payments log                                                                                             | §6, §11 TO'LOV            |
| 7     | Leads (boards, columns, Kanban, add to group, return to leads), sources report, lead forms with a public page; students "Activate"                                                                                              | §2, §3, §8 Forms          |
| 8     | Exams: group and mock exams, grading sheet with levels, mock registrations, finish/reopen; group IMTIHON tab; student Progress tab                                                                                              | §7, §5, §6                |
| 9     | Finance: overview figures and charts, monthly plan, categories and the ledger (advances, marketing, bonuses, fines, investments), payroll with approval                                                                         | §9                        |
| 10    | Tests + question bank (staff-entered results, group TEST and BILIM TAHLILI tabs, student TEST NATIJALARI), coins (settings, group COINLAR, auto attendance/test awards) + marketplace and purchase requests on the Coins report | §8 Tests/Coins, §10 Coins |
| 11    | Integrations: SMS templates + auto-SMS (Eskiz), Telegram bot, AmoCRM, telephony/calls, FaceID + staff attendance, logs                                                                                                          | §8, §10                   |
| 12    | Reports: payments, student payments, churn + leave reasons, graduates, leads, students, center statistics; every EXCEL export and the two Excel imports; progress-tab chart ✓ (PR #11)                                          | §10                       |
| 13    | Dashboard (12 cards behind "show numbers", room schedule, finance summary), header search over students / leads / groups, in-app notifications with a bell and a page ✓ (PR #12)                                                | §1, §11                   |
| Final | README, ASSUMPTIONS.md, TRACEABILITY.md (every EXP page → code + tests) ✓ (PR #13)                                                                                                                                              |                           |
