"use client";

import { useActionState, useId, useState, type ComponentProps, type ReactNode } from "react";
import { OneTimeLink } from "@/components/admin/one-time-link";
import type { LinkActionState } from "@/components/admin/state";
import { ActionMessage } from "@/components/ui/action-message";
import { cx, inputClass } from "@/components/ui/classes";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";

export type FormAction = (prev: LinkActionState, form: FormData) => Promise<LinkActionState>;

// ---------- Small building blocks ----------

function Labelled({ id, label, hint, children, optional }: { id: string; label: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional ? <span className="ml-2 font-normal text-ink-3">Optional</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function TextInput({
  id,
  name,
  label,
  hint,
  optional,
  ...rest
}: { id: string; name: string; label: string; hint?: string; optional?: boolean } & Omit<ComponentProps<"input">, "id" | "name">) {
  return (
    <Labelled id={id} label={label} hint={hint} optional={optional}>
      <input id={id} name={name} className={inputClass} aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
    </Labelled>
  );
}

function Result({ state }: { state: LinkActionState }) {
  return (
    <div className="grid gap-3" aria-live="polite">
      <ActionMessage state={state} />
      {state.status === "ok" && state.link ? <OneTimeLink link={state.link} linkFor={state.linkFor} expiresAt={state.expiresAt} /> : null}
    </div>
  );
}

// ---------- Generic one-button action ----------

/** A single button that runs an action for one record, e.g. suspend or revoke. */
export function RowActionForm({
  action,
  fields,
  label,
  pendingLabel,
  variant = "secondary",
  confirmText,
}: {
  action: FormAction;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Asked with the browser's confirm dialog before submitting. */
  confirmText?: string;
}) {
  const [state, formAction] = useActionState<LinkActionState, FormData>(action, IDLE);
  return (
    <div className="grid gap-2">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirmText && !window.confirm(confirmText)) e.preventDefault();
        }}
      >
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <SubmitButton variant={variant} size="sm" pendingLabel={pendingLabel}>
          {label}
        </SubmitButton>
      </form>
      <Result state={state} />
    </div>
  );
}

// ---------- People ----------

const STAFF_ROLE_OPTIONS = [
  { value: "COUNSELLOR", label: "Counsellor" },
  { value: "CLINICIAN", label: "Clinician" },
  { value: "INSTITUTION_ADMIN", label: "Institution administrator" },
  { value: "SUPPORT_STAFF", label: "Support staff" },
] as const;

const PROFESSION_OPTIONS = [
  { value: "COUNSELLOR", label: "Counsellor" },
  { value: "COUNSELLING_PSYCHOLOGIST", label: "Counselling psychologist" },
  { value: "CLINICAL_PSYCHOLOGIST", label: "Clinical psychologist" },
  { value: "PSYCHIATRIST", label: "Psychiatrist" },
] as const;

export function InviteStaffForm({ action }: { action: FormAction }) {
  const id = useId();
  const [state, formAction] = useActionState<LinkActionState, FormData>(action, IDLE);
  const [role, setRole] = useState<string>("COUNSELLOR");
  const [withProfile, setWithProfile] = useState(true);
  const canHaveProfile = role === "COUNSELLOR" || role === "CLINICIAN";

  return (
    <div className="grid gap-5">
      <form action={formAction} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput id={`${id}-name`} name="name" label="Full name" required autoComplete="off" />
          <TextInput id={`${id}-email`} name="email" type="email" label="Work email" required autoComplete="off" />
        </div>
        <Labelled id={`${id}-role`} label="Role">
          <select id={`${id}-role`} name="role" className={cx(inputClass, "pr-8")} value={role} onChange={(e) => setRole(e.target.value)}>
            {STAFF_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Labelled>

        {canHaveProfile ? (
          <div className="grid gap-4 border-t border-line pt-4">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="withProfile"
                checked={withProfile}
                onChange={(e) => setWithProfile(e.target.checked)}
                className="size-5 accent-[var(--accent)]"
              />
              Add a professional profile (needed before students can book this person)
            </label>
            {withProfile ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Labelled id={`${id}-profession`} label="Profession">
                  <select id={`${id}-profession`} name="profession" className={cx(inputClass, "pr-8")} defaultValue={role === "CLINICIAN" ? "CLINICAL_PSYCHOLOGIST" : "COUNSELLOR"}>
                    {PROFESSION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Labelled>
                <TextInput id={`${id}-qual`} name="qualifications" label="Qualifications" required hint="For example M.Phil. Clinical Psychology." />
                <TextInput id={`${id}-body`} name="registrationBody" label="Registration body" optional hint="For example RCI or NMC." />
                <TextInput id={`${id}-num`} name="registrationNumber" label="Registration number" optional />
                <TextInput id={`${id}-lang`} name="languages" label="Languages" hint="Separate with commas, for example English, Hindi." defaultValue="English, Hindi" />
                <TextInput id={`${id}-spec`} name="specialisations" label="Areas of focus" optional hint="Separate with commas." />
                <TextInput id={`${id}-fee`} name="feeInr" type="number" inputMode="numeric" min={0} step={1} label="Fee per session (INR)" defaultValue="0" hint="Use 0 when sessions are free for students." />
                <div className="md:col-span-2">
                  <Labelled id={`${id}-bio`} label="Short introduction for students" optional>
                    <textarea id={`${id}-bio`} name="bio" maxLength={1000} className={cx(inputClass, "min-h-28 resize-y")} />
                  </Labelled>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <SubmitButton pendingLabel="Creating account">Create account and link</SubmitButton>
        </div>
      </form>
      <Result state={state} />
    </div>
  );
}

export function StudentInviteForm({ action }: { action: FormAction }) {
  const id = useId();
  const [state, formAction] = useActionState<LinkActionState, FormData>(action, IDLE);
  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <TextInput id={`${id}-uses`} name="maxUses" type="number" inputMode="numeric" min={1} max={5000} step={1} label="Number of students" defaultValue="200" required />
        <TextInput id={`${id}-days`} name="expiresInDays" type="number" inputMode="numeric" min={1} max={365} step={1} label="Valid for (days)" defaultValue="30" required />
        <SubmitButton pendingLabel="Creating code">Create code</SubmitButton>
      </form>
      <Result state={state} />
    </div>
  );
}

export function VerifyProfessionalForm({
  action,
  userId,
  registrationBody,
  registrationNumber,
}: {
  action: FormAction;
  userId: string;
  registrationBody: string;
  registrationNumber: string;
}) {
  const id = useId();
  const [state, formAction] = useActionState<LinkActionState, FormData>(action, IDLE);
  return (
    <div className="grid gap-3">
      <form action={formAction} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <input type="hidden" name="userId" value={userId} />
        <TextInput id={`${id}-body`} name="registrationBody" label="Registration body" defaultValue={registrationBody} required />
        <TextInput id={`${id}-num`} name="registrationNumber" label="Registration number" defaultValue={registrationNumber} required />
        <SubmitButton pendingLabel="Saving">Mark as verified</SubmitButton>
      </form>
      <p className="text-sm text-ink-3">Check the registration with the issuing body before marking it as verified.</p>
      <Result state={state} />
    </div>
  );
}

// ---------- Departments ----------

export function CreateDepartmentForm({ action }: { action: FormAction }) {
  const id = useId();
  const [state, formAction] = useActionState<LinkActionState, FormData>(action, IDLE);
  return (
    <div className="grid gap-3">
      <form action={formAction} className="grid gap-4 md:grid-cols-[10rem_1fr_auto] md:items-end">
        <TextInput id={`${id}-code`} name="code" label="Code" required maxLength={12} hint="For example CSE." />
        <TextInput id={`${id}-name`} name="name" label="Department name" required maxLength={120} hint="As students know it." />
        <SubmitButton pendingLabel="Adding">Add department</SubmitButton>
      </form>
      <Result state={state} />
    </div>
  );
}

export function RenameDepartmentForm({ action, departmentId, name, code }: { action: FormAction; departmentId: string; name: string; code: string }) {
  const id = useId();
  const [state, formAction] = useActionState<LinkActionState, FormData>(action, IDLE);
  return (
    <div className="grid gap-2">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="departmentId" value={departmentId} />
        <div className="grid flex-1 gap-2">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            Name of {code}
          </label>
          <input id={`${id}-name`} name="name" defaultValue={name} required maxLength={120} className={inputClass} />
        </div>
        <SubmitButton variant="secondary" pendingLabel="Saving">
          Rename
        </SubmitButton>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

// ---------- Institution settings ----------

type Contact = { key: number; label: string; phone: string; hours: string };

export type SettingsFormValues = {
  checkInCadence: "DAILY" | "WEEKLY";
  careTeamHours: string;
  campusContacts: { label: string; phone: string; hours: string }[];
  onCallResponderId: string | null;
  urgentAckMinutes: number;
  priorityAckHours: number;
  monitorAckHours: number;
  minCohortSize: number;
  retentionMonths: number;
};

export function SettingsForm({
  action,
  initial,
  responders,
}: {
  action: FormAction;
  initial: SettingsFormValues;
  responders: { id: string; name: string; roleLabel: string }[];
}) {
  const id = useId();
  const [state, formAction] = useActionState<LinkActionState, FormData>(action, IDLE);
  const [contacts, setContacts] = useState<Contact[]>(() => initial.campusContacts.map((c, i) => ({ key: i, ...c })));
  const [nextKey, setNextKey] = useState(initial.campusContacts.length);

  function update(key: number, field: "label" | "phone" | "hours", value: string) {
    setContacts((list) => list.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  }
  function add() {
    setContacts((list) => [...list, { key: nextKey, label: "", phone: "", hours: "" }]);
    setNextKey((k) => k + 1);
  }
  function remove(key: number) {
    setContacts((list) => list.filter((c) => c.key !== key));
  }

  return (
    <form action={formAction} className="grid gap-8">
      <section className="grid gap-4" aria-labelledby={`${id}-care`}>
        <h3 id={`${id}-care`} className="text-base font-semibold">
          Check-ins and care team
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Labelled id={`${id}-cadence`} label="Check-in reminder cadence" hint="How often students are invited to check in.">
            <select id={`${id}-cadence`} name="checkInCadence" defaultValue={initial.checkInCadence} className={cx(inputClass, "pr-8")}>
              <option value="WEEKLY">Weekly</option>
              <option value="DAILY">Daily</option>
            </select>
          </Labelled>
          <TextInput
            id={`${id}-hours`}
            name="careTeamHours"
            label="Care team hours"
            defaultValue={initial.careTeamHours}
            required
            maxLength={160}
            hint="Shown to students on the help page. Only list hours when someone is actually available."
          />
          <Labelled
            id={`${id}-oncall`}
            label="On-call responder for urgent alerts"
            optional
            hint="Notified when an urgent alert is not acknowledged in time. Must be an active counsellor or clinician."
          >
            <select id={`${id}-oncall`} name="onCallResponderId" defaultValue={initial.onCallResponderId ?? ""} className={cx(inputClass, "pr-8")}>
              <option value="">No on-call responder</option>
              {responders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.roleLabel})
                </option>
              ))}
            </select>
          </Labelled>
        </div>
      </section>

      <fieldset className="grid gap-4 border-t border-line pt-6">
        <legend className="text-base font-semibold">Campus crisis contacts</legend>
        <p className="-mt-1 max-w-[70ch] text-sm text-ink-3">
          Shown on the help page together with the national helplines 112 and Tele-MANAS 14416. Add only numbers that are
          answered during the hours you give.
        </p>
        {contacts.length === 0 ? <p className="text-sm text-ink-2">No campus contacts yet.</p> : null}
        <ol className="grid gap-4">
          {contacts.map((c, i) => (
            <li key={c.key} className="grid gap-3 border-b border-line pb-4 md:grid-cols-[1fr_12rem_1fr_auto] md:items-end">
              <TextInput
                id={`${id}-cl-${c.key}`}
                name="contactLabel"
                label={`Contact ${i + 1}: name`}
                value={c.label}
                onChange={(e) => update(c.key, "label", e.target.value)}
                required
                maxLength={80}
              />
              <TextInput
                id={`${id}-cp-${c.key}`}
                name="contactPhone"
                type="tel"
                label="Phone"
                value={c.phone}
                onChange={(e) => update(c.key, "phone", e.target.value)}
                required
                maxLength={20}
              />
              <TextInput
                id={`${id}-ch-${c.key}`}
                name="contactHours"
                label="Hours"
                value={c.hours}
                onChange={(e) => update(c.key, "hours", e.target.value)}
                required
                maxLength={80}
              />
              <button
                type="button"
                onClick={() => remove(c.key)}
                className="inline-flex h-11 items-center justify-center rounded-control px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                Remove contact {i + 1}
              </button>
            </li>
          ))}
        </ol>
        <div>
          <button
            type="button"
            onClick={add}
            disabled={contacts.length >= 10}
            className="inline-flex h-11 items-center justify-center rounded-control border border-line-input bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
          >
            Add a contact
          </button>
        </div>
      </fieldset>

      <section className="grid gap-4 border-t border-line pt-6" aria-labelledby={`${id}-ack`}>
        <h3 id={`${id}-ack`} className="text-base font-semibold">
          Acknowledgement windows
        </h3>
        <p className="-mt-2 max-w-[70ch] text-sm text-ink-3">
          How long the care team has to acknowledge a new alert before it is escalated. Agree these with your care team.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <TextInput id={`${id}-urgent`} name="urgentAckMinutes" type="number" inputMode="numeric" min={5} max={120} step={1} label="Urgent (minutes)" defaultValue={String(initial.urgentAckMinutes)} required hint="5 to 120 minutes." />
          <TextInput id={`${id}-priority`} name="priorityAckHours" type="number" inputMode="numeric" min={1} max={72} step={1} label="Priority (hours)" defaultValue={String(initial.priorityAckHours)} required hint="1 to 72 hours." />
          <TextInput id={`${id}-monitor`} name="monitorAckHours" type="number" inputMode="numeric" min={12} max={336} step={1} label="Monitor (hours)" defaultValue={String(initial.monitorAckHours)} required hint="12 to 336 hours." />
        </div>
      </section>

      <section className="grid gap-4 border-t border-line pt-6" aria-labelledby={`${id}-privacy`}>
        <h3 id={`${id}-privacy`} className="text-base font-semibold">
          Privacy
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            id={`${id}-k`}
            name="minCohortSize"
            type="number"
            inputMode="numeric"
            min={5}
            step={1}
            label="Minimum group size in reports"
            defaultValue={String(initial.minCohortSize)}
            required
            hint="Figures about fewer students than this are hidden. It can never be below 5."
          />
          <TextInput
            id={`${id}-retention`}
            name="retentionMonths"
            type="number"
            inputMode="numeric"
            min={6}
            max={120}
            step={1}
            label="Record retention (months)"
            defaultValue={String(initial.retentionMonths)}
            required
            hint="6 to 120 months."
          />
        </div>
      </section>

      <div className="grid gap-3">
        <div>
          <SubmitButton pendingLabel="Saving settings">Save settings</SubmitButton>
        </div>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

// ---------- Platform ----------

export function CreateInstitutionForm({ action }: { action: FormAction }) {
  const id = useId();
  const [state, formAction] = useActionState<LinkActionState, FormData>(action, IDLE);
  return (
    <div className="grid gap-5">
      <form action={formAction} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput id={`${id}-name`} name="name" label="Institution name" required maxLength={160} />
          <TextInput id={`${id}-slug`} name="slug" label="Short name" required maxLength={40} hint="Lower-case letters, digits and hyphens, for example iit-indore." />
          <TextInput id={`${id}-city`} name="city" label="City" required maxLength={80} />
          <TextInput id={`${id}-domain`} name="emailDomain" label="Email domain" required maxLength={120} hint="Without @, for example university.ac.in." />
        </div>
        <fieldset className="grid gap-4 border-t border-line pt-4">
          <legend className="text-sm font-semibold">First administrator</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput id={`${id}-admin`} name="adminName" label="Full name" required autoComplete="off" />
            <TextInput id={`${id}-adminEmail`} name="adminEmail" type="email" label="Work email" required autoComplete="off" />
          </div>
        </fieldset>
        <div>
          <SubmitButton pendingLabel="Creating institution">Create institution</SubmitButton>
        </div>
      </form>
      <Result state={state} />
    </div>
  );
}
