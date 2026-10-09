import { idSchema } from "@/lib/validation/common";
import { sheetFromForm } from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { importGroups } from "@/server/services/imports/catalog-import.service";

/** "Import from Excel" on the groups page: multipart `file` + `branchId`. */
export const POST = route({ permission: "groups.create" }, async ({ current, request }) => {
  const form = await request.formData().catch(() => null);
  const branchId = idSchema.safeParse(form?.get("branchId"));
  if (!branchId.success) throw AppError.validation({ branchId: ["validation.required"] });
  const rows = await sheetFromForm(form);
  return json(await importGroups(current.actor, branchId.data, rows));
});
