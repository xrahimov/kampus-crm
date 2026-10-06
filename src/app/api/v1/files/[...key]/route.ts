import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fileResponse } from "@/server/storage/http";
import { getStorage } from "@/server/storage/local";

/** Serves an uploaded file to signed-in users. Keys are validated by the storage. */
export const GET = route<undefined, { key: string[] }>({}, async ({ params, request }) => {
  const response = await fileResponse(
    getStorage(),
    params.key.join("/"),
    request,
    "private, max-age=86400",
  );
  if (!response) throw AppError.notFound();
  return response;
});
