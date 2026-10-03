import { json, route } from "@/server/http/handler";
import { getPaymentInfo } from "@/server/services/students/payments.service";

/** Balance, suggested amount and month for the "To'lov" dialog. */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params }) => json(await getPaymentInfo(current.actor, params.id)),
);
