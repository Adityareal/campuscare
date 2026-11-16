import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { Button, Field, Input, Notice, linkClass } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { getCurrentActor, homeFor } from "@/lib/auth/session";
import { findUsableInvite } from "@/lib/auth/signin";
import { accessText, fillText, localeFromParam } from "@/lib/i18n/access";

export const metadata: Metadata = { title: "Create your account", robots: { index: false, follow: false } };

function registerHref(code: string, lang: "en" | "hi"): string {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (lang === "hi") params.set("lang", "hi");
  const query = params.toString();
  return query ? `/register?${query}` : "/register";
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ code?: string; lang?: string }> }) {
  const actor = await getCurrentActor();
  if (actor) redirect(homeFor(actor.role));

  const { code: rawCode, lang } = await searchParams;
  const locale = localeFromParam(lang);
  const t = accessText(locale);
  const code = (rawCode ?? "").trim();
  const invite = code ? await findUsableInvite(code) : null;
  const otherLocale = locale === "hi" ? "en" : "hi";

  return (
    <AuthShell locale={locale} switchHref={registerHref(code, otherLocale)}>
      {invite ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{t.register.title}</h1>
          <p className="mt-1.5 text-ink-2">{t.register.intro}</p>
          <p className="mt-3 text-sm font-medium text-accent-text">{fillText(t.register.joining, { institution: invite.institution.name })}</p>
          <div className="mt-6">
            <RegisterForm
              copy={t.register}
              lang={locale}
              inviteCode={code}
              emailDomain={invite.institution.emailDomain}
              passwordMinLength={PASSWORD_MIN_LENGTH}
              departments={invite.institution.departments.map((d) => ({ id: d.id, name: d.name }))}
            />
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{t.register.title}</h1>
          {code ? (
            <Notice tone="info" className="mt-5" title={t.register.invalidTitle}>
              {t.register.invalidBody}
            </Notice>
          ) : null}
          <form action="/register" method="get" className="mt-6 grid gap-5">
            {locale === "hi" ? <input type="hidden" name="lang" value="hi" /> : null}
            <Field id="code" label={t.register.haveCode}>
              <Input id="code" name="code" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
            </Field>
            <Button type="submit" className="w-full">
              {t.register.codeContinue}
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-sm">
        <Link href={locale === "hi" ? "/sign-in?lang=hi" : "/sign-in"} className={linkClass}>
          {t.register.haveAccount}
        </Link>
      </p>
    </AuthShell>
  );
}
