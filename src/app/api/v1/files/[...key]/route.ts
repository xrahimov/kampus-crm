import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { getStorage } from "@/server/storage/local";

/** Serves an uploaded file to signed-in users. Keys are validated by the storage. */
export const GET = route<undefined, { key: string[] }>({}, async ({ params }) => {
  const file = await getStorage().get(params.key.join("/"));
  if (!file) throw AppError.notFound();
  return new Response(file.data as BodyInit, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
