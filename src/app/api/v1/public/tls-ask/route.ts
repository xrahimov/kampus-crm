import { route } from "@/server/http/handler";
import { isServedHost } from "@/server/services/settings/domains.service";

/**
 * Caddy's on-demand TLS "ask" endpoint (A-114): 200 when the name is the
 * server's own domain or one a centre claimed in Settings → Organisations,
 * 403 otherwise, so no certificate is requested for names that are not ours.
 */
export const GET = route({ auth: false }, async ({ request }) => {
  const ok = await isServedHost(request.nextUrl.searchParams.get("domain"));
  return new Response(ok ? "ok" : "unknown host", {
    status: ok ? 200 : 403,
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
});
