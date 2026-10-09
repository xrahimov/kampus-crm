import { certificateSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { issueCertificate } from "@/server/services/students/certificates.service";

/** Issues the certificate of a graduated membership (round 2 G2, A-140). */
export const POST = route<typeof certificateSchema._output, { id: string }>(
  { permission: "students.update", body: certificateSchema },
  async ({ current, body, params }) =>
    json(await issueCertificate(current.actor, params.id, body), { status: 201 }),
);
