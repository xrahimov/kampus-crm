import { coinReasonSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import { createCoinReason, listCoinReasons } from "@/server/services/coins/coins.service";

/** "Qo'lda beriladigan coin sabablari"; `?active=1` keeps only active reasons. */
export const GET = route({}, async ({ current, request }) =>
  json(
    await listCoinReasons(current.actor, {
      activeOnly: request.nextUrl.searchParams.get("active") === "1",
    }),
  ),
);

export const POST = route<typeof coinReasonSchema._output>(
  { permission: "settings.org", body: coinReasonSchema },
  async ({ current, body }) => json(await createCoinReason(current.actor, body), { status: 201 }),
);
