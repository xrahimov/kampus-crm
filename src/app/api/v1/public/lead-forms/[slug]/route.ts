import { publicLeadSchema } from "@/lib/validation/leads";
import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { getPublicForm, submitPublicForm } from "@/server/services/leads/forms.service";

type Params = { slug: string };

/** The public form page reads the form's title; 404 when it is missing or inactive. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const form = await getPublicForm(params.slug);
  return form ? json(form) : new Response(null, { status: 404 });
});

/**
 * A visitor's submission: no session, so no CSRF token; the same-origin check
 * and a per-IP limit stand in for it (A-69).
 */
export const POST = route<typeof publicLeadSchema._output, Params>(
  { auth: false, body: publicLeadSchema, skipCsrf: true },
  async ({ request, body, params, ip }) => {
    assertSameOrigin(request);
    return json(await submitPublicForm(params.slug, body, ip), { status: 201 });
  },
);
