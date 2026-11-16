export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONSENT_REQUIRED"
  | "INVALID_TRANSITION"
  | "HUMAN_REVIEW_REQUIRED"
  | "SLOT_UNAVAILABLE"
  | "LOCKED";

/** An expected, user-explainable refusal from a service. Anything else is a bug. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

export function fail(code: DomainErrorCode, message: string): never {
  throw new DomainError(code, message);
}
