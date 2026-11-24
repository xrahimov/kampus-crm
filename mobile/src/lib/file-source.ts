import { API_ORIGIN, sessionHeaders } from "@/lib/api";

/*
 * Where a file the server keeps is, as the app asks for it (A-210). The server
 * gives addresses the way a page of the site would use them: "/api/v1/files/…"
 * for staff (behind the session) and "/api/v1/public/class/<token>/files/…"
 * for a student (the link is the key). The app adds the server's name, and for
 * staff the session token a page would send as a cookie.
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
