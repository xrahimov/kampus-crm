import { json, route } from "@/server/http/handler";
import { getPaymentOptions } from "@/server/services/students/payments.service";

export const GET = route({ permission: "students.view" }, async ({ current }) =>
  json(await getPaymentOptions(current.actor)),
);
