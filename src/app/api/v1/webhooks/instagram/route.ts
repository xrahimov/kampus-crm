import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { verifyMetaSignature } from "@/server/integrations/instagram/provider";
import {
  assertWebhookSecret,
  getInstagramProvider,
  instagramConfigFor,
} from "@/server/services/integrations/integrations.service";
import { receiveInstagramLeadMessage } from "@/server/services/leads/inbox.service";

import { presentedSecret } from "../_secret";

/*
 * Instagram messaging webhook (round 2 item E6, A-148). The address carries the
 * centre's webhook secret, as the other webhooks do; Meta's own checks come on
 * top: the GET handshake with the verify token and the HMAC signature of every
 * delivery with the app secret.
 */

const delivery = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        messaging: z
          .array(
            z.object({
              sender: z.object({ id: z.union([z.string(), z.number()]) }),
              recipient: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
              message: z
                .object({
                  mid: z.string().optional(),
                  text: z.string().optional(),
                  is_echo: z.boolean().optional(),
                  attachments: z.array(z.object({ type: z.string().optional() })).optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

/** Meta's subscription handshake: echo the challenge when the verify token is the centre's. */
export const GET = route({ auth: false }, async ({ request }) => {
  const organizationId = await assertWebhookSecret(prisma, "INSTAGRAM", presentedSecret(request));
  const config = await instagramConfigFor(prisma, organizationId);
  const params = request.nextUrl.searchParams;
  const token = params.get("hub.verify_token");
  if (
    params.get("hub.mode") !== "subscribe" ||
    !config?.verifyToken ||
    token !== config.verifyToken
  ) {
    throw AppError.forbidden("errors.webhookRejected");
  }
  return new Response(params.get("hub.challenge") ?? "", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});

/** A delivery: every text (or attachment) from a stranger lands in Leads → Inbox. */
export const POST = route({ auth: false, skipCsrf: true }, async ({ request }) => {
  const organizationId = await assertWebhookSecret(prisma, "INSTAGRAM", presentedSecret(request));
  const config = await instagramConfigFor(prisma, organizationId);
  const raw = await request.text();
  if (
    config?.appSecret &&
    !verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)
  ) {
    throw AppError.forbidden("errors.webhookRejected");
  }
  let parsed: z.output<typeof delivery>;
  try {
    parsed = delivery.parse(JSON.parse(raw));
  } catch {
    // Meta expects a 200 for anything it sent; an unknown shape is simply not a message.
    return json({ ok: true });
  }
  const provider = getInstagramProvider(config);
  let filed = 0;
  for (const entry of parsed.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = String(event.sender.id);
      if (!event.message || event.message.is_echo) continue;
      if (config?.instagramAccountId && senderId === config.instagramAccountId) continue;
      const text =
        event.message.text?.trim() ||
        (event.message.attachments?.length
          ? `[${event.message.attachments.map((a) => a.type ?? "attachment").join(", ")}]`
          : "");
      if (!text) continue;
      const known = await prisma.leadConversation.count({
        where: { organizationId, channel: "INSTAGRAM", externalChatId: senderId },
      });
      const profile = known ? null : await provider.fetchProfile(senderId).catch(() => null);
      const welcome = await receiveInstagramLeadMessage(prisma, organizationId, {
        senderId,
        text,
        externalId: event.message.mid ?? null,
        profile,
      });
      filed += 1;
      if (welcome && config?.welcomeReply) {
        await provider.sendMessage(senderId, welcome.text).catch(() => undefined);
      }
    }
  }
  return json({ ok: true, filed });
});
