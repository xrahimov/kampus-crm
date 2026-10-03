/**
 * Typed error surface for services and route handlers.
 * `message` is an i18n key (namespace `errors`), never user-facing English.
 */
export type AppErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTEGRATION"
  | "INTERNAL";

export type FieldErrors = Record<string, string[]>;

const STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTEGRATION: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { fields?: FieldErrors; meta?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fields = options.fields;
    this.meta = options.meta;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.meta ? { meta: this.meta } : {}),
      },
    };
  }

  static validation(fields: FieldErrors, message = "errors.validation") {
    return new AppError("VALIDATION", message, { fields });
  }
  static unauthenticated(message = "errors.unauthenticated") {
    return new AppError("UNAUTHENTICATED", message);
  }
  static forbidden(message = "errors.forbidden") {
    return new AppError("FORBIDDEN", message);
  }
  static notFound(message = "errors.notFound") {
    return new AppError("NOT_FOUND", message);
  }
  static conflict(message = "errors.conflict") {
    return new AppError("CONFLICT", message);
  }
  static rateLimited(retryAfterSeconds: number, message = "errors.rateLimited") {
    return new AppError("RATE_LIMITED", message, { meta: { retryAfterSeconds } });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
