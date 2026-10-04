import type { NextRequest } from "next/server";
import type { z } from "zod";

import { AppError } from "@/server/errors/app-error";
import { fieldErrors } from "@/server/http/list-query";

/** Parses the listed query-string keys with a Zod schema; a missing key is undefined. */
export function parseQuery<S extends z.ZodTypeAny>(
  request: NextRequest,
  keys: string[],
  schema: S,
): z.output<S> {
  const raw: Record<string, string | undefined> = {};
  for (const key of keys) raw[key] = request.nextUrl.searchParams.get(key) ?? undefined;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
  return parsed.data;
}
