import { columns, EXPORT_LIMIT, exportTranslator, sendWorkbook } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { listStudentPayments } from "@/server/services/reports/student-payments.service";

import { parseStudentPayments } from "../_filters";

/** EXCEL on the student payments report. */
export const GET = route({ permission: "reports.payments" }, async ({ current, request }) => {
  const { filters, query } = parseStudentPayments(request);
  const page = await listStudentPayments(
    current.actor,
    { ...query, page: 1, skip: 0, take: EXPORT_LIMIT, pageSize: EXPORT_LIMIT },
    filters,
  );
  const t = await exportTranslator(request);
  return sendWorkbook(
    request,
    t("excel.files.studentPayments"),
    t("reports.items.studentPayments"),
    columns(
      t,
      [
        "index",
        "fullName",
        "group",
        "teacher",
        "course",
        "amount",
        "bonus",
        "refunded",
        "paidAt",
        "effectiveMonth",
        "comment",
        "receivedBy",
        "method",
      ],
      { fullName: 28, comment: 30 },
    ),
    page.items.map((p, i) => ({
      index: i + 1,
      fullName: p.studentName,
      group: p.groupName,
      teacher: p.teacherName,
      course: p.courseName,
      amount: p.amount,
      bonus: p.bonus,
      refunded: p.refunded,
      paidAt: p.paidAt,
      effectiveMonth: p.effectiveMonth,
      comment: p.comment,
      receivedBy: p.receivedByName,
      method: p.methodName,
    })),
  );
});
