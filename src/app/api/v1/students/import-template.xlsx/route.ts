import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { STUDENT_IMPORT_COLUMNS } from "@/server/services/students/import.service";

/** "SHABLONNI YUKLAB OLISH" for the students import (EXP §6). */
export const GET = route({ permission: "students.create" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.studentsTemplate"), STUDENT_IMPORT_COLUMNS, {
    fullName: t("excel.example.fullName"),
    phone: "+998901234567",
    gender: t("excel.example.gender"),
    birthDate: "2010-05-20",
    note: "",
  });
});
