import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
} from "node:crypto";

/*
 * "Log in with Telegram" (A-150): Telegram's OpenID Connect flow
 * (core.telegram.org/bots/telegram-login). The centre's bot is the OAuth
 * client; BotFather → the bot → Login Widget shows its Client ID and Client
 * Secret and holds the allowed redirect URLs. The `phone` scope returns the
 * Telegram-verified phone number, which is what ties a login to a student the
 * centre already has.
 *
 * Tests and local runs without a bot use the fake provider, switched on only by
 * TELEGRAM_LOGIN_FAKE=1 in the environment (never on a real server): its
 * authorisation codes carry the claims themselves.
 */

export const TELEGRAM_OAUTH_BASE = "https://oauth.telegram.org";
const ISSUER = "https://oauth.telegram.org";
/** Tokens issued longer ago than this are refused even when not yet expired. */
const MAX_TOKEN_AGE_SECONDS = 10 * 60;
const JWKS_TTL_MS = 60 * 60 * 1000;

export interface TelegramIdentity {
  /** Telegram's numeric user id, as a string (the same id bot updates carry). */
  telegramUserId: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
  /** Digits only as Telegram gives them, e.g. "998901234567"; null without the phone scope. */
  phone: string | null;
}

export interface TelegramLoginClient {
  clientId: string;
  clientSecret: string;
}

export interface TelegramLoginProvider {
  readonly name: "fake" | "telegram";
  authorizeUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string;
  exchange(input: {
    client: TelegramLoginClient;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<TelegramIdentity>;
}

export class TelegramLoginError extends Error {}

/** PKCE S256: the challenge sent with the authorisation request. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid profile phone",
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${TELEGRAM_OAUTH_BASE}/auth?${params.toString()}`;
}

interface IdTokenClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  iat?: number;
  exp?: number;
  nonce?: string;
  id?: number | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  phone_number?: string;
  phone_number_verified?: boolean;
}

/** The identity a verified token describes; the phone only when Telegram vouches for it. */
export function identityFromClaims(claims: IdTokenClaims): TelegramIdentity {
  const id = claims.id ?? claims.sub;
  if (id === undefined || id === null || String(id).trim() === "") {
    throw new TelegramLoginError("telegram login: token has no user id");
  }
  const name =
    claims.name?.trim() ||
    [claims.given_name, claims.family_name].filter(Boolean).join(" ").trim() ||
    claims.preferred_username ||
    "Telegram";
  const phone =
    claims.phone_number && claims.phone_number_verified !== false
      ? claims.phone_number.replace(/\D/g, "") || null
      : null;
  return {
    telegramUserId: String(id),
    name: name.slice(0, 200),
    username: claims.preferred_username?.slice(0, 64) ?? null,
    photoUrl: claims.picture?.startsWith("https://") ? claims.picture.slice(0, 500) : null,
    phone,
  };
}

/** Checks issuer, audience, lifetime and nonce of decoded claims (signature checked by the caller). */
export function checkClaims(
  claims: IdTokenClaims,
  input: { clientId: string; nonce: string },
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  if (claims.iss !== ISSUER) throw new TelegramLoginError("telegram login: wrong issuer");
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
  if (!aud.includes(String(input.clientId))) {
    throw new TelegramLoginError("telegram login: wrong audience");
  }
  if (typeof claims.exp !== "number" || claims.exp < nowSeconds - 30) {
    throw new TelegramLoginError("telegram login: token expired");
  }
  if (typeof claims.iat === "number" && claims.iat < nowSeconds - MAX_TOKEN_AGE_SECONDS) {
    throw new TelegramLoginError("telegram login: token too old");
  }
  // Telegram's docs do not promise to echo the nonce in the redirect flow; when it does, it must match.
  if (claims.nonce !== undefined && claims.nonce !== input.nonce) {
    throw new TelegramLoginError("telegram login: nonce mismatch");
  }
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

type Jwk = JsonWebKey & { kid?: string; alg?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;

async function loadJwks(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(`${TELEGRAM_OAUTH_BASE}/.well-known/jwks.json`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new TelegramLoginError(`telegram login: jwks ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  jwksCache = { at: Date.now(), keys: data.keys ?? [] };
  return jwksCache.keys;
}

/** Verifies an RS256 / ES256 compact JWT against Telegram's published keys; returns its claims. */
export async function verifyIdToken(
  token: string,
  keys: (force: boolean) => Promise<Jwk[]> = loadJwks,
): Promise<IdTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TelegramLoginError("telegram login: malformed token");
  const [h, p, s] = parts as [string, string, string];
  const header = decodeSegment<{ alg?: string; kid?: string }>(h);
  if (header.alg !== "RS256" && header.alg !== "ES256") {
    throw new TelegramLoginError(`telegram login: unsupported alg ${header.alg}`);
  }
  const pick = (list: Jwk[]) =>
    list.find(
      (k) => (header.kid ? k.kid === header.kid : true) && (!k.alg || k.alg === header.alg),
    );
  let jwk = pick(await keys(false));
  if (!jwk) jwk = pick(await keys(true)); // keys rotated since we cached them
  if (!jwk) throw new TelegramLoginError("telegram login: signing key not found");
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const data = Buffer.from(`${h}.${p}`);
  const signature = Buffer.from(s, "base64url");
  const ok =
    header.alg === "RS256"
      ? verifySignature("sha256", data, key, signature)
      : verifySignature("sha256", data, { key, dsaEncoding: "ieee-p1363" }, signature);
  if (!ok) throw new TelegramLoginError("telegram login: bad signature");
  return decodeSegment<IdTokenClaims>(p);
}

export class OidcTelegramLoginProvider implements TelegramLoginProvider {
  readonly name = "telegram" as const;
  authorizeUrl = authorizeUrl;

  async exchange(input: {
    client: TelegramLoginClient;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<TelegramIdentity> {
    const basic = Buffer.from(`${input.client.clientId}:${input.client.clientSecret}`).toString(
      "base64",
    );
    const res = await fetch(`${TELEGRAM_OAUTH_BASE}/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: input.client.clientId,
        code_verifier: input.codeVerifier,
      }).toString(),
    });
    const data = (await res.json().catch(() => null)) as {
      id_token?: string;
      error?: string;
      error_description?: string;
    } | null;
    if (!res.ok || !data?.id_token) {
      throw new TelegramLoginError(
        `telegram login: token ${res.status} ${data?.error ?? ""} ${data?.error_description ?? ""}`.trim(),
      );
    }
    const claims = await verifyIdToken(data.id_token);
    checkClaims(claims, { clientId: input.client.clientId, nonce: input.nonce });
    return identityFromClaims(claims);
  }
}

/** Codes the fake provider accepts: "fake." + base64url JSON of the claims to return. */
export function fakeTelegramCode(claims: {
  id: number | string;
  name?: string;
  preferred_username?: string;
  phone_number?: string;
}): string {
  return `fake.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
}

export class FakeTelegramLoginProvider implements TelegramLoginProvider {
  readonly name = "fake" as const;
  authorizeUrl = authorizeUrl;

  async exchange(input: { code: string }): Promise<TelegramIdentity> {
    if (!input.code.startsWith("fake.")) throw new TelegramLoginError("fake login: bad code");
    const claims = decodeSegment<IdTokenClaims>(input.code.slice(5));
    return identityFromClaims({ ...claims, phone_number_verified: true });
  }
}

export function isFakeTelegramLogin(): boolean {
  return process.env.TELEGRAM_LOGIN_FAKE === "1";
}

export function createTelegramLoginProvider(): TelegramLoginProvider {
  return isFakeTelegramLogin() ? new FakeTelegramLoginProvider() : new OidcTelegramLoginProvider();
}
