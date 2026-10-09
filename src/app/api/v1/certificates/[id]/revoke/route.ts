import { json, route } from "@/server/http/handler";
import { revokeCertificate } from "@/server/services/students/certificates.service";

/** Withdraws a certificate: the public page then says so (round 2 G2, A-140). */
export const POST = route<undefined, { id: string }>(
  { permission: "students.update" },
  async ({ current, params }) => json(await revokeCertificate(current.actor, params.id)),
);
