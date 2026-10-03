import type { NextRequest } from "next/server";
import type { z } from "zod";

import { SESSION_COOKIE } from "@/lib/auth/constants";
import type { Permission } from "@/lib/rbac/permissions";
import { resolveCurrentUser, type CurrentUser } from "@/server/auth/current-user";
import { assertCsrf, MUTATING_METHODS } from "@/server/auth/csrf";
import { AppError, isAppError } from "@/server/errors/app-error";
import { authorize } from "@/server/rbac/authorize";

import { fieldErrors } from "./list-query";

export interface HandlerContext<TBody, TParams> {
  request: NextRequest;
  params: TParams;
  body: TBody;
  current: CurrentUser;
  ip: string | null;
}

export interface PublicHandlerContext<TBody, TParams> {
  request: NextRequest;
  params: TParams;
  body: TBody;
  current: CurrentUser | null;
  ip: string | null;
}

interface BaseOptions<TBody> {
  /** Zod schema for the JSON body. Required for mutating methods with a body. */
  body?: z.ZodType<TBody>;
  /** Skip the CSRF check (only for the login and csrf endpoints). */
  skipCsrf?: boolean;
}

interface AuthedOptions<TBody> extends BaseOptions<TBody> {
  auth?: true;
  permission?: Permission;
}

interface PublicOptions<TBody> extends BaseOptions<TBody> {
  auth: false;
}

type RouteParams<TParams> = { params: Promise<TParams> };

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorResponse(error: unknown): Response {
  if (isAppError(error)) {
    const headers: Record<string, string> = {};
    const retry = error.meta?.retryAfterSeconds;
    if (typeof retry === "number") headers["Retry-After"] = String(retry);
    return Response.json(error.toJSON(), { status: error.status, headers });
  }
  console.error(error);
  return Response.json(new AppError("INTERNAL", "errors.internal").toJSON(), { status: 500 });
}

async function parseBody<TBody>(request: NextRequest, schema?: z.ZodType<TBody>): Promise<TBody> {
  if (!schema) return undefined as TBody;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw AppError.validation({ _: ["validation.invalidJson"] });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
  return parsed.data;
}

/**
 * Wraps a route handler with: JSON body validation, session lookup, CSRF check
 * for mutating methods, optional permission check, and error → JSON mapping.
 * Authenticated by default; pass `auth: false` for public endpoints.
 */
export function route<TBody = undefined, TParams = Record<string, never>>(
  options: AuthedOptions<TBody>,
  handler: (ctx: HandlerContext<TBody, TParams>) => Promise<Response>,
): (request: NextRequest, context: RouteParams<TParams>) => Promise<Response>;
export function route<TBody = undefined, TParams = Record<string, never>>(
  options: PublicOptions<TBody>,
  handler: (ctx: PublicHandlerContext<TBody, TParams>) => Promise<Response>,
): (request: NextRequest, context: RouteParams<TParams>) => Promise<Response>;
export function route(
  // The overloads above give callers the precise types; the implementation
  // works on the common shape, so it is typed loosely on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: AuthedOptions<any> | PublicOptions<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (ctx: any) => Promise<Response>,
) {
  return async (request: NextRequest, context: RouteParams<unknown>): Promise<Response> => {
    try {
      const ip = clientIp(request);
      const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
      const current = await resolveCurrentUser(token, ip);

      if (options.auth !== false) {
        if (!current) throw AppError.unauthenticated();
        if (options.permission) authorize(current.actor, options.permission);
      }

      if (MUTATING_METHODS.has(request.method) && !options.skipCsrf) {
        assertCsrf(request, current?.session.csrfSecret ?? null);
      }

      const body = await parseBody(request, options.body);
      const params = await context.params;
      return await handler({ request, params, body, current, ip });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
