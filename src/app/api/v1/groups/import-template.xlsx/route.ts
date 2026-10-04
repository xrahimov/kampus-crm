import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { MEMBER_IMPORT_COLUMNS } from "@/server/services/students/import.service";

/** "SHABLONNI YUKLAB OLISH" in the add-student dialog (EXP §5). */
export const GET = route({ permission: "groups.update" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.membersTemplate"), MEMBER_IMPORT_COLUMNS, {
    fullName: t("excel.example.fullName"),
    phone: "+998901234567",
    joinedAt: new Date().toISOString().slice(0, 10),
    customPrice: "",
    note: "",
  });
});
