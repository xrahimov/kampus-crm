import { route } from "@/server/http/handler";
import { deleteBotRecipient } from "@/server/services/integrations/bot-recipients.service";

type Params = { id: string };

export const DELETE = route<undefined, Params>(
  { permission: "settings.integrations" },
  async ({ current, params }) => {
    await deleteBotRecipient(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
