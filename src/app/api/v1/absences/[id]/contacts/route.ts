import { absenceContactSchema } from "@/lib/validation/absences";
import { json, route } from "@/server/http/handler";
import {
  listAbsenceContacts,
  logAbsenceContact,
} from "@/server/services/absences/absences.service";

type Params = { id: string };

/** The history of one absence case, newest first (A-125). */
export const GET = route<undefined, Params>(
  { permission: "students.update" },
  async ({ current, params }) => json(await listAbsenceContacts(current.actor, params.id)),
);

/** "Log a contact": a call, visit, message or note with its outcome. */
export const POST = route<typeof absenceContactSchema._output, Params>(
  { permission: "students.update", body: absenceContactSchema },
  async ({ current, params, body }) =>
    json(await logAbsenceContact(current.actor, params.id, body), { status: 201 }),
);
