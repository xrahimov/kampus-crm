import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { ROOM_IMPORT_COLUMNS } from "@/server/services/imports/catalog-import.service";

/** The template of the import dialog: a header row and one example row (A-111). */
export const GET = route({ permission: "settings.catalog" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.roomsTemplate"), ROOM_IMPORT_COLUMNS, {
    name: t("excel.example.room"),
    capacity: 12,
    branch: "",
  });
});
