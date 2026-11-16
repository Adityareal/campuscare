import { notFound } from "next/navigation";
import { isDomainError } from "@/lib/errors";

/** Runs a service call for a page and turns a NOT_FOUND refusal into the 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isDomainError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
