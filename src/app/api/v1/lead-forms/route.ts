import { leadFormSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { createForm, listForms } from "@/server/services/leads/forms.service";

export const GET = route({ permission: "settings.catalog" }, async ({ current }) =>
  json(await listForms(current.actor)),
);

export const POST = route<typeof leadFormSchema._output>(
  { permission: "settings.catalog", body: leadFormSchema },
  async ({ current, body }) => json(await createForm(current.actor, body), { status: 201 }),
);
