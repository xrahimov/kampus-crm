import { helpVideoRange } from "@/server/help-videos";
import { route } from "@/server/http/handler";
import { fileResponse } from "@/server/storage/http";

type Params = { locale: string; id: string };

/**
 * One how-to video of the manual (A-199). Open to everyone: the sign-in pages
 * and the student's manual show videos to people who have no session, and the
 * videos are recorded from demo data only.
 */
export const GET = route<undefined, Params>({ auth: false }, async ({ params, request }) => {
  const response = await fileResponse(
    { getRange: (_key, start, end) => helpVideoRange(params.locale, params.id, start, end) },
    "",
    request,
    "public, max-age=3600",
  );
  if (!response) return new Response(null, { status: 404 });
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
});
