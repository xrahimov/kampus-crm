import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { listGroupHistory } from "@/server/services/groups/groups.service";

export const GET = route<undefined, { id: string }>(
  { permission: "groups.view" },
  async ({ current, params, request }) => {
    const query = parseListQuery(request.nextUrl.searchParams, {
      sortable: ["createdAt"],
      defaultSort: { field: "createdAt", direction: "desc" },
    });
    return json(await listGroupHistory(current.actor, params.id, query));
  },
);
