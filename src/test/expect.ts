import { expect } from "vitest";
import { isDomainError, type DomainError, type DomainErrorCode } from "@/lib/errors";

/** Awaits a promise that must reject with a DomainError of the given code, and returns it. */
export async function expectDomainError(promise: Promise<unknown>, code: DomainErrorCode): Promise<DomainError> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (caught === null) throw new Error(`Expected a DomainError with code ${code}, but the call succeeded.`);
  if (!isDomainError(caught)) throw caught;
  expect(caught.code).toBe(code);
  return caught;
}

/** Synchronous variant for pure functions. */
export function expectDomainErrorSync(fn: () => unknown, code: DomainErrorCode): DomainError {
  let caught: unknown = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  if (caught === null) throw new Error(`Expected a DomainError with code ${code}, but the call succeeded.`);
  if (!isDomainError(caught)) throw caught;
  expect(caught.code).toBe(code);
  return caught;
}
