import { onlinePaymentSchema } from "@/lib/validation/students";
import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { createOnlinePayment } from "@/server/services/payments/online-payments.service";

type Params = { token: string };

/** The student starts a Payme or Click payment; the answer is where to send the browser. */
export const POST = route<typeof onlinePaymentSchema._output, Params>(
  { auth: false, skipCsrf: true, body: onlinePaymentSchema },
  async ({ request, params, body }) => {
    assertSameOrigin(request);
    const origin = `${request.nextUrl.protocol}//${request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host}`;
    return json(await createOnlinePayment(params.token, body, origin), { status: 201 });
  },
);
