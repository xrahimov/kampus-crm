import { faceIdWebhookSchema } from "@/lib/validation/integrations";
import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import { recordFaceIdCheck } from "@/server/services/attendance/staff-attendance.service";
import { assertWebhookSecret } from "@/server/services/integrations/integrations.service";

import { presentedSecret } from "../_secret";

/** A FaceID terminal posts check-ins here (A-87). */
export const POST = route<typeof faceIdWebhookSchema._output>(
  { auth: false, body: faceIdWebhookSchema, skipCsrf: true },
  async ({ request, body }) => {
    const organizationId = await assertWebhookSecret(prisma, "FACE_ID", presentedSecret(request));
    return json(await recordFaceIdCheck(prisma, organizationId, body), { status: 201 });
  },
);
