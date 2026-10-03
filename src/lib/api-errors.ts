import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ApiError } from "./api-client";

/**
 * Pushes a VALIDATION error's field messages into a react-hook-form instance
 * and returns the message for everything else (as an i18n key).
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (!(error instanceof ApiError)) return "errors.internal";
  if (error.fields) {
    let rootMessage: string | null = null;
    for (const [field, messages] of Object.entries(error.fields)) {
      const message = messages[0] ?? "validation.required";
      if (field === "_") rootMessage = message;
      else setError(field as Path<T>, { type: "server", message });
    }
    return rootMessage;
  }
  return error.message;
}
