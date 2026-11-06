import { generateVAPIDKeys, sendNotification } from "web-push";

import type { PushSubscriptionInput } from "@/lib/validation/push";
import { prisma, type DbClient } from "@/server/db/prisma";
import { enqueue } from "@/server/jobs/queue";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * Web Push for the student app (online-lessons A5, A-176). A student who
 * installed My Kampus or opened their link in a browser can ask for
 * notifications; from then on the texts the Telegram bot sends (reminders,
 * homework, materials, payments, chat) reach the browser too, even when the
 * page is closed. Keys are VAPID: one pair per server, made on first use and
 * kept in SystemState. Sending is a queued job, so a slow push service never
 * holds up the request that caused the message.
 */

const VAPID_KEY = "push.vapid";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** The server's VAPID pair; created once and kept, so subscriptions stay valid across restarts. */
export async function getVapidKeys(db: DbClient = prisma): Promise<VapidKeys> {
  const row = await db.systemState.findUnique({ where: { key: VAPID_KEY } });
  const stored = row?.meta as Partial<VapidKeys> | null | undefined;
  if (stored?.publicKey && stored.privateKey) {
    return { publicKey: stored.publicKey, privateKey: stored.privateKey };
  }
  const keys = generateVAPIDKeys();
  const meta = { publicKey: keys.publicKey, privateKey: keys.privateKey };
  await db.systemState.upsert({
    where: { key: VAPID_KEY },
    create: { key: VAPID_KEY, meta },
    update: { meta },
  });
  return meta;
}

/** The browser subscribed; remember where to send and in which language. */
export async function subscribePush(
  token: string,
  input: PushSubscriptionInput,
  userAgent: string | null,
  db: DbClient = prisma,
): Promise<boolean> {
  const membership = await membershipByToken(db, token);
  if (!membership) return false;
  const data = {
    studentId: membership.studentId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    locale: input.locale,
    path: input.path,
    userAgent: userAgent?.slice(0, 300) ?? null,
  };
  await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { endpoint: input.endpoint, ...data },
    update: data,
  });
  return true;
}

/** The student switched notifications off in this browser. */
export async function unsubscribePush(
  token: string,
  endpoint: string,
  db: DbClient = prisma,
): Promise<boolean> {
  const membership = await membershipByToken(db, token);
  if (!membership) return false;
  await db.pushSubscription.deleteMany({ where: { endpoint, studentId: membership.studentId } });
  return true;
}

/** Whether this browser's subscription is still known to the server. */
export async function pushSubscribed(
  token: string,
  endpoint: string,
  db: DbClient = prisma,
): Promise<boolean> {
  const membership = await membershipByToken(db, token);
  if (!membership) return false;
  return (
    (await db.pushSubscription.count({ where: { endpoint, studentId: membership.studentId } })) > 0
  );
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open on tap; the subscription's own page when absent. */
  url?: string;
  /** Notifications with the same tag replace one another. */
  tag?: string;
}

/**
 * Queues one push per browser of the given students. `text` renders the body in
 * the subscription's language. Returns how many were queued.
 */
export async function queuePushForStudents(
  tx: DbClient,
  input: {
    studentIds: string[];
    refKey: string;
    title: string;
    text: (locale: string) => string;
    url?: string;
    tag?: string;
  },
): Promise<number> {
  if (input.studentIds.length === 0) return 0;
  const subscriptions = await tx.pushSubscription.findMany({
    where: { studentId: { in: input.studentIds }, student: { isArchived: false } },
    select: { id: true, locale: true },
  });
  let queued = 0;
  for (const sub of subscriptions) {
    const id = await enqueue(tx, {
      type: "push.send",
      payload: {
        subscriptionId: sub.id,
        title: input.title,
        body: input.text(sub.locale),
        url: input.url,
        tag: input.tag,
      },
      uniqueKey: `push:${input.refKey}:${sub.id}`,
    });
    if (id) queued += 1;
  }
  return queued;
}

export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: {
    vapidDetails: { subject: string; publicKey: string; privateKey: string };
    TTL: number;
  },
) => Promise<unknown>;

const defaultSender: PushSender = (subscription, payload, options) =>
  sendNotification(subscription, payload, options);

/** A notification stays with the push service this long when the device is offline. */
const PUSH_TTL_SECONDS = 24 * 60 * 60;

/**
 * The `push.send` job. A subscription the push service no longer knows (404 or
 * 410) is deleted; any other failure is thrown, so the queue retries it.
 */
export async function sendPush(
  db: DbClient,
  payload: { subscriptionId: string } & PushPayload,
  send: PushSender = defaultSender,
  env: Record<string, string | undefined> = process.env,
): Promise<"sent" | "gone" | "skipped"> {
  const sub = await db.pushSubscription.findUnique({ where: { id: payload.subscriptionId } });
  if (!sub) return "skipped";
  const keys = await getVapidKeys(db);
  const subject = env.APP_URL?.startsWith("https://") ? env.APP_URL : "mailto:admin@kampus.local";
  try {
    await send(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? sub.path,
        tag: payload.tag,
      }),
      { vapidDetails: { subject, ...keys }, TTL: PUSH_TTL_SECONDS },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.pushSubscription.deleteMany({ where: { id: sub.id } });
      return "gone";
    }
    throw error;
  }
}
