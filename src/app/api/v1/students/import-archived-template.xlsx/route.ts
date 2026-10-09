import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { ARCHIVED_IMPORT_COLUMNS } from "@/server/services/students/history-import.service";

/** Template for the archived-students import (A-142). */
export const GET = route({ permission: "students.create" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.archivedTemplate"), ARCHIVED_IMPORT_COLUMNS, {
    fullName: t("excel.example.fullName"),
    phone: "+998901234567",
    group: t("excel.example.group"),
    joinedAt: "2025-09-01",
    leftAt: "2026-03-15",
    reason: t("excel.example.leaveReason"),
    note: "",
  });
});
