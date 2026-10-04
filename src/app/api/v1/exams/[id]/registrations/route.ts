import { examRegistrationSchema } from "@/lib/validation/exams";
import { json, route } from "@/server/http/handler";
import { registerStudent, unregisterStudent } from "@/server/services/exams/exams.service";

type Params = { id: string };

/** Mock exam "Ariza": register a student. */
export const POST = route<typeof examRegistrationSchema._output, Params>(
  { permission: "exams.update", body: examRegistrationSchema },
  async ({ current, body, params }) =>
    json(await registerStudent(current.actor, params.id, body.studentId), { status: 201 }),
);

/** `?studentId=` removes a registration (and any score). */
export const DELETE = route<undefined, Params>(
  { permission: "exams.update" },
  async ({ current, params, request }) => {
    const studentId = request.nextUrl.searchParams.get("studentId") ?? "";
    await unregisterStudent(current.actor, params.id, studentId);
    return new Response(null, { status: 204 });
  },
);
