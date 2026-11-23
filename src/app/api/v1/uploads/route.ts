import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { getStorage, IMAGE_TYPES, newStorageKey, uploadType } from "@/server/storage/local";

/** Photos are small; 2 MiB covers a phone camera shot after the browser resizes it. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Image upload for staff and student photos. Any signed-in user may upload;
 * the record that references the photo is what authorization protects.
 * Returns the URL the client stores in `photoUrl`.
 */
export const POST = route({}, async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw AppError.validation({ file: ["validation.fileRequired"] });
  }
  const type = uploadType(file, IMAGE_TYPES);
  if (!type) throw AppError.validation({ file: ["validation.fileType"] });
  if (file.size > MAX_BYTES) {
    throw AppError.validation({ file: ["validation.fileSize"] });
  }
  const key = newStorageKey("photos", type);
  const stored = await getStorage().put(key, new Uint8Array(await file.arrayBuffer()), type);
  return json(
    { key: stored.key, url: `/api/v1/files/${stored.key}`, size: stored.size },
    { status: 201 },
  );
});
