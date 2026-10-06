import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { HOMEWORK_FILE_MAX_BYTES } from "@/server/services/homework/homework.service";
import { ATTACHMENT_TYPES, getStorage, newStorageKey } from "@/server/storage/local";

/**
 * Attachment upload for homework and lesson materials (documents, audio,
 * short video, images). Any signed-in user may upload; the record that
 * references the file is what authorization protects.
 */
export const POST = route({}, async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw AppError.validation({ file: ["validation.fileRequired"] });
  }
  if (!ATTACHMENT_TYPES.includes(file.type)) {
    throw AppError.validation({ file: ["validation.attachmentType"] });
  }
  if (file.size > HOMEWORK_FILE_MAX_BYTES) {
    throw AppError.validation({ file: ["validation.attachmentSize"] });
  }
  const key = newStorageKey("documents", file.type);
  const stored = await getStorage().put(key, new Uint8Array(await file.arrayBuffer()), file.type);
  return json(
    { key: stored.key, url: `/api/v1/files/${stored.key}`, size: stored.size },
    { status: 201 },
  );
});
