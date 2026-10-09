import { z } from "zod";

import { instalmentsSchema, monthSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import {
  clearInstalments,
  getInstalmentPlan,
  setInstalments,
} from "@/server/services/students/instalments.service";

import { parseQuery } from "../../../finance/_query";

const monthQuery = z.object({ month: monthSchema.optional() });

/** The split of one month's fee (A-123): the month's parts, or the plan to make them. */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params, request }) => {
    const { month } = parseQuery(request, ["month"], monthQuery);
    return json(await getInstalmentPlan(current.actor, params.id, month));
  },
);

export const PUT = route<typeof instalmentsSchema._output, { id: string }>(
  { permission: "payments.create", body: instalmentsSchema },
  async ({ current, body, params }) => json(await setInstalments(current.actor, params.id, body)),
);

export const DELETE = route<undefined, { id: string }>(
  { permission: "payments.create" },
  async ({ current, params, request }) => {
    const { month } = parseQuery(request, ["month"], z.object({ month: monthSchema }));
    return json(await clearInstalments(current.actor, params.id, month));
  },
);
