import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarCheckIcon,
  ChatCircleTextIcon,
  HouseIcon,
  LifebuoyIcon,
  NotePencilIcon,
  ShieldCheckIcon,
  SignOutIcon,
  TranslateIcon,
} from "@phosphor-icons/react/dist/ssr";
import { setLocaleAction, signOutAction } from "@/app/_actions/shell";
import { buttonClass } from "@/components/ui/classes";
import { NavLink } from "@/components/ui/nav-link";
import type { UserActor } from "@/lib/actor";
import { getDictionary } from "@/lib/i18n";

/*
 * Mobile-first student frame. "Get help now" is visible on every student page.
 * Z-index scale (whole app): 20 sticky chrome, 30 menus and dialogs, 40 toasts.
 */

export const HELP_NOW_CLASS =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-control bg-urgent-soft px-3 text-sm font-semibold text-urgent-text hover:opacity-90";

export function StudentShell({ actor, children }: { actor: UserActor; children: ReactNode }) {
  const t = getDictionary(actor.locale);
  const other = actor.locale === "en" ? "hi" : "en";
  const nav = [
    { href: "/student", label: t.nav.home, Icon: HouseIcon, exact: true },
    { href: "/student/check-in", label: t.nav.checkIn, Icon: NotePencilIcon, exact: false },
    { href: "/student/care", label: t.nav.care, Icon: CalendarCheckIcon, exact: false },
    { href: "/student/messages", label: t.nav.messages, Icon: ChatCircleTextIcon, exact: false },
    { href: "/student/privacy", label: t.nav.privacy, Icon: ShieldCheckIcon, exact: false },
  ];

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-40 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link href="/student" className="text-[1.05rem] font-semibold tracking-tight">
            CampusCare
          </Link>
          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                exact={item.exact}
                className="rounded-control px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
                activeClassName="bg-surface-2 font-medium text-ink"
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <form action={setLocaleAction}>
              <input type="hidden" name="locale" value={other} />
              <button type="submit" className={buttonClass("ghost", "sm")} lang={other}>
                <TranslateIcon size={18} aria-hidden />
                {t.meta.switchTo}
              </button>
            </form>
            <Link href="/help-now" className={HELP_NOW_CLASS}>
              <LifebuoyIcon size={18} weight="bold" aria-hidden />
              {t.common.getHelpNow}
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={buttonClass("ghost", "sm")} aria-label={t.common.signOut}>
                <SignOutIcon size={18} aria-hidden />
                <span className="hidden lg:inline">{t.common.signOut}</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        {children}
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {nav.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                exact={item.exact}
                className="flex flex-col items-center gap-0.5 px-1 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 text-[0.7rem] text-ink-3"
                activeClassName="font-semibold text-accent-text"
              >
                <item.Icon size={22} aria-hidden />
                <span className="max-w-full text-center leading-tight [overflow-wrap:anywhere]">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
