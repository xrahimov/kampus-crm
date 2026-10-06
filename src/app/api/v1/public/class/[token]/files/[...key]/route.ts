import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { portalFileAllowed } from "@/server/services/homework/homework.service";
import { getStorage } from "@/server/storage/local";

type Params = { token: string; key: string[] };

/** Serves a homework or lesson file to the student whose link it belongs to. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const key = params.key.join("/");
  if (!(await portalFileAllowed(params.token, key))) throw AppError.notFound();
  const file = await getStorage().get(key);
  if (!file) throw AppError.notFound();
  return new Response(file.data as BodyInit, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
