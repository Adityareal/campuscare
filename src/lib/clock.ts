/**
 * Services read the current time only through now(), and pass it explicitly when they create
 * rows, so the seed script can replay weeks of history through the real code paths and tests
 * can pin time. Production code never sets the clock.
 */
let frozen: Date | null = null;

export function now(): Date {
  return frozen ? new Date(frozen.getTime()) : new Date();
}

export function setClock(at: Date | null): void {
  if (process.env.NODE_ENV === "production" && process.env.CAMPUSCARE_SEEDING !== "1") {
    throw new Error("The clock can only be set by the seed script or by tests.");
  }
  frozen = at ? new Date(at.getTime()) : null;
}

export function advanceClock(ms: number): Date {
  setClock(new Date(now().getTime() + ms));
  return now();
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
