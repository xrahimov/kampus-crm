import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import { handleClick } from "@/server/services/payments/online-payments.service";

/** Click SHOP API prepare/complete endpoint (form fields, md5 signature), A-106. */
export const POST = route({ auth: false, skipCsrf: true }, async ({ request }) => {
  const fields: Record<string, string> = {};
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(body)) fields[k] = String(v ?? "");
  } else {
    const form = await request.formData().catch(() => null);
    if (form) for (const [k, v] of form.entries()) fields[k] = String(v);
  }
  return json(await handleClick(prisma, fields));
});
