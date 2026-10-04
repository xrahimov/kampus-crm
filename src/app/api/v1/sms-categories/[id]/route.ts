import { route } from "@/server/http/handler";
import { deleteSmsCategory } from "@/server/services/sms/templates.service";

type Params = { id: string };

export const DELETE = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => {
    await deleteSmsCategory(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
