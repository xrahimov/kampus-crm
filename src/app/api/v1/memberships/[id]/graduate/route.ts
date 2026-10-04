import { graduateRecordSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { setGraduateRecord } from "@/server/services/reports/graduates.service";

/** "Natija kiritish" on the graduates report: IELTS, CEFR, university, employment. */
export const PUT = route<typeof graduateRecordSchema._output, { id: string }>(
  { permission: "students.update", body: graduateRecordSchema },
  async ({ current, body, params }) =>
    json(await setGraduateRecord(current.actor, params.id, body)),
);
