import { leadFormSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { deleteForm, updateForm } from "@/server/services/leads/forms.service";

type Params = { id: string };
const patchSchema = leadFormSchema.partial();

export const PATCH = route<typeof patchSchema._output, Params>(
  { permission: "settings.catalog", body: patchSchema },
  async ({ current, body, params }) => json(await updateForm(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => {
    await deleteForm(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
