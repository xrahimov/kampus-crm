import { idSchema } from "@/lib/validation/common";
import { sheetFromForm } from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { importOpeningBalances } from "@/server/services/students/adjustments.service";

/**
 * "Boshlang'ich qoldiqlarni import qilish" on the students page (A-109): multipart
 * `file` + `branchId`; `dryRun=1` previews the matches without writing anything.
 */
export const POST = route({ permission: "payments.create" }, async ({ current, request }) => {
  const form = await request.formData().catch(() => null);
  const branchId = idSchema.safeParse(form?.get("branchId"));
  if (!branchId.success) throw AppError.validation({ branchId: ["validation.required"] });
  const dryRun = ["1", "true"].includes(String(form?.get("dryRun") ?? ""));
  const rows = await sheetFromForm(form);
  return json(
    await importOpeningBalances(current.actor, { branchId: branchId.data, dryRun }, rows),
  );
});
