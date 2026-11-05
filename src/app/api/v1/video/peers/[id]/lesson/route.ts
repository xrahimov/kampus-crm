import { z } from "zod";

import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { getCallLesson } from "@/server/services/video/call-lesson.service";

type Params = { id: string };

const bodySchema = z.object({ secret: z.string().min(16).max(200) });

/** The lesson panel inside a call (A-154); the participant's secret authenticates, as for sync. */
export const POST = route<typeof bodySchema._output, Params>(
  { auth: false, body: bodySchema, skipCsrf: true },
  async ({ request, params, body }) => {
    assertSameOrigin(request);
    return json(await getCallLesson(params.id, body.secret));
  },
);
