import { paymentMethodSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import {
  createPaymentMethod,
  listPaymentMethods,
} from "@/server/services/settings/payment-methods.service";

export const GET = route({ permission: "settings.org" }, async ({ current }) =>
  json({ items: await listPaymentMethods(current.actor) }),
);

export const POST = route(
  { permission: "settings.org", body: paymentMethodSchema },
  async ({ current, body }) =>
    json(await createPaymentMethod(current.actor, body), { status: 201 }),
);
