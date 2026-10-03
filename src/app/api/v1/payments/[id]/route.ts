import { json, route } from "@/server/http/handler";
import { getPayment } from "@/server/services/students/payments.service";

export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params }) => json(await getPayment(current.actor, params.id)),
);
