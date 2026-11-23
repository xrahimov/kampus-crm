/* What the sign-in calls of /api/v1 answer the app with (A-196, A-203). */

export type Door = "STAFF" | "STUDENT";
export type Side = "staff" | "student";

export interface SignInOptions {
  /** A bot can send a Telegram code on this address. */
  code: boolean;
  bot: { username: string | null; url: string | null };
  brand: { name: string; logoUrl: string | null } | null;
}

export type PasswordResponse =
  | { ok: true; to: Side; token: string }
  /** The password was right; a Telegram code is asked for after it (A-124). */
  | { ok: false; challenge: { id: string; expiresAt: string } };

export interface CodeTicket {
  id: string;
  expiresAt: string;
}

export interface JoinCentreOption {
  id: string;
  name: string;
  branches: Array<{ id: string; name: string }>;
}

export type JoinState =
  | { state: "draft"; token: string; fullName: string; centres: JoinCentreOption[] }
  | { state: "sent"; centre: string | null }
  | { state: "declined"; centre: string | null };

export type VerifyResponse =
  { ok: true; to: Side; offerPassword: boolean; token: string } | { ok: false; join: JoinState };

/** "+998 90 123-45-67" typed any way → "+998901234567", or null when it is not a phone. */
export function normalizePhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, "");
  return /^\+\d{10,15}$/.test(compact) ? compact : null;
}
