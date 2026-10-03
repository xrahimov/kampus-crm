import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { listStudentHistory } from "@/server/services/students/students.service";

export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params, request }) => {
    const query = parseListQuery(request.nextUrl.searchParams, {
      sortable: ["createdAt"] as const,
      defaultSort: { field: "createdAt", direction: "desc" },
    });
    return json(await listStudentHistory(current.actor, params.id, query));
  },
);
