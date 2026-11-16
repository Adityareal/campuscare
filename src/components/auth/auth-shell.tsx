import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { accessText } from "@/lib/i18n/access";

/**
 * Frame for the public access pages: a small header, one narrow column, and the crisis line at
 * the foot so it is reachable from every step of signing in or registering.
 * `switchHref` is the same page in the other language (omit it for English-only pages).
 */
export function AuthShell({
  locale = "en",
  switchHref,
  children,
}: {
  locale?: "en" | "hi";
  switchHref?: string;
  children: ReactNode;
}) {
  const t = accessText(locale);
  return (
    <div lang={locale === "hi" ? "hi-IN" : "en-IN"} className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 md:px-8">
        <Link href="/" className="text-[1.05rem] font-semibold tracking-tight">
          CampusCare
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {switchHref ? (
            <Link
              href={switchHref}
              lang={locale === "hi" ? "en" : "hi"}
              className="font-medium text-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              {t.lang.switchTo}
            </Link>
          ) : null}
          <Link href="/help-now" className="inline-flex items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
            <PhoneIcon size={16} aria-hidden />
            {t.helpNow}
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 py-8 md:py-12">
        {children}
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-5xl px-4 py-4 text-sm text-ink-3 md:px-8">{t.crisis}</p>
      </footer>
    </div>
  );
}
