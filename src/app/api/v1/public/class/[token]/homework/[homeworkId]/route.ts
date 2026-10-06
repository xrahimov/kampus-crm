import { homeworkSubmissionSchema } from "@/lib/validation/groups";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { fieldErrors } from "@/server/http/list-query";
import { route } from "@/server/http/handler";
import {
  HOMEWORK_FILE_MAX_BYTES,
  submitHomework,
} from "@/server/services/homework/homework.service";
import { ATTACHMENT_TYPES, getStorage, newStorageKey } from "@/server/storage/local";

type Params = { token: string; homeworkId: string };

/**
 * The student hands in an answer: multipart with an optional `note` and an
 * optional `file`. No session: the link is the credential, the token in the
 * path is what authorises the upload.
 */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const form = await request.formData().catch(() => null);
    if (!form) throw AppError.validation({ _: ["validation.invalidJson"] });
    const parsed = homeworkSubmissionSchema.safeParse({
      note: typeof form.get("note") === "string" ? form.get("note") : null,
    });
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    let attachmentUrl: string | null = null;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (!ATTACHMENT_TYPES.includes(file.type)) {
        throw AppError.validation({ file: ["validation.attachmentType"] });
      }
      if (file.size > HOMEWORK_FILE_MAX_BYTES) {
        throw AppError.validation({ file: ["validation.attachmentSize"] });
      }
      const key = newStorageKey("homework", file.type);
      const stored = await getStorage().put(
        key,
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      );
      attachmentUrl = `/api/v1/files/${stored.key}`;
    }
    await submitHomework(params.token, params.homeworkId, { ...parsed.data, attachmentUrl });
    return new Response(null, { status: 204 });
  },
);
