import { paymentMethodUpdateSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import {
  deletePaymentMethod,
  updatePaymentMethod,
} from "@/server/services/settings/payment-methods.service";

type Params = { id: string };

export const PATCH = route<typeof paymentMethodUpdateSchema._output, Params>(
  { permission: "settings.org", body: paymentMethodUpdateSchema },
  async ({ current, body, params }) =>
    json(await updatePaymentMethod(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.org" },
  async ({ current, params }) => {
    await deletePaymentMethod(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
