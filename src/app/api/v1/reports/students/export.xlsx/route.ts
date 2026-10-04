import { studentsReportFilterSchema } from "@/lib/validation/reports";
import { columns, EXPORT_LIMIT, exportTranslator, sendWorkbook } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { getStudentsReport } from "@/server/services/reports/students-report.service";

import { parseReport } from "../../_period";

/** EXCEL: the attendance table (`?tab=attendance`, default) or the performance table (`?tab=performance`). */
export const GET = route({ permission: "reports.view" }, async ({ current, request }) => {
  const report = await getStudentsReport(
    current.actor,
    parseReport(
      request,
      ["from", "to", "groupId", "teacherId", "status"],
      studentsReportFilterSchema,
    ),
    undefined,
    EXPORT_LIMIT,
  );
  const t = await exportTranslator(request);
  const file = `${t("excel.files.studentsReport")}-${report.from}-${report.to}`;
  if (request.nextUrl.searchParams.get("tab") === "performance") {
    return sendWorkbook(
      request,
      file,
      t("reports.students.tabs.performance"),
      columns(t, ["index", "fullName", "groups", "teachers", "courses", "grades", "gradeAverage"], {
        fullName: 28,
        groups: 30,
        grades: 30,
      }),
      report.performance.rows.map((r, i) => ({
        index: i + 1,
        fullName: r.fullName,
        groups: r.groups.join(", "),
        teachers: r.teachers.join(", "),
        courses: r.courses.join(", "),
        grades: r.grades.map((g) => `${g.groupName}: ${g.average ?? "—"}`).join("; "),
        gradeAverage: r.average,
      })),
    );
  }
  return sendWorkbook(
    request,
    file,
    t("reports.students.tabs.attendance"),
    columns(
      t,
      ["index", "group", "teacher", "studentsCount", "lessons", "unmarked", "absent", "present"],
      { group: 24, teacher: 24 },
    ),
    report.attendance.rows.map((r, i) => ({
      index: i + 1,
      group: r.groupName,
      teacher: r.teacherName,
      studentsCount: r.students,
      lessons: r.lessons,
      unmarked: r.unmarked,
      absent: r.absent,
      present: r.present,
    })),
  );
});
