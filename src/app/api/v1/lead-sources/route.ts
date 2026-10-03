import { leadSourceSchema, sourceStatsSchema } from "@/lib/validation/leads";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { createSource, listSources } from "@/server/services/leads/sources.service";

/** "Manbalar hisoboti" (EXP §3): `?from&to` narrows the lead counts. */
export const GET = route({ permission: "leads.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const filters = sourceStatsSchema.safeParse({
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listSources(current.actor, filters.data));
});

/** "YANGI MANBA". */
export const POST = route<typeof leadSourceSchema._output>(
  { permission: "leads.update", body: leadSourceSchema },
  async ({ current, body }) => json(await createSource(current.actor, body), { status: 201 }),
);
