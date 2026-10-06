import { json, route } from "@/server/http/handler";
import { listPortalMaterials } from "@/server/services/materials/materials.service";

type Params = { token: string };

/** The group's materials and recordings, as the student's link shows them. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const items = await listPortalMaterials(params.token);
  return items ? json(items) : new Response(null, { status: 404 });
});
