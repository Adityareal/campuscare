import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyForm } from "@/components/auth/verify-form";
import { linkClass } from "@/components/ui";
import { getCurrentActor, getPendingMfaUser, homeFor } from "@/lib/auth/session";
import { accessText, localeFromParam } from "@/lib/i18n/access";

export const metadata: Metadata = { title: "Second step", robots: { index: false, follow: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const actor = await getCurrentActor();
  if (actor) redirect(homeFor(actor.role));
  if (!(await getPendingMfaUser())) redirect("/sign-in");

  const { lang } = await searchParams;
  const locale = localeFromParam(lang);
  const t = accessText(locale);

  return (
    <AuthShell locale={locale} switchHref={locale === "hi" ? "/sign-in/verify" : "/sign-in/verify?lang=hi"}>
      <h1 className="text-2xl font-semibold tracking-tight">{t.verify.title}</h1>
      <p className="mt-1.5 text-ink-2">{t.verify.intro}</p>
      <div className="mt-6">
        <VerifyForm copy={t.verify} lang={locale} />
      </div>
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className={linkClass}>
          {t.verify.startOver}
        </Link>
      </p>
    </AuthShell>
  );
}
