import { json, route } from "@/server/http/handler";
import { listPortalCertificates } from "@/server/services/students/certificates.service";

type Params = { token: string };

/** The student's certificates with their public links (A-140), for the phone app (A-216). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const certificates = await listPortalCertificates(params.token);
  return certificates ? json(certificates) : new Response(null, { status: 404 });
});
