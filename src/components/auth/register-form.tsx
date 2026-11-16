"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/register/actions";
import { Field, Input, Select } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import { fillText as fill, type AccessCopy } from "@/lib/i18n/access";

export type RegisterFormProps = {
  copy: AccessCopy["register"];
  lang: "en" | "hi";
  inviteCode: string;
  emailDomain: string;
  passwordMinLength: number;
  departments: { id: string; name: string }[];
};

export function RegisterForm({ copy, lang, inviteCode, emailDomain, passwordMinLength, departments }: RegisterFormProps) {
  const [state, formAction] = useActionState(registerAction, IDLE);
  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="inviteCode" value={inviteCode} />

      <Field id="name" label={copy.name}>
        <Input id="name" name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field id="email" label={copy.email} hint={fill(copy.emailHint, { domain: emailDomain })}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-describedby="email-hint"
        />
      </Field>
      <Field id="studentNumber" label={copy.studentNumber}>
        <Input id="studentNumber" name="studentNumber" autoComplete="off" required maxLength={40} />
      </Field>
      <Field id="departmentId" label={copy.department}>
        <Select id="departmentId" name="departmentId" required defaultValue="">
          <option value="" disabled>
            {copy.departmentChoose}
          </option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="academicYear" label={copy.year}>
        <Select id="academicYear" name="academicYear" required defaultValue="1">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {fill(copy.yearOption, { n })}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="locale" label={copy.language}>
        <Select id="locale" name="locale" required defaultValue={lang}>
          <option value="en" lang="en">
            English
          </option>
          <option value="hi" lang="hi">
            हिंदी
          </option>
        </Select>
      </Field>
      <Field id="phone" label={copy.phone} optionalLabel={copy.optional}>
        <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} />
      </Field>
      <Field id="password" label={copy.password} hint={fill(copy.passwordHint, { min: passwordMinLength })}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={passwordMinLength} required aria-describedby="password-hint" />
      </Field>
      <Field id="confirm" label={copy.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={passwordMinLength} required />
      </Field>

      <ActionMessage state={state} />
      <SubmitButton pendingLabel={copy.pending} className="w-full">
        {copy.submit}
      </SubmitButton>
    </form>
  );
}
