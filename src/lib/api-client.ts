import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/constants";

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

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Browser-side fetch for `/api/v1`. Sends the session cookie, echoes the CSRF
 * cookie in the header, and turns error responses into `ApiError`.
 */
export async function api<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });

  if (!response.ok) {
    let body: ApiErrorBody["error"] = { code: "INTERNAL", message: "errors.internal" };
    try {
      body = ((await response.json()) as ApiErrorBody).error ?? body;
    } catch {
      // non-JSON error body: keep the generic error
    }
    throw new ApiError(response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Multipart upload; returns the URL to store on the record. `/uploads` takes
 * photos, `/uploads/documents` the wider set homework and materials allow.
 */
export async function uploadFile(
  file: File,
  endpoint: "/uploads" | "/uploads/documents" = "/uploads",
): Promise<{ key: string; url: string; size: number }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const csrf = readCookie(CSRF_COOKIE);
  if (csrf) headers[CSRF_HEADER] = csrf;
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`/api/v1${endpoint}`, {
    method: "POST",
    headers,
    credentials: "same-origin",
    body,
  });
  if (!response.ok) {
    let error: ApiErrorBody["error"] = { code: "INTERNAL", message: "errors.internal" };
    try {
      error = ((await response.json()) as ApiErrorBody).error ?? error;
    } catch {
      // keep the generic error
    }
    throw new ApiError(response.status, error);
  }
  return (await response.json()) as { key: string; url: string; size: number };
}
