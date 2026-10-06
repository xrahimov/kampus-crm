import type { Storage } from "./storage";

/**
 * Serves a stored file over HTTP with `Range` support, so a browser can seek
 * inside a lesson recording instead of downloading it whole.
 */
export async function fileResponse(
  storage: Storage,
  key: string,
  request: Request,
  cacheControl: string,
): Promise<Response | null> {
  const range = parseRange(request.headers.get("range"));
  const file = await storage.getRange(key, range?.start, range?.end);
  if (!file) return null;
  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  if (range && range.start >= file.size) {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${file.size}` },
    });
  }
  const length = file.size === 0 ? 0 : file.end - file.start + 1;
  headers["Content-Length"] = String(length);
  if (range) headers["Content-Range"] = `bytes ${file.start}-${file.end}/${file.size}`;
  return new Response(file.stream, { status: range ? 206 : 200, headers });
}

/** `bytes=a-b`, `bytes=a-` or `bytes=-n` (the last n bytes are not supported: whole file). */
function parseRange(header: string | null): { start: number; end?: number } | null {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return null;
  const start = Number(m[1]);
  const end = m[2] === "" ? undefined : Number(m[2]);
  if (end !== undefined && end < start) return null;
  return { start, end };
}
