import { leadFilterSchema } from "@/lib/validation/leads";
import {
  columns,
  exportTranslator,
  LEAD_COLUMNS,
  leadRows,
  sendWorkbook,
} from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { getBoardView } from "@/server/services/leads/leads.service";

/** Leads board EXCEL (EXP §2): the board as filtered, column by column. */
export const GET = route({ permission: "leads.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const raw: Record<string, string | undefined> = {};
  for (const key of ["boardId", "q", "lessonTime", "teacherId", "days", "archived"]) {
    raw[key] = params.get(key) ?? undefined;
  }
  const filters = leadFilterSchema.safeParse(raw);
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  const t = await exportTranslator(request);
  const view = await getBoardView(current.actor, filters.data);
  const leads = view.columns.flatMap((c) => c.leads.map((l) => ({ ...l, columnName: c.name })));
  return sendWorkbook(
    request,
    `${t("excel.files.leads")}-${view.board?.name ?? ""}`,
    t("leads.title"),
    columns(t, LEAD_COLUMNS, { fullName: 28, comment: 30 }),
    leadRows(t, leads),
  );
});
