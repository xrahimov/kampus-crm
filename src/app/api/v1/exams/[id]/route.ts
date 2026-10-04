import { examSchema } from "@/lib/validation/exams";
import { json, route } from "@/server/http/handler";
import { deleteExam, getExam, updateExam } from "@/server/services/exams/exams.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "exams.view" },
  async ({ current, params }) => json(await getExam(current.actor, params.id)),
);

export const PATCH = route<typeof examSchema._output, Params>(
  { permission: "exams.update", body: examSchema },
  async ({ current, body, params }) => json(await updateExam(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "exams.delete" },
  async ({ current, params }) => {
    await deleteExam(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
