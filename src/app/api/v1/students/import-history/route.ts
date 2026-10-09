import { idSchema } from "@/lib/validation/common";
import { sheetFromForm } from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { importPaymentHistory } from "@/server/services/students/history-import.service";

/**
 * "To'lovlar tarixini import qilish" on the students page (A-142): multipart `file`
 * + `branchId`; `dryRun=1` previews without writing anything.
 */
export const POST = route({ permission: "payments.create" }, async ({ current, request }) => {
  const form = await request.formData().catch(() => null);
  const branchId = idSchema.safeParse(form?.get("branchId"));
  if (!branchId.success) throw AppError.validation({ branchId: ["validation.required"] });
  const dryRun = ["1", "true"].includes(String(form?.get("dryRun") ?? ""));
  const rows = await sheetFromForm(form);
  return json(await importPaymentHistory(current.actor, { branchId: branchId.data, dryRun }, rows));
});
