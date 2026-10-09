import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { STAFF_IMPORT_COLUMNS } from "@/server/services/imports/catalog-import.service";

/** The template of the import dialog: a header row and one example row (A-111). */
export const GET = route({ permission: "staff.create" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.staffTemplate"), STAFF_IMPORT_COLUMNS, {
    fullName: t("excel.example.fullName"),
    phone: "+998901234567",
    roles: t("excel.example.roles"),
    branches: "",
    gender: t("excel.example.gender"),
    birthDate: "",
    hireDate: new Date().toISOString().slice(0, 10),
    password: "",
  });
});
