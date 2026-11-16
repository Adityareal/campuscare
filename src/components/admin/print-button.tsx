"use client";

import { buttonClass } from "@/components/ui/classes";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "md", "print:hidden")}>
      {label}
    </button>
  );
}
