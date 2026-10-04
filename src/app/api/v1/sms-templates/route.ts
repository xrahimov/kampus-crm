import { smsTemplateSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { createSmsTemplate, listSmsTemplates } from "@/server/services/sms/templates.service";

/** Templates, optionally `?categoryId=`; readable by anyone who can send SMS. */
export const GET = route({ permission: "sms.send" }, async ({ current, request }) =>
  json(
    await listSmsTemplates(current.actor, {
      categoryId: request.nextUrl.searchParams.get("categoryId") ?? undefined,
    }),
  ),
);

export const POST = route<typeof smsTemplateSchema._output>(
  { permission: "settings.catalog", body: smsTemplateSchema },
  async ({ current, body }) => json(await createSmsTemplate(current.actor, body), { status: 201 }),
);
