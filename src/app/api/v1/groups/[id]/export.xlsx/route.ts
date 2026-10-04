import {
  columns,
  exportTranslator,
  MEMBER_COLUMNS,
  memberRows,
  sendWorkbook,
} from "@/server/excel/exports";
import { route } from "@/server/http/handler";

/** Group row ⋮ → EXCEL (EXP §5): the group's students (`?archived=true` for those who left). */
export const GET = route<undefined, { id: string }>(
  { permission: "groups.view" },
  async ({ current, request, params }) => {
    const t = await exportTranslator(request);
    const archived = request.nextUrl.searchParams.get("archived") === "true";
    return sendWorkbook(
      request,
      t("excel.files.members"),
      t("groups.members.title"),
      columns(t, MEMBER_COLUMNS, { fullName: 28, note: 30 }),
      await memberRows(current.actor, t, params.id, archived),
    );
  },
);
