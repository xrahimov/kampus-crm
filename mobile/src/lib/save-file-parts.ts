import { ApiError, type ApiErrorBody } from "./api";

/*
 * What both ways of saving a file share (A-256): the phone's
 * (`save-file.native.ts`) and the browser build's (`save-file.ts`).
 */

/**
 * What became of a file the server made: shown by the phone (`opened`), put
 * in Downloads with nothing on the phone to open it (`saved`), or neither,
 * because no app opens such a file (`noApp`).
 */
export type Saved = "opened" | "saved" | "noApp";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A name is one part of a path: no folders, nothing the phone would hide. */
function plain(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/^\.+/, "");
}

/**
 * The name the server gives a download in `Content-Disposition`: the UTF-8
 * one where there is one ("O'quvchilar.xlsx"), the plain one after it.
 */
export function nameOf(disposition: string | null | undefined, fallback: string): string {
  const header = disposition ?? "";
  const wide = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
  if (wide) {
    try {
      const name = plain(decodeURIComponent(wide.trim()));
      if (name) return name;
    } catch {
      // Not what it says it is: the plain name is next.
    }
  }
  const narrow = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1];
  return plain(narrow?.trim() ?? "") || plain(fallback) || "file";
}

/** A header by its name, however the phone spelled it. */
export function headerOf(headers: Record<string, string> | undefined, name: string): string | null {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name) return value;
  }
  return null;
}

/** The server's refusal as the app's other calls throw it. */
export function refusalOf(status: number, text: string): ApiError {
  let error: ApiErrorBody["error"] = { code: "INTERNAL", message: "errors.internal" };
  try {
    error = (JSON.parse(text) as ApiErrorBody).error ?? error;
  } catch {
    // Not the server's own answer (a proxy's page): the general words stand.
  }
  return new ApiError(status, error);
}
