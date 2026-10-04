import { json, route } from "@/server/http/handler";
import { getStudentPaymentsOptions } from "@/server/services/reports/student-payments.service";

export const GET = route({ permission: "reports.payments" }, async ({ current, request }) =>
  json(
    await getStudentPaymentsOptions(
      current.actor,
      request.nextUrl.searchParams.get("branchId") ?? undefined,
    ),
  ),
);
