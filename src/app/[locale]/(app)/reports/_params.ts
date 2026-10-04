import type { SearchParams } from "@/features/settings/list-params";

export const str = (v: string | string[] | undefined) =>
  typeof v === "string" && v ? v : undefined;

/** Picks the listed keys out of Next's searchParams as plain strings for a Zod schema. */
export function pick(sp: SearchParams, keys: string[]): Record<string, string | undefined> {
  const raw: Record<string, string | undefined> = {};
  for (const key of keys) raw[key] = str(sp[key]);
  return raw;
}
