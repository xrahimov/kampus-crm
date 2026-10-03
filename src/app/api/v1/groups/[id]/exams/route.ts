import { examSchema } from "@/lib/validation/exams";
import { json, route } from "@/server/http/handler";
import { createExam, listExams } from "@/server/services/exams/exams.service";

type Params = { id: string };

/** Group detail → IMTIHON tab: the group's exams (group exams and mocks it takes part in). */
export const GET = route<undefined, Params>(
  { permission: "exams.view" },
  async ({ current, params }) =>
    json(await listExams(current.actor, { type: "GROUP", groupId: params.id })),
);

/** Adds a group exam for this group. */
export const POST = route<typeof examSchema._output, Params>(
  { permission: "exams.create", body: examSchema },
  async ({ current, body, params }) =>
    json(await createExam(current.actor, { ...body, type: "GROUP", groupId: params.id }), {
      status: 201,
    }),
);
