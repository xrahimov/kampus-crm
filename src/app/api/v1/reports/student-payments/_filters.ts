import type { NextRequest } from "next/server";

import { STUDENT_PAYMENT_SORT_FIELDS, studentPaymentsFilterSchema } from "@/lib/validation/reports";
import { parseListQuery } from "@/server/http/list-query";

import { parseReport } from "../_period";

export const STUDENT_PAYMENT_KEYS = [
  "byPaidAt",
  "groupId",
  "paymentMethodId",
  "teacherId",
  "courseId",
  "bonus",
  "receivedById",
];

export function parseStudentPayments(request: NextRequest) {
  const filters = parseReport(request, STUDENT_PAYMENT_KEYS, studentPaymentsFilterSchema);
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.delete("locale");
  const query = parseListQuery(params, {
    sortable: STUDENT_PAYMENT_SORT_FIELDS,
    defaultSort: { field: "paidAt", direction: "desc" },
  });
  return { filters, query };
}
