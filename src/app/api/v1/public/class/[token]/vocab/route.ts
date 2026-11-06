import { json, route } from "@/server/http/handler";
import { getPortalVocab } from "@/server/services/vocab/vocab.service";

type Params = { token: string };

/** The student's flashcards: figures and the next cards due (A-165). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const vocab = await getPortalVocab(params.token);
  return vocab ? json(vocab) : new Response(null, { status: 404 });
});
