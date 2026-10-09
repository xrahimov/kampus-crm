import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { HISTORY_IMPORT_COLUMNS } from "@/server/services/students/history-import.service";

/** Template for the payment-history import (A-142): rows for the record, no balance change. */
export const GET = route({ permission: "payments.create" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.historyTemplate"), HISTORY_IMPORT_COLUMNS, {
    studentId: "",
    fullName: t("excel.example.fullName"),
    phone: "+998901234567",
    group: t("excel.example.group"),
    amount: 500000,
    paidAt: "2026-02-10",
    method: t("excel.example.method"),
    comment: "",
  });
});
