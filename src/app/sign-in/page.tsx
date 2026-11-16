import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { DemoPanel } from "@/components/auth/demo-panel";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Notice, linkClass } from "@/components/ui";
import { demoModeEnabled, getCurrentActor, homeFor } from "@/lib/auth/session";
import { DEMO_PERSONAS } from "@/lib/demo";
import { accessText, localeFromParam } from "@/lib/i18n/access";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ lang?: string; notice?: string }> }) {
  const actor = await getCurrentActor();
  if (actor) redirect(homeFor(actor.role));

  const { lang, notice } = await searchParams;
  const locale = localeFromParam(lang);
  const t = accessText(locale);
  const demo = demoModeEnabled();

  return (
    <AuthShell locale={locale} switchHref={locale === "hi" ? "/sign-in" : "/sign-in?lang=hi"}>
      <h1 className="text-2xl font-semibold tracking-tight">{t.signIn.title}</h1>
      <p className="mt-1.5 text-ink-2">{t.signIn.intro}</p>

      {notice === "password-set" ? (
        <Notice tone="success" role="status" className="mt-5" title="Your password is set">
          Sign in with your new password to continue.
        </Notice>
      ) : null}

      <div className="mt-6">
        <SignInForm copy={t.signIn} lang={locale} />
      </div>

      <div className="mt-6 grid gap-2 text-sm">
        <Link href={locale === "hi" ? "/register?lang=hi" : "/register"} className={linkClass}>
          {t.signIn.registerLink}
        </Link>
        <Link href="/help-now" className={linkClass}>
          {t.helpNow}
        </Link>
      </div>

      {demo ? <DemoPanel personas={DEMO_PERSONAS.map((p) => ({ key: p.key, label: p.label, name: p.name }))} /> : null}
    </AuthShell>
  );
}
