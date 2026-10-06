import { json, route } from "@/server/http/handler";
import { listGroupHomework } from "@/server/services/homework/homework.service";

type Params = { id: string };

/** Group → homework tab: every homework with each member's answer, plus assignable lessons. */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupHomework(current.actor, params.id)),
);
