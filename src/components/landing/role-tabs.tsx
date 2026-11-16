"use client";

import { useId, useRef, useState } from "react";
import { BuildingsIcon, StethoscopeIcon, StudentIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/classes";
import { AdminPreview, ClinicianPreview, CounsellorPreview, StudentPreview } from "@/components/landing/role-previews";
import { nextTabIndex } from "@/components/landing/use-reduced-motion";

const ROLES = [
  {
    title: "Student",
    Icon: StudentIcon,
    lead: "Support on their own terms.",
    points: ["Check in when it suits them and skip any question", "Choose whether the care team sees their trends", "Book a verified professional", "Use the app in English or Hindi"],
    Preview: StudentPreview,
  },
  {
    title: "Counsellor",
    Icon: UsersThreeIcon,
    lead: "Review with the evidence beside them.",
    points: ["Work through alerts", "Open and manage cases", "Message students", "Schedule follow-ups"],
    Preview: CounsellorPreview,
  },
  {
    title: "Clinician",
    Icon: StethoscopeIcon,
    lead: "Sessions and clinical judgement.",
    points: ["Hold video or in-person sessions", "Keep private clinical notes", "Tune the written triage rules"],
    Preview: ClinicianPreview,
  },
  {
    title: "Administrator",
    Icon: BuildingsIcon,
    lead: "Understand the campus without seeing anyone.",
    points: ["Anonymous totals by department", "Staff accounts and settings", "A tamper-evident audit log", "No access to individual student records"],
    Preview: AdminPreview,
  },
] as const;

export function RoleTabs() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = nextTabIndex(event.key, index, ROLES.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  const role = ROLES[active] ?? ROLES[0];

  return (
    <div className="mt-10">
      <div role="tablist" aria-label="Roles" className="flex gap-1 overflow-x-auto border-b border-line">
        {ROLES.map((r, i) => {
          const selected = i === active;
          return (
            <button
              key={r.title}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${i}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                "-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm transition-[color,border-color] duration-150",
                selected ? "border-accent font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              <r.Icon size={20} className={selected ? "text-accent-text" : undefined} aria-hidden />
              {r.title}
            </button>
          );
        })}
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${active}`} tabIndex={0} className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-12">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">{role.title}</h3>
          <p className="mt-2 font-medium text-ink">{role.lead}</p>
          <ul className="mt-4 grid gap-1.5 text-sm text-ink-2">
            {role.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <div key={active} className="transition-[opacity,transform] duration-300 ease-out starting:translate-y-2 starting:opacity-0">
          <role.Preview />
        </div>
      </div>
    </div>
  );
}
