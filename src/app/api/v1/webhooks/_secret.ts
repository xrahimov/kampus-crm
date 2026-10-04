import type { NextRequest } from "next/server";

/** Webhooks present the shared secret as a header or query parameter. */
export function presentedSecret(request: NextRequest): string | null {
  return request.headers.get("x-kampus-secret") ?? request.nextUrl.searchParams.get("secret");
}
