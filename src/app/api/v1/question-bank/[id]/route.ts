import { questionSchema } from "@/lib/validation/tests";
import { json, route } from "@/server/http/handler";
import { deleteQuestion, updateQuestion } from "@/server/services/tests/questions.service";

type Params = { id: string };

export const PATCH = route<typeof questionSchema._output, Params>(
  { permission: "tests.update", body: questionSchema },
  async ({ current, body, params }) => json(await updateQuestion(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "tests.delete" },
  async ({ current, params }) => {
    await deleteQuestion(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
