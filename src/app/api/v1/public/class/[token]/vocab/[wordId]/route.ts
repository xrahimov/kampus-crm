import { vocabReviewSchema } from "@/lib/validation/vocab";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { reviewPortalWord } from "@/server/services/vocab/vocab.service";

type Params = { token: string; wordId: string };

/** One flashcard answered: `{ known }`. The link in the path is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = vocabReviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const vocab = await reviewPortalWord(params.token, params.wordId, parsed.data);
    return vocab ? json(vocab) : new Response(null, { status: 404 });
  },
);
