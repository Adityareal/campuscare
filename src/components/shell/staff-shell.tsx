import Link from "next/link";
import type { ReactNode } from "react";
import {
  BellIcon,
  BuildingOfficeIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  ChartLineUpIcon,
  ClockCountdownIcon,
  ClockIcon,
  FileTextIcon,
  FolderOpenIcon,
  GearSixIcon,
  HandHeartIcon,
  ListIcon,
  ScrollIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Role } from "@prisma/client";
import { signOutAction } from "@/app/_actions/shell";
import { Notice } from "@/components/ui";
import { buttonClass, cx } from "@/components/ui/classes";
import { NavLink } from "@/components/ui/nav-link";
import type { UserActor } from "@/lib/actor";
import { db } from "@/lib/db";

type IconComponent = typeof BellIcon;
type NavItem = { href: string; label: string; Icon: IconComponent; exact?: boolean };
type NavSection = { title: string; items: NavItem[] };

const CARE_WORKSPACE: NavSection = {
  title: "Care workspace",
  items: [
    { href: "/counsellor", label: "Overview", Icon: SquaresFourIcon, exact: true },
    { href: "/counsellor/alerts", label: "Alerts", Icon: WarningCircleIcon },
    { href: "/counsellor/cases", label: "Cases", Icon: FolderOpenIcon },
    { href: "/counsellor/follow-ups", label: "Follow-ups", Icon: ClockCountdownIcon },
  ],
};

/** Route map for staff. Every href here is a page some slice of the app must implement. */
export function navFor(role: Role): NavSection[] {
  switch (role) {
    case "COUNSELLOR":
      return [CARE_WORKSPACE];
    case "CLINICIAN":
      return [
        {
          title: "Clinical",
          items: [
            { href: "/clinician", label: "Schedule", Icon: CalendarBlankIcon, exact: true },
            { href: "/clinician/availability", label: "Availability", Icon: ClockIcon },
            { href: "/clinician/rules", label: "Triage rules", Icon: SlidersHorizontalIcon },
          ],
        },
        CARE_WORKSPACE,
      ];
    case "INSTITUTION_ADMIN":
      return [
        {
          title: "Institution",
          items: [
            { href: "/admin", label: "Overview", Icon: ChartLineUpIcon, exact: true },
            { href: "/admin/departments", label: "Departments", Icon: BuildingsIcon },
            { href: "/admin/interventions", label: "Interventions", Icon: HandHeartIcon },
            { href: "/admin/reports", label: "Reports", Icon: FileTextIcon },
            { href: "/admin/users", label: "People", Icon: UsersThreeIcon },
            { href: "/admin/settings", label: "Settings", Icon: GearSixIcon },
            { href: "/admin/audit", label: "Audit log", Icon: ScrollIcon },
          ],
        },
      ];
    case "PLATFORM_ADMIN":
      return [{ title: "Platform", items: [{ href: "/platform", label: "Institutions", Icon: BuildingOfficeIcon, exact: true }] }];
    default:
      return [];
  }
}

const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  COUNSELLOR: "Counsellor",
  CLINICIAN: "Clinician",
  INSTITUTION_ADMIN: "Institution administrator",
  SUPPORT_STAFF: "Support staff",
  PLATFORM_ADMIN: "Platform administrator",
};

function NavSections({ sections }: { sections: NavSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className="grid gap-1">
          <p className="px-3 pb-1 text-xs font-medium text-ink-3">{section.title}</p>
          {section.items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              exact={item.exact}
              className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
              activeClassName="bg-accent-soft font-medium text-accent-text hover:bg-accent-soft hover:text-accent-text"
            >
              <item.Icon size={18} aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </>
  );
}

function AccountLinks({ unread }: { unread: number }) {
  return (
    <div className="grid gap-1">
      <NavLink
        href="/notifications"
        className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        activeClassName="bg-surface-2 font-medium text-ink"
      >
        <BellIcon size={18} aria-hidden />
        Notifications
        {unread > 0 ? (
          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 font-mono text-xs text-accent-ink tabular-nums">
            {unread > 99 ? "99+" : unread}
            <span className="sr-only"> unread</span>
          </span>
        ) : null}
      </NavLink>
      <NavLink
        href="/account"
        className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        activeClassName="bg-surface-2 font-medium text-ink"
      >
        <UserCircleIcon size={18} aria-hidden />
        Account
      </NavLink>
      <form action={signOutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <SignOutIcon size={18} aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}

export async function StaffShell({ actor, children }: { actor: UserActor; children: ReactNode }) {
  const [unread, institution] = await Promise.all([
    db.notification.count({ where: { userId: actor.userId, readAt: null } }),
    actor.institutionId ? db.institution.findUnique({ where: { id: actor.institutionId }, select: { name: true } }) : null,
  ]);
  const sections = navFor(actor.role);
  const home = sections[0]?.items[0]?.href ?? "/account";

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-40 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="px-3">
          <Link href={home} className="text-[1.05rem] font-semibold tracking-tight">
            CampusCare
          </Link>
          <p className="mt-0.5 truncate text-xs text-ink-3">{institution?.name ?? "Platform"}</p>
        </div>
        <nav aria-label="Workspace" className="grid gap-5">
          <NavSections sections={sections} />
        </nav>
        <div className="mt-auto grid gap-3 border-t border-line pt-4">
          <div className="px-3">
            <p className="truncate text-sm font-medium">{actor.name}</p>
            <p className="text-xs text-ink-3">{ROLE_LABEL[actor.role]}</p>
          </div>
          <AccountLinks unread={unread} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
          <details className="group relative">
            <summary className={cx(buttonClass("ghost", "sm"), "list-none [&::-webkit-details-marker]:hidden")}>
              <ListIcon size={20} aria-hidden />
              Menu
            </summary>
            <div className="absolute left-0 top-11 z-30 grid w-72 gap-5 rounded-panel border border-line bg-surface p-3 shadow-panel">
              <nav aria-label="Workspace" className="grid gap-5">
                <NavSections sections={sections} />
              </nav>
              <div className="border-t border-line pt-3">
                <AccountLinks unread={unread} />
              </div>
            </div>
          </details>
          <Link href={home} className="font-semibold tracking-tight">
            CampusCare
          </Link>
          <Link href="/notifications" className={cx(buttonClass("ghost", "sm"), "ml-auto")} aria-label={`Notifications, ${unread} unread`}>
            <BellIcon size={20} aria-hidden />
            {unread > 0 ? <span className="font-mono text-xs tabular-nums">{unread > 99 ? "99+" : unread}</span> : null}
          </Link>
        </header>

        {actor.mfa === "demo_exempt" ? (
          <div className="mx-auto max-w-6xl px-4 pt-4 md:px-8">
            <Notice tone="warning" title="Demo account">
              Two-step sign-in is skipped for demo accounts. Demo mode must be off before any real student data is used.
            </Notice>
          </div>
        ) : null}

        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
