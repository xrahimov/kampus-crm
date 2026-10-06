import { json, route } from "@/server/http/handler";
import { getOnlinePaymentStatus } from "@/server/services/payments/online-payments.service";

type Params = { token: string; id: string };

/** Whether the provider has confirmed the student's payment yet. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const status = await getOnlinePaymentStatus(params.token, params.id);
  return status ? json(status) : new Response(null, { status: 404 });
});
