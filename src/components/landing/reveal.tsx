"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/classes";
import { usePrefersReducedMotion } from "@/components/landing/use-reduced-motion";

type State = "visible" | "hidden" | "shown";

/**
 * Fades a section in once, the first time it scrolls into view. Content is visible by default, so
 * it stays readable without JavaScript. Sections already on screen, and visitors who prefer
 * reduced motion, are never hidden.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<State>("visible");

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setState("hidden");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.04 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  const motion = reduced
    ? undefined
    : state === "hidden"
      ? "translate-y-4 opacity-0"
      : state === "shown"
        ? "translate-y-0 opacity-100 transition-[opacity,transform] duration-700 ease-out"
        : undefined;

  return (
    <div ref={ref} className={cx(motion, className)} onTransitionEnd={() => setState((s) => (s === "shown" ? "visible" : s))}>
      {children}
    </div>
  );
}
