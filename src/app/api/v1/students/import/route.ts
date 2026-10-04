import { idSchema } from "@/lib/validation/common";
import { sheetFromForm } from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { importStudents } from "@/server/services/students/import.service";

/** "EXCEL ORQALI QO'SHISH" on the students page: multipart `file` + `branchId`. */
export const POST = route({ permission: "students.create" }, async ({ current, request }) => {
  const form = await request.formData().catch(() => null);
  const branchId = idSchema.safeParse(form?.get("branchId"));
  if (!branchId.success) throw AppError.validation({ branchId: ["validation.required"] });
  const rows = await sheetFromForm(form);
  return json(await importStudents(current.actor, branchId.data, rows));
});
