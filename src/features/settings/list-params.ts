import type { ParsedList } from "@/server/http/list-query";
import { parseListQuery } from "@/server/http/list-query";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Server-component twin of the API's list parsing, from Next's `searchParams`. */
export function listFromSearchParams<F extends string>(
  searchParams: SearchParams,
  options: { sortable: readonly F[]; defaultSort: ParsedList<F>["sort"] },
): ParsedList<F> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined) params.set(key, v);
  }
  return parseListQuery(params, options);
}
