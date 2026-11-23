import { API_ORIGIN, sessionHeaders } from "@/lib/api";

/*
 * Where a lesson's file is, as the app asks for it (A-210). The server gives
 * addresses the way a page of the site would use them: "/api/v1/files/…" for
 * staff (behind the session) and "/api/v1/public/class/<token>/files/…" for a
 * student (the link is the key). The app adds the server's name, and for staff
 * the session token a page would send as a cookie.
 */
export interface FileSource {
  uri: string;
  headers?: Record<string, string>;
}

const BEHIND_SESSION = "/api/v1/files/";

export function fileSource(url: string, origin: string = API_ORIGIN): FileSource {
  if (/^https?:\/\//i.test(url)) return { uri: url };
  const path = url.startsWith("/") ? url : `/${url}`;
  const uri = `${origin}${path}`;
  return path.startsWith(BEHIND_SESSION) ? { uri, headers: sessionHeaders() } : { uri };
}

/** Whether a browser on the phone can open this address by itself (no session needed). */
export function opensWithoutSession(url: string): boolean {
  if (/^https?:\/\//i.test(url)) return true;
  return !(url.startsWith("/") ? url : `/${url}`).startsWith(BEHIND_SESSION);
}

/** "1:05" for 65 seconds; "1:02:03" past an hour. */
export function clock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
