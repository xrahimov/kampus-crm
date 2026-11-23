import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";

/*
 * The app's line to the Kampus server (A-203). The same /api/v1 the website
 * uses; the app names itself with `x-kampus-app`, and carries its session token
 * in an Authorization header instead of a cookie.
 */

/** The server. A web build served by Kampus itself talks to its own address. */
export const API_ORIGIN: string = (
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "" : "https://kampus.center")
).replace(/\/$/, "");

export const APP_VERSION: string = Application.nativeApplicationVersion ?? "1.0.0";

/** "KampusApp/1.0.0 (Android 15; SM-F966B)": what the list of signed-in devices shows. */
const USER_AGENT = `KampusApp/${APP_VERSION} (${
  Platform.OS === "ios"
    ? Device.deviceType === Device.DeviceType.TABLET
      ? "iPadOS"
      : "iOS"
    : "Android"
} ${Device.osVersion ?? ""}; ${Device.modelName ?? "device"})`;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    meta?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  readonly meta?: Record<string, unknown>;
  constructor(status: number, body: ApiErrorBody["error"]) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
    this.meta = body.meta;
  }
}

/** The server could not be reached at all: no network, or the server is down. */
export class NetworkError extends Error {
  constructor() {
    super("mobile.offline");
    this.name = "NetworkError";
  }
}

let sessionToken: string | null = null;
let onSessionLost: (() => void) | null = null;

/** The token every request carries from now on; null signs requests out. */
export function setApiToken(token: string | null): void {
  sessionToken = token;
}

/** Called when the server no longer knows the token (signed out elsewhere, expired). */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

/** What a picture, a PDF or a video behind the session is asked for with. */
export function sessionHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "x-kampus-app": APP_VERSION };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  return headers;
}

export function apiUrl(path: string): string {
  return `${API_ORIGIN}/api/v1${path}`;
}

export interface ApiInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Send no session token (the sign-in calls). */
  anonymous?: boolean;
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-kampus-app": APP_VERSION,
  };
  // A browser sets its own User-Agent and refuses another.
  if (Platform.OS !== "web") headers["User-Agent"] = USER_AGENT;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const token = init.anonymous ? null : sessionToken;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: init.method ?? "GET",
      headers,
      // The token is the whole credential: no cookies travel either way.
      credentials: "omit",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new NetworkError();
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const body = (data as ApiErrorBody | null)?.error;
    if (response.status === 401 && token && token === sessionToken) onSessionLost?.();
    throw new ApiError(
      response.status,
      body ?? {
        code: "INTERNAL",
        message: response.status === 404 ? "errors.notFound" : "errors.internal",
      },
    );
  }
  return data as T;
}
