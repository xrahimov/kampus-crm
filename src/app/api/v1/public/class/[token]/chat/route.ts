import { chatMessageSchema } from "@/lib/validation/groups";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { getPortalChat, postPortalMessage } from "@/server/services/chat/group-chat.service";

type Params = { token: string };

/** The group chat as the student's link shows it (A-170); `?after=<id>` for newer messages only. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params, request }) => {
  const chat = await getPortalChat(params.token, {
    after: new URL(request.url).searchParams.get("after"),
  });
  return chat ? json(chat) : new Response(null, { status: 404 });
});

/** The student writes `{ text }`. The link in the path is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = chatMessageSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const message = await postPortalMessage(params.token, parsed.data.text);
    return message ? json(message, { status: 201 }) : new Response(null, { status: 404 });
  },
);
