import { pushEndpointSchema, pushSubscriptionSchema } from "@/lib/validation/push";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import {
  pushSubscribed,
  subscribePush,
  unsubscribePush,
} from "@/server/services/push/push.service";

type Params = { token: string };

/** Is this browser's subscription known? `?endpoint=` */
export const GET = route<undefined, Params>({ auth: false }, async ({ request, params }) => {
  const endpoint = request.nextUrl.searchParams.get("endpoint") ?? "";
  return json({ subscribed: endpoint ? await pushSubscribed(params.token, endpoint) : false });
});

/** The browser subscribed to notifications for this student (A-176). The link is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const ok = await subscribePush(params.token, parsed.data, request.headers.get("user-agent"));
    if (!ok) throw AppError.notFound();
    return new Response(null, { status: 204 });
  },
);

/** Notifications switched off in this browser. */
export const DELETE = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = pushEndpointSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const ok = await unsubscribePush(params.token, parsed.data.endpoint);
    if (!ok) throw AppError.notFound();
    return new Response(null, { status: 204 });
  },
);
