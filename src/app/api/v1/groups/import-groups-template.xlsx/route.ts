import { exportTranslator, templateResponse } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { GROUP_IMPORT_COLUMNS } from "@/server/services/imports/catalog-import.service";

/** The template of the import dialog: a header row and one example row (A-111). */
export const GET = route({ permission: "groups.create" }, async ({ request }) => {
  const t = await exportTranslator(request);
  return templateResponse(t, t("excel.files.groupsTemplate"), GROUP_IMPORT_COLUMNS, {
    name: t("excel.example.group"),
    course: t("excel.example.course"),
    teacher: t("excel.example.teacher"),
    weekdays: t("excel.example.days"),
    startTime: "18:00",
    endTime: "19:30",
    room: t("excel.example.room"),
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    status: "ACTIVE",
    branch: "",
  });
});
