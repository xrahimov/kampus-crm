import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { portalFileAllowed } from "@/server/services/homework/homework.service";
import { fileResponse } from "@/server/storage/http";
import { getStorage } from "@/server/storage/local";

type Params = { token: string; key: string[] };

/** Serves a homework, lesson or recording file to the student whose link it belongs to. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params, request }) => {
  const key = params.key.join("/");
  if (!(await portalFileAllowed(params.token, key))) throw AppError.notFound();
  const response = await fileResponse(getStorage(), key, request, "private, max-age=3600");
  if (!response) throw AppError.notFound();
  return response;
});
