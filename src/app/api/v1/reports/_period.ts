import type { NextRequest } from "next/server";
import type { z } from "zod";

import { parseQuery } from "../finance/_query";

export const PERIOD_KEYS = ["branchId", "year", "month"];

/** `?branchId&year&month` plus the report's own keys. */
export function parseReport<S extends z.ZodTypeAny>(
  request: NextRequest,
  extra: string[],
  schema: S,
): z.output<S> {
  return parseQuery(request, [...PERIOD_KEYS, ...extra], schema);
}
