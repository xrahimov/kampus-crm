import { PAYMENT_SORT_FIELDS, paymentFilterSchema, paymentSchema } from "@/lib/validation/students";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors, parseListQuery } from "@/server/http/list-query";
import { createPayment, listPayments } from "@/server/services/students/payments.service";

/** Payment history (EXP §6) and the payments log: `?studentId&groupId&membershipId&paymentMethodId&receivedById&from&to`. */
export const GET = route({ permission: "students.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: PAYMENT_SORT_FIELDS,
    defaultSort: { field: "paidAt", direction: "desc" },
  });
  const raw: Record<string, string | undefined> = {};
  for (const key of [
    "studentId",
    "groupId",
    "membershipId",
    "paymentMethodId",
    "receivedById",
    "from",
    "to",
  ]) {
    raw[key] = params.get(key) ?? undefined;
  }
  const filters = paymentFilterSchema.safeParse(raw);
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listPayments(current.actor, query, filters.data));
});

/** "To'lov" (EXP §5 form, §11 header button). */
export const POST = route(
  { permission: "payments.create", body: paymentSchema },
  async ({ current, body }) => json(await createPayment(current.actor, body), { status: 201 }),
);
