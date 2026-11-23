/** What a sent form answers with: the status and the body's text. */
export interface FormAnswer {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
}

/**
 * Posts a form (the web build; phones have their own in `send-form.native.ts`).
 * No Content-Type is given: the form sets it, with its boundary. Throws when
 * nothing came back.
 */
export async function sendForm(
  url: string,
  headers: Record<string, string>,
  form: FormData,
): Promise<FormAnswer> {
  return fetch(url, { method: "POST", headers, credentials: "omit", body: form });
}
