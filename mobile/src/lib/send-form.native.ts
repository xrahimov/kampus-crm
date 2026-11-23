import type { FormAnswer } from "./send-form";

/**
 * Posts a form from a phone. A file in the form is named by where it sits on
 * the device (`{ uri, name, type }`), and only React Native's own request
 * (XMLHttpRequest) reads such a file while sending. The `fetch` Expo installs
 * builds the whole body in memory and refuses a file given by its address,
 * so a form never goes through it. A picture made in the app (the saved
 * whiteboard) goes the same way, as its bytes. Throws when nothing came back.
 */
export function sendForm(
  url: string,
  headers: Record<string, string>,
  body: FormData | Uint8Array,
): Promise<FormAnswer> {
  return new Promise<FormAnswer>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    // The session travels in a header; no cookie is sent or kept.
    request.withCredentials = false;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.onload = () => {
      const text = typeof request.responseText === "string" ? request.responseText : "";
      resolve({
        status: request.status,
        ok: request.status >= 200 && request.status < 300,
        text: async () => text,
      });
    };
    const fail = () => reject(new Error("The form could not be sent"));
    request.onerror = fail;
    request.ontimeout = fail;
    request.onabort = fail;
    request.send(body);
  });
}
