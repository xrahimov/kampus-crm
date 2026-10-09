import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { COURSE_IMPORT_COLUMNS } from "@/server/services/imports/catalog-import.service";

/** The template of the import dialog: a header row and one example row (A-111). */
export const GET = route({ permission: "settings.catalog" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.coursesTemplate"), COURSE_IMPORT_COLUMNS, {
    name: t("excel.example.course"),
    price: 450000,
    durationMonths: 6,
    description: "",
    branch: "",
  });
});
