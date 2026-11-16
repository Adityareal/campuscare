# CampusCare

CampusCare is the Phase 1 MVP of a student mental-health early-warning, case-management and telehealth platform for Indian universities. Students do short check-ins and optional PHQ-9 and GAD-7 screens. A written, configurable rule set raises alerts for the care team. Counsellors review alerts and manage cases, clinicians run consultations, and institution admins see privacy-suppressed aggregates.

Phase 1 covers: student onboarding with consent choices, check-ins, PHQ-9 and GAD-7, help requests, an explainable rule-based alert engine, human alert review, case management with referrals and follow-ups, appointment booking and a consultation room, in-app notifications and messages, institution analytics and reports, staff and tenant administration, and an audit log. Flags come from written rules. There is no AI in Phase 1 and the software never diagnoses.

**CampusCare is not an emergency service.** If someone is in danger, call 112. Tele-MANAS is a free national mental-health helpline: 14416 or 1-800-891-4416. The public page `/help-now` shows these numbers without signing in.

## Requirements

- Node.js 22.12 or later
- No local database server. Local development uses PGlite, an in-process Postgres stored in `.pglite`.

## Quick start

PowerShell:

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste into FIELD_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # paste into CRON_SECRET
# edit .env: set DEMO_MODE="true" for demos
npx prisma generate
npm run db:reset
npm run dev
```

bash:

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste into FIELD_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # paste into CRON_SECRET
# edit .env: set DEMO_MODE="true" for demos
npx prisma generate
npm run db:reset
npm run dev
```

Open http://localhost:3000. `npm run db:reset` deletes `.pglite`, applies the migrations and loads the demo data. Stop any running server first.

Production check: `npm run build`, then `npx next start`.

## Demo

With `DEMO_MODE=true`, `/sign-in` shows one-click personas (defined in `src/lib/demo.ts`). All people, phone numbers and email addresses are fictional; emails use the reserved `.example` domain.

| Persona | Role |
|---|---|
| Aanya Kulkarni | Student |
| Meera Iyer | Counsellor |
| Dr Rohan Desai | Clinician |
| Vikram Shah | Institution admin (Sahyadri Institute of Technology) |
| Neha Rao | Platform admin |

The seed (`prisma/seed.ts`) replays eight weeks of history through the real services. It also creates a second institution, Narmada University, to show that tenants are isolated. Five scripted students show the main paths:

- **Aanya**: academic pressure rises and sleep falls over eight weeks. An alert is raised, acknowledged and followed by a PHQ-9 request and a message.
- **Rahul**: a positive answer on the PHQ-9 safety item raises an urgent alert that is handled the same afternoon. His account uses Hindi.
- **Sneha**: a severe GAD-7 score, counsellor outreach and an upcoming session.
- **Ishita**: an urgent help request that nobody has acknowledged yet, so the overdue escalation shows.
- **Mohammed Faizan**: has not given care-team review consent, so his check-ins never raise alerts. He asks for help himself and the case is handled and closed. His account uses Hindi.

Public pages that need no sign-in: `/` (landing), `/try` (interactive walk-through using in-browser sample data, nothing saved) and `/help-now` (crisis contacts).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | `prisma generate`, then `next build` |
| `npm start` | Start the production server (`next start`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the Vitest suite once |
| `npm run db:generate` | Generate the Prisma client into `src/generated/prisma` |
| `npm run db:migration:init` | Print SQL that creates the whole schema from empty, for writing the initial migration |
| `npm run db:reset` | Delete the local PGlite database, migrate and seed demo data |
| `npm run db:seed` | Run the seed script only |
| `npm run db:deploy` | Apply migrations to the database in `DATABASE_URL` (`prisma migrate deploy`) |

## Architecture in brief

Next.js 16 App Router with React 19 and TypeScript, Tailwind CSS v4, Prisma 7 on PostgreSQL, Zod 4 for validation. Pages are Server Components that call a role guard first. Business rules live in `src/lib/services`, one transaction per mutation, each with a permission check, a tenant scope and an audit entry. The risk engine is in `src/lib/risk`. See [docs/architecture.md](docs/architecture.md) for the conventions, route map and contracts between modules.

Safety rules the code enforces:

- No diagnosis. Screening results are scores in a range on a questionnaire. Triage categories are operational labels.
- Only people acknowledge, lower or close alerts and close cases. Automated code can create alerts, attach evidence, raise a category and send notifications.
- Consent gates trend visibility. The care team sees check-in and screening trends only with care-team review consent. Help requests are always visible because the student asked.
- Tenant isolation. Every query is scoped by institution, and an id from another institution behaves like a missing id.
- Institution admins see aggregates only, with small groups suppressed (minimum group size of 5 or more).
- Clinical notes are readable only by the author or a clinician who has had an appointment with that student, and every read is audited.
- Free text a person types about a student is encrypted at field level.
- The audit log is append-only and hash-chained, so edits can be detected.
- Crisis numbers are always reachable, without signing in.

## Testing

`npm test` runs Vitest against an in-memory PGlite database. It covers field encryption, audit hash chain, TOTP, role permissions, PHQ-9 and GAD-7 scoring, the risk rules and engine, small-group suppression, notification templates, English and Hindi string parity, migrations, and integration flows for consent and check-ins, risk alerts, human review, and tenant isolation with audit. `npm run typecheck` runs the TypeScript compiler.

## Pilot deployment

- Use a managed Postgres: set `DATABASE_URL` to its connection string and run `npm run db:deploy`.
- Set `DEMO_MODE=false`.
- Provide `FIELD_ENCRYPTION_KEY` from a secret store. Losing it makes encrypted text unreadable, so back it up there.
- Set `APP_ORIGIN` to the public https origin.
- Call `POST /api/internal/tick` every 5 minutes with the header `Authorization: Bearer $CRON_SECRET`. It escalates overdue urgent alerts, notifies due follow-ups and sends appointment reminders.
- Video: `VIDEO_PROVIDER=daily` with `DAILY_API_KEY` and `DAILY_DOMAIN`. The Daily.co integration is untested. The default `dev` provider is a local waiting room with no media relay.
- Set `FRAME_ANCESTORS` only for local preview embedding. Leave it unset in production.
- Staff sign in with a password and a second step (TOTP). Staff enrol the second factor on first sign-in.

## Known gaps before a pilot

- Hindi copy needs review by a native-speaking clinician. Validated Hindi PHQ-9 and GAD-7 are not loaded.
- Service errors show in English on Hindi pages.
- The Daily.co video integration is untested.
- There is no per-IP rate limit, only per-account lockout.
- Email ownership is not verified at registration.
- Notifications are in-app only. No SMS, email or push.
- Analytics load a whole reporting period into memory.
- Legal and clinical review is needed before launch, including the Digital Personal Data Protection Act 2023, the Mental Healthcare Act 2017 and the Telemedicine Practice Guidelines 2020.
