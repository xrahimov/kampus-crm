import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Instagram direct messages (round 2 item E6, A-148). Meta delivers a
 * professional account's messages to a webhook and replies go out through
 * the Graph API with the page access token. Until the centre's Meta app
 * exists, the fake provider records replies in memory, which is also what
 * tests read.
 */

export interface InstagramProfile {
  name: string | null;
  username: string | null;
}

export interface InstagramProvider {
  readonly name: "fake" | "graph";
  /** Sends a text reply to an Instagram-scoped user id; returns Meta's message id. */
  sendMessage(recipientId: string, text: string): Promise<{ externalId: string | null }>;
  /** The sender's public name and handle, when the token may read them. */
  fetchProfile(userId: string): Promise<InstagramProfile | null>;
}

/** Replies the fake provider "sent" during this process, newest last. */
export const fakeInstagramOutbox: Array<{ recipientId: string; text: string }> = [];

export class FakeInstagramProvider implements InstagramProvider {
  readonly name = "fake" as const;
  async sendMessage(recipientId: string, text: string): Promise<{ externalId: string | null }> {
    fakeInstagramOutbox.push({ recipientId, text });
    if (fakeInstagramOutbox.length > 500) {
      fakeInstagramOutbox.splice(0, fakeInstagramOutbox.length - 500);
    }
    return { externalId: `fake-ig-${fakeInstagramOutbox.length}` };
  }
  async fetchProfile(): Promise<InstagramProfile | null> {
    return null;
  }
}

/** Meta's Graph API; the version moves with Meta's deprecation calendar. */
export const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export class GraphInstagramProvider implements InstagramProvider {
  readonly name = "graph" as const;
  constructor(private readonly accessToken: string) {}

  async sendMessage(recipientId: string, text: string): Promise<{ externalId: string | null }> {
    const res = await fetch(`${GRAPH_API_BASE}/me/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text },
        access_token: this.accessToken,
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      message_id?: string;
      error?: { message?: string };
    } | null;
    if (!res.ok) {
      throw new Error(
        `instagram: send failed (${res.status}) ${data?.error?.message ?? ""}`.trim(),
      );
    }
    return { externalId: data?.message_id ?? null };
  }

  async fetchProfile(userId: string): Promise<InstagramProfile | null> {
    const url = new URL(`${GRAPH_API_BASE}/${encodeURIComponent(userId)}`);
    url.searchParams.set("fields", "name,username");
    url.searchParams.set("access_token", this.accessToken);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      name?: string;
      username?: string;
    } | null;
    return data ? { name: data.name ?? null, username: data.username ?? null } : null;
  }
}

let fake: FakeInstagramProvider | undefined;

export function createInstagramProvider(
  config: { isEnabled: boolean; pageAccessToken: string } | null,
): InstagramProvider {
  if (config?.isEnabled && config.pageAccessToken) {
    return new GraphInstagramProvider(config.pageAccessToken);
  }
  fake ??= new FakeInstagramProvider();
  return fake;
}

/** Meta signs each delivery: `X-Hub-Signature-256: sha256=<HMAC of the raw body with the app secret>`. */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const presented = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
