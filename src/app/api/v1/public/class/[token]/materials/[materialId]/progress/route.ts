import { materialProgressSchema } from "@/lib/validation/groups";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { saveMaterialProgress } from "@/server/services/materials/materials.service";

type Params = { token: string; materialId: string };

/** The student's player says where it is in a recording (A-175). The link is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = materialProgressSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const ok = await saveMaterialProgress(params.token, params.materialId, parsed.data);
    if (!ok) throw AppError.notFound();
    return new Response(null, { status: 204 });
  },
);
