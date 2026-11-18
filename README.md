# CampusCare

CampusCare is the Phase 1 MVP of a student mental-health early-warning, case-management and telehealth platform for Indian universities. Students do short check-ins and optional PHQ-9 and GAD-7 screens. A written, configurable rule set raises alerts for the care team. Counsellors review alerts and manage cases, clinicians run consultations, and institution admins see privacy-suppressed aggregates.

Phase 1 covers: student onboarding with consent choices, check-ins, PHQ-9 and GAD-7, help requests, an explainable rule-based alert engine, human alert review, case management with referrals and follow-ups, appointment booking and a consultation room, in-app notifications and messages, institution analytics and reports, staff and tenant administration, and an audit log. Flags come from written rules. There is no AI in Phase 1 and the software never diagnoses.

**CampusCare is not an emergency service.** If someone is in danger, call 112. Tele-MANAS is a free national mental-health helpline: 14416 or 1-800-891-4416. The public page `/help-now` shows these numbers without signing in.

## Requirements

- Node.js 22.12 or later
- No local database server. CampusCare uses one MongoDB Atlas database for both the live site and local development. Put its connection string in `DATABASE_URL` in `.env` (ask the owner for it).
- **Local development writes to the live database.** Anything you create, edit or reset locally appears on the live demo straight away.

## Quick start

PowerShell:

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste into FIELD_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # paste into CRON_SECRET
# edit .env: set DATABASE_URL to the Atlas connection string, and CAMPUSCARE_DEPLOYMENT="demo" for demos
npm run dev
```

bash:

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste into FIELD_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # paste into CRON_SECRET
# edit .env: set DATABASE_URL to the Atlas connection string, and CAMPUSCARE_DEPLOYMENT="demo" for demos
npm run dev
```

Open http://localhost:3000. `npm install` also generates the Prisma client. The Atlas database already holds the demo data, so there is nothing to load.

`npm run db:reset -- --confirm <database name>` drops every collection in the `DATABASE_URL` database, recreates the indexes and reloads the demo data. That is the live database, so it refuses to run unless the name you pass matches the database name in the URL, and it prints only the host and database name.

Production check: `npm run build`, then `npx next start`.

## Demo

With `CAMPUSCARE_DEPLOYMENT=demo` (the only value that turns demo mode on), `/sign-in` shows one-click personas (defined in `src/lib/demo.ts`). All people, phone numbers and email addresses are fictional; emails use the reserved `.example` domain.

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
| `npm run db:generate` | Generate the Prisma client (also runs on `npm install`) |
| `npm run db:push` | Create the collections' indexes in the `DATABASE_URL` database (`prisma db push`) |
| `npm run db:seed` | Load the demo data into the `DATABASE_URL` database |
| `npm run db:reset -- --confirm <name>` | Drop every collection in the `DATABASE_URL` database, push the indexes and seed. Refuses without a matching `--confirm` |

## Architecture in brief

Next.js 16 App Router with React 19 and TypeScript, Tailwind CSS v4, Prisma 6 on MongoDB Atlas, Zod 4 for validation. Pages are Server Components that call a role guard first. Business rules live in `src/lib/services`, one transaction per mutation, each with a permission check, a tenant scope and an audit entry. The risk engine is in `src/lib/risk`. See [docs/architecture.md](docs/architecture.md) for the conventions, route map and contracts between modules.

Safety rules the code enforces:

- No diagnosis. Screening results are scores in a range on a questionnaire. Triage categories are operational labels.
- Only people acknowledge, lower or close alerts and close cases. Automated code can create alerts, attach evidence, raise a category and send notifications.
- Consent gates trend visibility. The care team sees check-in and screening trends only with care-team review consent. Help requests are always visible because the student asked.
- Tenant isolation. Every query is scoped by institution, and an id from another institution behaves like a missing id.
- Institution admins see aggregates only, with small groups suppressed (minimum group size of 5 or more).
- Clinical notes are readable only by the author or a clinician who has had an appointment with that student, and every read is audited.
- Free text a person types about a student is encrypted at field level.
- The audit log is append-only and hash-chained, so edits can be detected. MongoDB has no triggers, so the app's Prisma client refuses updates and deletes of audit entries and updates of consent records. Someone with direct database access can still change rows; the hash chain shows it.
- Crisis numbers are always reachable, without signing in.

## Testing

`npm test` runs Vitest against a throwaway in-memory MongoDB replica set (`mongodb-memory-server`) that starts with the run and disappears when it finishes; each test file gets its own empty database. It never touches Atlas. The first run downloads a MongoDB 8.0 server binary into a local cache. It covers field encryption, audit hash chain, TOTP, role permissions, PHQ-9 and GAD-7 scoring, the risk rules and engine, small-group suppression, notification templates, English and Hindi string parity, the append-only guard and transaction retry, and integration flows for consent and check-ins, risk alerts, human review, and tenant isolation with audit. `npm run typecheck` runs the TypeScript compiler.

## Pilot deployment

- Set `DATABASE_URL` (or `MONGODB_URI`) to the Atlas connection string. Atlas must run as a replica set, which every Atlas cluster does. Run `npm run db:push` after a schema change.
- Set `CAMPUSCARE_DEPLOYMENT=pilot` (or `production`). Only `demo` turns demo mode on; any other value logs one error for an unrecognised word and leaves demo mode off. `db:seed` and `db:reset` refuse to run unless it is `demo`.
- Use the pilot's own empty database, never the demo one.
- Set `PILOT_CONTACT_EMAIL` to one plain address on a real domain for the "Request a pilot" buttons. Without it the buttons are hidden. On Vercel, a changed environment variable takes effect only after a redeploy.
- Provide `FIELD_ENCRYPTION_KEY` from a secret store. Losing it makes encrypted text unreadable, so back it up there.
- Set `APP_ORIGIN` to the public https origin.
- Call `POST /api/internal/tick` every 5 minutes with the header `Authorization: Bearer $CRON_SECRET`. It escalates overdue urgent alerts, notifies due follow-ups and sends appointment reminders.
- Video: `VIDEO_PROVIDER=daily` with `DAILY_API_KEY` and `DAILY_DOMAIN`. The Daily.co integration is untested. The default `dev` provider is a local waiting room with no media relay.
- Set `FRAME_ANCESTORS` only for local preview embedding. Leave it unset in production.
- Staff sign in with a password and a second step (TOTP). Staff enrol the second factor on first sign-in.

## Before a commercial deployment

Work through this list before real student data enters any deployment.

- **Legal review**: Digital Personal Data Protection Act 2023 and its rules, Mental Healthcare Act 2017, Telemedicine Practice Guidelines 2020.
- **Privacy review**: consent wording, data retention, and what each role can see.
- **Security review**: a penetration test, key management for `FIELD_ENCRYPTION_KEY`, and a backup that has been restored successfully at least once.
- **Clinical review**: triage rules, the crisis protocol, and the Hindi wording.
- **Settings for a pilot**: `CAMPUSCARE_DEPLOYMENT=pilot`; its own empty database; its own `FIELD_ENCRYPTION_KEY`; `CRON_SECRET` with a scheduler calling `POST /api/internal/tick` every 5 minutes; `APP_ORIGIN`; `PILOT_CONTACT_EMAIL`.
- **The known gaps** listed below.

Nothing schedules the tick on the demo site, so automatic reminders and repeat escalations do not run there.

## Known gaps before a pilot

- Hindi copy needs review by a native-speaking clinician. Validated Hindi PHQ-9 and GAD-7 are not loaded.
- Service errors show in English on Hindi pages.
- The Daily.co video integration is untested.
- There is no per-IP rate limit, only per-account lockout.
- Email ownership is not verified at registration.
- Notifications are in-app only. No SMS, email or push.
- Analytics load a whole reporting period into memory.
- Legal and clinical review is needed before launch, including the Digital Personal Data Protection Act 2023, the Mental Healthcare Act 2017 and the Telemedicine Practice Guidelines 2020.
