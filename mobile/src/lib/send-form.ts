/** What a sent form answers with: the status and the body's text. */
export interface FormAnswer {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
}

/**
 * Posts a form, or a picture's bytes (the web build; phones have their own in
 * `send-form.native.ts`). For a form no Content-Type is given: the form sets
 * it, with its boundary. Throws when nothing came back.
 */
export async function sendForm(
  url: string,
  headers: Record<string, string>,
  body: FormData | Uint8Array,
): Promise<FormAnswer> {
  return fetch(url, { method: "POST", headers, credentials: "omit", body: body as BodyInit });
}
