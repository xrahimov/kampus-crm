import { statisticsFilterSchema } from "@/lib/validation/reports";
import { columns, exportTranslator, sendWorkbook } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { getCenterStatistics } from "@/server/services/reports/statistics.service";

import { parseReport } from "../../_period";

export const GET = route({ permission: "reports.view" }, async ({ current, request }) => {
  const report = await getCenterStatistics(
    current.actor,
    parseReport(request, ["view", "date"], statisticsFilterSchema),
  );
  const t = await exportTranslator(request);
  return sendWorkbook(
    request,
    `${t("excel.files.statistics")}-${report.from}-${report.to}`,
    t("reports.items.statistics"),
    columns(
      t,
      [
        "room",
        "capacity",
        "roomHours",
        "group",
        "studentsCount",
        "freeSeats",
        "lessonHours",
        "price",
        "totalSum",
        "freeHours",
        "seatHours",
        "actualSeatHours",
        "planSeatHours",
        "fik",
      ],
      { room: 20, group: 24 },
    ),
    report.rows.map((r) => ({
      room: r.roomName,
      capacity: r.capacity,
      roomHours: r.roomHours,
      group: r.groupName ?? t("reports.statistics.roomTotal"),
      studentsCount: r.students,
      freeSeats: r.freeSeats,
      lessonHours: r.lessonHours,
      price: r.coursePrice,
      totalSum: r.totalSum,
      freeHours: r.freeHours,
      seatHours: r.seatHours,
      actualSeatHours: r.actualSeatHours,
      planSeatHours: r.planSeatHours,
      fik: r.fik,
    })),
  );
});
