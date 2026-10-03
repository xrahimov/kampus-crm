import { leadBoardSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { deleteBoard, updateBoard } from "@/server/services/leads/boards.service";

type Params = { id: string };

export const PATCH = route<typeof leadBoardSchema._output, Params>(
  { permission: "leads.update", body: leadBoardSchema },
  async ({ current, body, params }) => json(await updateBoard(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "leads.delete" },
  async ({ current, params }) => {
    await deleteBoard(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
