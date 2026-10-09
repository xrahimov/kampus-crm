import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { PARENT_IMPORT_COLUMNS } from "@/server/services/students/import.service";

/** The template of the import dialog: a header row and one example row (A-111). */
export const GET = route({ permission: "students.update" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.parentsTemplate"), PARENT_IMPORT_COLUMNS, {
    studentId: "",
    fullName: t("excel.example.fullName"),
    phone: "+998901234567",
    parentName: t("excel.example.parentName"),
    parentPhone: "+998907654321",
  });
});
