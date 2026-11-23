import { api, ApiError, NetworkError, setApiToken, setSessionLostHandler } from "@/lib/api";

const fetchMock = jest.fn();

function answer(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  setApiToken(null);
  setSessionLostHandler(null);
});

describe("the app's calls to Kampus (A-203)", () => {
  it("marks itself as the app and sends the token as a Bearer header, never cookies", async () => {
    setApiToken("token-abcdefghijklmnopqrstuvwxyz");
    fetchMock.mockResolvedValue(answer(200, { ok: true }));
    await api("/today");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/today$/);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-kampus-app"]).toBeTruthy();
    expect(headers.Authorization).toBe("Bearer token-abcdefghijklmnopqrstuvwxyz");
    expect(init.credentials).toBe("omit");
  });

  it("sends no token on the sign-in calls", async () => {
    setApiToken("token-abcdefghijklmnopqrstuvwxyz");
    fetchMock.mockResolvedValue(answer(200, { ok: true }));
    await api("/auth/login", { method: "POST", body: { phone: "+998900000004" }, anonymous: true });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init.body).toBe(JSON.stringify({ phone: "+998900000004" }));
  });

  it("turns the server's refusal into an error with its message key and fields", async () => {
    fetchMock.mockResolvedValue(
      answer(400, {
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { phone: ["validation.phone"] },
        },
      }),
    );
    const error = await api("/auth/login", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe("errors.validation");
    expect((error as ApiError).fields).toEqual({ phone: ["validation.phone"] });
  });

  it("says the session is lost when the server no longer knows the token", async () => {
    const lost = jest.fn();
    setSessionLostHandler(lost);
    setApiToken("token-abcdefghijklmnopqrstuvwxyz");
    fetchMock.mockResolvedValue(
      answer(401, { error: { code: "UNAUTHENTICATED", message: "errors.unauthenticated" } }),
    );
    await expect(api("/today")).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("does not sign the person out for a wrong password", async () => {
    const lost = jest.fn();
    setSessionLostHandler(lost);
    fetchMock.mockResolvedValue(
      answer(401, { error: { code: "UNAUTHENTICATED", message: "errors.invalidCredentials" } }),
    );
    await expect(
      api("/auth/login", { method: "POST", body: {}, anonymous: true }),
    ).rejects.toThrow();
    expect(lost).not.toHaveBeenCalled();
  });

  it("reports no connection as its own error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(api("/today")).rejects.toBeInstanceOf(NetworkError);
  });

  it("returns nothing for an empty answer", async () => {
    fetchMock.mockResolvedValue(answer(204));
    await expect(
      api("/lessons/1/attendance", { method: "PUT", body: {} }),
    ).resolves.toBeUndefined();
  });
});
