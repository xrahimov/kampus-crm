import { ApiError } from "@/lib/api";
import type { Translate } from "@/lib/i18n";

/**
 * What the server said about one field of a form that was refused, in the
 * person's language; null when it said nothing about that field.
 */
export function fieldErrorOf(t: Translate, error: unknown): (key: string) => string | null {
  const fields = error instanceof ApiError ? error.fields : undefined;
  return (key) => {
    const first = fields?.[key]?.[0];
    return first && t.has(first) ? t(first) : null;
  };
}

/**
 * True when the server refused one field because its value is taken, such as
 * a student who is, or once was, in the group (A-248). A screen then says so
 * in its own words instead of "This value is already in use."
 */
export function isTaken(error: unknown, key: string): boolean {
  return error instanceof ApiError && (error.fields?.[key] ?? []).includes("validation.duplicate");
}

/** True when the server refused the form field by field (the fields show it themselves). */
export function hasFieldErrors(error: unknown): boolean {
  return error instanceof ApiError && error.fields !== undefined;
}

/** A phone number as the server wants it, or null when the field is empty. */
export function phoneOrNull(text: string): string | null {
  const bare = text.replace(/[\s()-]/g, "");
  return bare === "" || bare === "+998" ? null : bare;
}
