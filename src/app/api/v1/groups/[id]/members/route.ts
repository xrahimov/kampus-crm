import { addMemberSchema } from "@/lib/validation/groups";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import {
  addMember,
  listMembers,
  MEMBER_SORT_FIELDS,
  type MemberSortField,
} from "@/server/services/groups/memberships.service";

type Params = { id: string };

/** `?archived=true&q=&sort=field:dir` (EXP §5 student list in group). */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params, request }) => {
    const sp = request.nextUrl.searchParams;
    const sortRaw = sp.get("sort");
    let sort: { field: MemberSortField; direction: "asc" | "desc" } | undefined;
    if (sortRaw) {
      const [field, direction] = sortRaw.split(":");
      if (
        !(MEMBER_SORT_FIELDS as readonly string[]).includes(field ?? "") ||
        !["asc", "desc"].includes(direction ?? "")
      ) {
        throw AppError.validation({ sort: ["validation.sortField"] });
      }
      sort = { field: field as MemberSortField, direction: direction as "asc" | "desc" };
    }
    return json(
      await listMembers(current.actor, params.id, {
        archived: sp.get("archived") === "true",
        q: sp.get("q") ?? undefined,
        sort,
      }),
    );
  },
);

export const POST = route<typeof addMemberSchema._output, Params>(
  { permission: "groups.update", body: addMemberSchema },
  async ({ current, body, params }) =>
    json(await addMember(current.actor, params.id, body), { status: 201 }),
);
