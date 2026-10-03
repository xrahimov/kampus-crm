import { groupNoteSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { addGroupNote, listGroupNotes } from "@/server/services/groups/groups.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupNotes(current.actor, params.id)),
);

export const POST = route<typeof groupNoteSchema._output, Params>(
  { permission: "groups.update", body: groupNoteSchema },
  async ({ current, body, params }) =>
    json(await addGroupNote(current.actor, params.id, body.text), { status: 201 }),
);
