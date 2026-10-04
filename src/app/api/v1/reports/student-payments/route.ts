import { json, route } from "@/server/http/handler";
import { listStudentPayments } from "@/server/services/reports/student-payments.service";

import { parseStudentPayments } from "./_filters";

/** Reports → "O'quvchilar to'lovlari" (EXP §10): list query + `?byPaidAt&groupId&paymentMethodId&teacherId&courseId&bonus&receivedById`. */
export const GET = route({ permission: "reports.payments" }, async ({ current, request }) => {
  const { filters, query } = parseStudentPayments(request);
  return json(await listStudentPayments(current.actor, query, filters));
});
