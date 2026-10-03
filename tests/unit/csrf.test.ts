import { describe, expect, it } from "vitest";

import { CSRF_HEADER } from "@/lib/auth/constants";
import { assertCsrf } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";

function request(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/v1/x", { method: "POST", headers });
}

describe("assertCsrf", () => {
  it("accepts a matching token from the same origin", () => {
    expect(() =>
      assertCsrf(
        request({ host: "localhost:3000", origin: "http://localhost:3000", [CSRF_HEADER]: "tok" }),
        "tok",
      ),
    ).not.toThrow();
  });

  it("rejects a missing token", () => {
    expect(() =>
      assertCsrf(request({ host: "localhost:3000", origin: "http://localhost:3000" }), "tok"),
    ).toThrow(AppError);
  });

  it("rejects a wrong token", () => {
    expect(() =>
      assertCsrf(
        request({ host: "localhost:3000", origin: "http://localhost:3000", [CSRF_HEADER]: "nope" }),
        "tok",
      ),
    ).toThrow(AppError);
  });

  it("rejects a foreign origin even with the right token", () => {
    let caught: unknown;
    try {
      assertCsrf(
        request({ host: "localhost:3000", origin: "https://evil.example", [CSRF_HEADER]: "tok" }),
        "tok",
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("FORBIDDEN");
  });

  it("rejects when the session has no csrf secret", () => {
    expect(() =>
      assertCsrf(
        request({ host: "localhost:3000", origin: "http://localhost:3000", [CSRF_HEADER]: "tok" }),
        null,
      ),
    ).toThrow(AppError);
  });
});
