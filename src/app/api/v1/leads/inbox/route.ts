import { inboxFilterSchema } from "@/lib/validation/leads";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { listConversations } from "@/server/services/leads/inbox.service";

/** Leads → Inbox (A-146): `?status=open|closed|all&q=`. */
export const GET = route({ permission: "leads.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const filters = inboxFilterSchema.safeParse({
    status: params.get("status") ?? undefined,
    q: params.get("q") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listConversations(current.actor, filters.data));
});
