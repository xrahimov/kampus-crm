import { idSchema } from "@/lib/validation/common";
import { sheetFromForm } from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { importParents } from "@/server/services/students/import.service";

/** "Import parents" on the students page: multipart `file` + `branchId` (the students' branch). */
export const POST = route({ permission: "students.update" }, async ({ current, request }) => {
  const form = await request.formData().catch(() => null);
  const branchId = idSchema.safeParse(form?.get("branchId"));
  if (!branchId.success) throw AppError.validation({ branchId: ["validation.required"] });
  const rows = await sheetFromForm(form);
  return json(await importParents(current.actor, branchId.data, rows));
});
