import { smsTemplateSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { deleteSmsTemplate, updateSmsTemplate } from "@/server/services/sms/templates.service";

type Params = { id: string };

export const PATCH = route<typeof smsTemplateSchema._output, Params>(
  { permission: "settings.catalog", body: smsTemplateSchema },
  async ({ current, body, params }) =>
    json(await updateSmsTemplate(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => {
    await deleteSmsTemplate(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
