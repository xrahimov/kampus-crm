import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import { handlePayme } from "@/server/services/payments/online-payments.service";

/** Payme Merchant API endpoint (JSON-RPC, basic auth `Paycom:<key>`), A-106. */
export const POST = route({ auth: false, skipCsrf: true }, async ({ request }) => {
  const body: unknown = await request.json().catch(() => null);
  if (body === null) {
    return json({
      id: null,
      error: { code: -32700, message: { uz: "Parse error", ru: "Parse error", en: "Parse error" } },
    });
  }
  return json({
    jsonrpc: "2.0",
    ...(await handlePayme(prisma, request.headers.get("authorization"), body)),
  });
});
