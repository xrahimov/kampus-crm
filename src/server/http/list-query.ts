import { listQuerySchema, type ListQuery, type SortDirection } from "@/lib/validation/common";
import { AppError } from "@/server/errors/app-error";

export interface ParsedList<SortField extends string> {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  q?: string;
  sort: { field: SortField; direction: SortDirection };
}

/**
 * Parses and validates the common list query. The caller names which fields
 * may be sorted so a client can never sort by an arbitrary column.
 */
export function parseListQuery<SortField extends string>(
  searchParams: URLSearchParams,
  options: {
    sortable: readonly SortField[];
    defaultSort: { field: SortField; direction: SortDirection };
  },
): ParsedList<SortField> {
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw AppError.validation(fieldErrors(parsed.error.issues));
  }
  const query: ListQuery = parsed.data;

  let sort = options.defaultSort;
  if (query.sort) {
    const [field, direction] = query.sort.split(":") as [string, SortDirection];
    if (!(options.sortable as readonly string[]).includes(field)) {
      throw AppError.validation({ sort: ["validation.sortField"] });
    }
    sort = { field: field as SortField, direction };
  }

  return {
    page: query.page,
    pageSize: query.pageSize,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    q: query.q || undefined,
    sort,
  };
}

export function fieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}
