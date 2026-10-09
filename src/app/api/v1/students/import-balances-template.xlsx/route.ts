import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { BALANCE_IMPORT_COLUMNS } from "@/server/services/students/adjustments.service";

/** Template for the opening-balance import (A-109): a debt is a negative balance. */
export const GET = route({ permission: "payments.create" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.balancesTemplate"), BALANCE_IMPORT_COLUMNS, {
    studentId: "",
    fullName: t("excel.example.fullName"),
    phone: "+998901234567",
    group: t("excel.example.group"),
    balance: -500000,
    date: "2026-10-01",
    comment: "",
  });
});
