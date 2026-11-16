"use client";

import { ActionForm } from "@/components/telehealth/action-form";
import { getAt, RULE_GROUPS, type RuleField } from "@/components/telehealth/rules-fields";
import { Field, Input, Select, StatusPill } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";

function fieldId(path: string): string {
  return `rule-${path.replace(/\./g, "-")}`;
}

function RuleInput({ field, rules }: { field: RuleField; rules: unknown }) {
  const id = fieldId(field.path);
  const current = getAt(rules, field.path);
  if (field.kind === "boolean") {
    return (
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" id={id} name={field.path} defaultChecked={current === true} className="size-4 accent-accent" />
        {field.label}
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <Field id={id} label={field.label} hint={field.help}>
        <Select id={id} name={field.path} defaultValue={typeof current === "string" ? current : field.options[0]?.value}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  return (
    <Field id={id} label={field.label} hint={field.help}>
      <Input
        id={id}
        name={field.path}
        type="number"
        inputMode="decimal"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        defaultValue={typeof current === "number" ? current : undefined}
        required
      />
    </Field>
  );
}

/** Triage rule editor. Every rule group shows a plain explanation above its values. */
export function RulesForm({
  rules,
  version,
  action,
}: {
  rules: unknown;
  version: number;
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  return (
    <ActionForm action={action} className="grid gap-8" successText="Rules saved.">
      <input type="hidden" name="expectedVersion" value={version} />
      {RULE_GROUPS.map((group) => (
        <fieldset key={group.id} className="grid gap-4 border-t border-line pt-6">
          <legend className="flex flex-wrap items-center gap-3 pr-3 text-base font-semibold">
            {group.title}
            {group.alwaysOn ? <StatusPill tone="accent">Always on</StatusPill> : null}
          </legend>
          <p className="max-w-[70ch] text-sm text-ink-2">{group.description}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.fields.map((field) => (
              <RuleInput key={field.path} field={field} rules={rules} />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="border-t border-line pt-6">
        <SubmitButton pendingLabel="Saving">Save rules</SubmitButton>
      </div>
    </ActionForm>
  );
}
