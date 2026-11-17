# CampusCare: architecture and engineering contract

Phase 1 MVP of the student mental health early-warning, case management and telehealth platform
described in the PRD. This file is the contract every part of the codebase follows. Read it before
changing anything.

## Stack

| Concern | Choice |
|---|---|
| App | Next.js 16 App Router, React 19, TypeScript (strict, `noUncheckedIndexedAccess`) |
| Styling | Tailwind CSS v4 with CSS-variable tokens in `src/app/globals.css` |
| Data | MongoDB Atlas via Prisma 6.19 (`prisma-client-js` generator, client in `node_modules/@prisma/client`) |
| Database | One Atlas database, shared by the live site and local development (`DATABASE_URL`, or `MONGODB_URI`). Local changes show up on the live demo. Tests use a throwaway in-memory replica set from `mongodb-memory-server` that disappears when the run ends |
| Validation | Zod 4 |
| Icons | `@phosphor-icons/react` (`*Icon` names). Server components import from `@phosphor-icons/react/dist/ssr` |
| Fonts | Geist Sans and Geist Mono (`geist`), Noto Sans Devanagari via `next/font/google` |
| Tests | Vitest (`src/**/*.test.ts`) |

`prisma/schema.prisma` is the source of truth for the data model. If the generated client
disagrees with the schema, the client is stale: regenerate it (`npm run db:generate`), never code
against the stale shape. There are no migrations: `npm run db:push` creates the indexes, including
every unique index the code relies on.

### What MongoDB does not enforce

The database checks unique indexes and nothing else. The app code enforces the rest:

- **Foreign keys.** Relations are emulated by Prisma (`relationMode = "prisma"` is implied on
  MongoDB). Nothing stops a raw write from pointing at a missing row, and `onDelete` actions run in
  the Prisma client, not the database.
- **Append-only tables.** `src/lib/db.ts` wraps every client in an extension that throws on
  `update`, `updateMany`, `upsert`, `delete` and `deleteMany` of `AuditLog`, and on `update`,
  `updateMany` and `upsert` of `ConsentRecord` (consent rows may be deleted, as before). Raw
  commands and direct database access bypass it; `verifyAuditChain` detects edits to the audit log.
- **One slot per appointment.** `AvailabilitySlot.appointmentId` has no unique index (MongoDB
  unique indexes are not sparse). Booking claims a slot with `updateMany where appointmentId: null`.
- **Audit chain order.** Each chain has an `AuditHead` document (id = chain, last seq and hash)
  that `recordAudit` advances in the same transaction as the new row. Concurrent writers conflict on
  that document; MongoDB aborts the loser and `runTx` re-runs it. The `(chain, seq)` unique index is
  the safety net.

## Non-negotiable invariants

1. **No diagnosis.** Screening results are "a score in a range on this questionnaire", never a
   condition. Triage categories (Routine, Monitor, Priority, Urgent) are operational labels.
2. **Only people end care work.** Automated code (`SystemActor`: risk engine, scheduler, seed) may
   create alerts, attach evidence, raise a category and send notifications. Acknowledging, lowering,
   closing alerts and closing cases require a `UserActor`; `assertCan` never passes for a system actor.
   Closing an urgent alert also needs a human-recorded contact attempt and a written review note.
3. **Consent gates visibility.** The care team sees a student's check-in and screening trends only with
   `CARE_TEAM_REVIEW` consent (`careTeamMaySeeTrends`). Help requests and their cases are always
   visible to the care team because the student asked. Aggregate well-being analytics include only
   students with `AGGREGATE_ANALYTICS` consent. Consent rows are append-only.
4. **Tenant isolation.** Every query is scoped by `institutionId` from `tenantOf(actor)`. An id from
   another institution behaves exactly like a missing id (`NOT_FOUND`).
5. **Administrators see aggregates only.** Institution admins never see an individual's check-ins,
   assessments, case notes, messages or clinical notes. Every aggregate cell covering fewer than
   `settings.minCohortSize` students (floor 5) is suppressed, with complementary suppression so a
   hidden cell cannot be recovered by subtracting from a total.
6. **Platform admins manage tenants only.** No permission to any student or clinical record.
7. **Clinical notes** are readable only by clinicians, and only by the author or a clinician who has or
   had an appointment with that student. Every read is audited. They never appear in analytics,
   reports or exports.
8. **Free text is encrypted.** Anything a person types about a student is stored with
   `encryptField`/`encryptOptional` in a `*Ct` column. System wording goes in plain columns
   (`summary`, `note`). Audit metadata holds ids, codes and counts only, never content.
9. **Notifications leak nothing.** Use `notify()` with a template from `services/notifications.ts`.
   Templates have a generic `preview` for anything outside the app. Links point inside the app and
   never carry clinical details in the URL.
10. **Crisis information is always reachable.** `/help-now` works without signing in and shows 112 and
    Tele-MANAS (14416, 1-800-891-4416) from `NATIONAL_CRISIS_CONTACTS`, plus campus contacts and care
    team hours from institution settings. Never promise round-the-clock campus response.
11. **Consultations are never recorded.** `Consultation.recordingEnabled` stays false.
12. **No AI in Phase 1.** Flags come from written, configurable rules (`src/lib/risk`). Copy must not
    claim that AI reads student answers.
13. **Demo mode** (`DEMO_MODE=true`) enables one-click demo personas on `/sign-in`. It must be checked on
    the server, and demo users carry `isDemo`. It must be off for any real pilot.

## Code conventions

### Services (`src/lib/services/*.ts`)

```ts
export async function doThing(actor: UserActor, id: string, input: Input): Promise<Result> {
  assertCan(actor, "case.manage");            // 1. permission
  const institutionId = tenantOf(actor);       // 2. tenant
  return runTx(async (tx) => {                 // 3. one transaction per mutation
    const row = await tx.case.findFirst({ where: { id, institutionId } });
    if (!row) fail("NOT_FOUND", "Case not found.");
    const t = now();                           // 4. time only from the clock
    await tx.thing.create({ data: { ..., createdAt: t } });
    await recordAudit(tx, actor, { action: "thing.do", entityType: "Thing", entityId: row.id });
    return ...;
  });
}
```

- **Time:** `now()`, `DAY`, `HOUR`, `MINUTE` from `@/lib/clock`. Set `createdAt` (and similar) explicitly on
  every create. Never call `new Date()` without arguments or `Date.now()` in services. The seed script
  replays weeks of history through these functions with the clock set.
- **Errors:** `fail(code, message)` from `@/lib/errors` for expected refusals. Messages are complete,
  plain sentences that are safe to show to the user.
- **Imports:** model types and enums `import type { Case, Role } from "@prisma/client"`,
  `db`/`DbLike`/`runTx` from `@/lib/db`.
- **Transactions:** always `runTx(fn)`, never `db.$transaction` directly. It re-runs the whole
  callback (up to 3 attempts) on a write conflict (P2034) or an audit-chain unique collision, so the
  callback must be safe to run twice: keep side effects outside the database after it returns. Any
  other unique violation (P2002) reaches the caller unchanged.
- **Case history:** `logCaseEvent`, `markMilestone`, `ensureOpenCase`, `linkAlertToCase` from
  `services/cases.ts`. Milestones are the PRD D3 lifecycle: ACKNOWLEDGED, REVIEWED, CONTACTED,
  ARRANGED, REFERRED, APPOINTMENT_UPDATED, FOLLOW_UP_SCHEDULED, OUTCOME_DOCUMENTED.
- **Permissions:** existing names in `src/lib/auth/permissions.ts`. Do not add roles to a permission
  to make a page work; report the gap instead.

### Pages and actions

- Pages are Server Components. Call the guard first: `requireStudent()`, `requireCareTeam()`,
  `requireClinician()`, `requireInstitutionAdmin()`, `requirePlatformAdmin()` (`@/lib/auth/guards`).
- Next 16: `params` and `searchParams` are Promises: `const { id } = await params;`.
- Map `DomainError` code `NOT_FOUND` to `notFound()` in pages.
- Server Actions live in an `actions.ts` next to the page, start with `"use server"`, re-check the
  guard, and use `guarded()` from `@/lib/action-state`:

```ts
"use server";
export async function closeCaseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    await closeCase(actor, formString(form, "caseId"));
    revalidatePath(`/counsellor/cases/${formString(form, "caseId")}`);
    return { status: "ok", message: "Case closed." };
  });
}
```

- Forms that show a result are small client components using `useActionState(action, IDLE)` with
  `SubmitButton` and `ActionMessage` from `@/components/ui/*`.

### UI rules

- Use `@/components/ui` (Button, ButtonLink, Field, Input, Textarea, Select, Fieldset, PageHeader,
  Panel, SectionHeading, TriageBadge, StatusPill, Notice, EmptyState, StatGrid/Stat, KeyValueList,
  Table/Th/Td, When, Ref) and `@/components/charts` (TrendChart, Sparkline, BarList).
- Colours only through tokens: `bg-canvas`, `bg-surface`, `bg-surface-2`, `text-ink`, `text-ink-2`,
  `text-ink-3`, `border-line`, `border-line-input`, `bg-accent`, `text-accent-ink`, `bg-accent-soft`,
  `text-accent-text`, and the triage sets `urgent`, `priority`, `monitor` (`bg-*-soft text-*-text`).
  Never raw hex values or Tailwind palette colours (`bg-white`, `text-gray-500`, `bg-red-50`).
- One shape rule: panels `rounded-panel`, buttons and inputs `rounded-control`, status labels `rounded-full`.
- No em dashes or en dashes in any visible string. Use a full stop, comma, colon or brackets.
  (The only exception is the verbatim PHQ-9 item wording in `src/lib/instruments`.)
- No emoji. Sentence-case headings. Plain, specific wording. Labels above inputs, help and errors
  below. Every control has a visible label. Every table has a caption. Colour is never the only
  signal. Touch targets at least 44px for primary actions. Never hand-draw SVG icons.
- Cards only where grouping means something. Prefer spacing and dividers.
- Mobile first: single column below `md`.
- Student-facing copy is warm and calm, never alarming, and never implies the app is monitored live.

### Student-facing language

`getDictionary(actor.locale)` and `fill()` from `@/lib/i18n`. `src/lib/i18n/en.ts` and `hi.ts` are
shared: do not edit them. New student strings go in a per-area file, for example
`src/lib/i18n/care.ts`, exporting `{ en: {...}, hi: {...} }` with identical keys and the same
`{placeholder}` names. Hindi is everyday Devanagari Hindi using the terms already in `hi.ts`
("केयर टीम", "चेक-इन", "प्रश्नावली", "अपॉइंटमेंट"). Staff pages are English only.

## Route map and ownership

| Area | Routes | Main code |
|---|---|---|
| Shared foundation | layouts, shells, `src/components/ui`, `src/components/charts`, `src/lib/**` core, `src/components/shell` | Shared modules |
| Student app | `/student`, `/student/onboarding`, `/student/check-in`, `/student/assessments/[id]`, `/student/help`, `/student/history`, `/student/privacy`, `/help-now` | `src/components/student`, `services/student-home.ts`, `checkins.ts`, `assessments.ts`, `consent.ts`, `help.ts`, `i18n/student.ts` |
| Care workspace | `/counsellor`, `/counsellor/alerts`, `/counsellor/alerts/[id]`, `/counsellor/cases`, `/counsellor/cases/[id]`, `/counsellor/students/[id]`, `/counsellor/follow-ups`, `/student/messages` | `src/components/care`, `services/alerts.ts`, `cases.ts`, `followups.ts`, `messages.ts`, `care-dashboard.ts`, `i18n/care.ts` |
| Telehealth | `/clinician`, `/clinician/availability`, `/clinician/appointments/[id]`, `/clinician/rules`, `/student/care`, `/student/appointments/[id]`, `/consult/[appointmentId]` | `src/components/telehealth`, `services/scheduling.ts`, `consultations.ts`, `clinical-notes.ts`, `referrals.ts`, `rules-admin.ts` |
| Institution | `/admin`, `/admin/departments`, `/admin/interventions`, `/admin/reports`, `/admin/users`, `/admin/settings`, `/admin/audit`, `/platform` | `src/components/admin`, `services/admin.ts`, `analytics.ts`, `reports.ts`, `platform.ts` |
| Access and landing | `/`, `/sign-in`, `/sign-in/verify`, `/register`, `/set-password`, `/account`, `/account/security`, `/notifications`, `not-found`, `error` | `src/components/auth`, `src/components/landing`, `services/access.ts`, `notifications.ts`, `i18n/access.ts` |
| Scheduled work | `/api/internal/tick` | `services/risk.ts` and the services it calls |

## Contracts between modules

- **Referral states.** CREATED -> BOOKED (student books), DECLINED (student or counsellor),
  CLOSED (counsellor). BOOKED -> ATTENDED or NOT_ATTENDED (clinician records the consultation),
  CREATED (appointment cancelled, so the student can rebook). NOT_ATTENDED -> BOOKED, CLOSED or
  DECLINED. ATTENDED -> CLOSED. DECLINED -> CREATED (counsellor offers again). CLOSED is final.
  Booking marks the case milestone ARRANGED; a completed or missed consultation marks
  APPOINTMENT_UPDATED; scheduling a follow-up marks FOLLOW_UP_SCHEDULED.
- **Scheduled tick** (`/api/internal/tick`, protected by `CRON_SECRET`) calls, per institution:
  `escalateOverdueUrgentAlerts(institutionId, at)` (services/risk.ts),
  `notifyDueFollowUps(institutionId, at)` (services/followups.ts) and
  `sendAppointmentReminders(institutionId, at)` (services/scheduling.ts).
  Both return the number of notifications sent.
- **Staff onboarding.** Admins create staff users without a password plus an `AccessToken`
  (purpose `SET_PASSWORD`, `tokenHash = sha256(token)`, 72 hours). The link is
  `/set-password?token=<token>`. The access service (`services/access.ts`) consumes it. Staff then enrol a TOTP second factor
  at `/account/security` before any other page opens.

## Not in Phase 1

Journaling, peer support, AI summaries, SSO and ERP/LMS integration, SMS/email/push delivery (only
in-app notifications are stored), email ownership verification at registration, validated Hindi
versions of PHQ-9 and GAD-7, and a hosted video provider account. See README for the pilot gaps.
