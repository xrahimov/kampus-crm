import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import type { Account, AccountSession } from "@/api/account";
import { AccountScreen } from "@/features/account/account-screen";
import { nativeRoute } from "@/features/office/site-paths";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
let mockWide = false;
jest.mock("@/lib/layout", () => ({
  useLayout: () => ({ wide: mockWide, width: mockWide ? 1180 : 390 }),
}));

/*
 * "My account" in the app (A-261): the password, the Telegram sign-in code
 * and the devices, as the site's page has them. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockWide = false;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

type Routes = Record<string, unknown | (() => unknown)>;
function serve(routes: Routes) {
  fetchMock.mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    const path = url.split("?")[0]!;
    const key = Object.keys(routes).find((k) => {
      const [verb, tail] = k.split(" ") as [string, string];
      return verb === method && path.endsWith(tail);
    });
    if (!key) return answer(404, { error: { code: "errors.notFound" } });
    const route = routes[key];
    const body = typeof route === "function" ? (route as () => unknown)() : route;
    if (body && typeof body === "object" && "ok" in body && "status" in body) {
      return body as Response;
    }
    return answer(body === undefined ? 204 : 200, body);
  });
}

function account(change: Partial<Account> = {}): Account {
  return {
    fullName: "Dilnoza Karimova",
    phone: "+998901112233",
    signInCode: "OFF",
    telegramLinked: true,
    mustChangePassword: false,
    passwordChangedAt: "2026-11-01T08:00:00.000Z",
    telegramSession: false,
    userId: "u1",
    deletionRequestedAt: null,
    ...change,
  };
}

function session(change: Partial<AccountSession> = {}): AccountSession {
  return {
    id: "se1",
    device: "Kampus app on iPhone",
    ip: "10.0.0.5",
    createdAt: "2026-11-20T08:00:00.000Z",
    lastSeenAt: "2026-11-24T09:30:00.000Z",
    current: true,
    ...change,
  };
}

const OTHER = session({ id: "se2", device: "Chrome on Windows", ip: null, current: false });

async function show() {
  await renderScreen(<AccountScreen />);
  await screen.findByTestId("account-password");
  await screen.findByTestId("session-se1");
}

describe("the password on My account", () => {
  it("says when it was changed and asks for the current one to change it", async () => {
    serve({ "GET /auth/account": account(), "GET /auth/sessions": { items: [session()] } });
    await show();
    expect(screen.getByTestId("account-password-state")).toHaveTextContent(/Last changed .*2026/);
    expect(screen.queryByTestId("account-password-by-telegram")).toBeNull();
    expect(screen.getByTestId("account-change-password")).toHaveTextContent("Change password");
    await fireEvent.press(screen.getByTestId("account-change-password"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/set-password", params: { current: "1" } });
  });

  it("asks for no current password in a session a Telegram code opened", async () => {
    serve({
      "GET /auth/account": account({ telegramSession: true, mustChangePassword: true }),
      "GET /auth/sessions": { items: [session()] },
    });
    await show();
    expect(screen.getByTestId("account-password-state")).toHaveTextContent(
      "You have no password of your own yet. You sign in with a code from Telegram.",
    );
    expect(screen.getByTestId("account-password-by-telegram")).toBeOnTheScreen();
    expect(screen.getByTestId("account-change-password")).toHaveTextContent("Choose a password");
    await fireEvent.press(screen.getByTestId("account-change-password"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/set-password", params: {} });
  });

  it("says so when the password was never changed", async () => {
    serve({
      "GET /auth/account": account({ passwordChangedAt: null }),
      "GET /auth/sessions": { items: [session()] },
    });
    await show();
    expect(screen.getByTestId("account-password-state")).toHaveTextContent(
      "Not changed since the account was created",
    );
  });
});

describe("the sign-in code by Telegram", () => {
  it("is switched on and off", async () => {
    let now = account();
    serve({
      "GET /auth/account": () => now,
      "GET /auth/sessions": { items: [session()] },
      "PATCH /auth/account": () => {
        now = account({ signInCode: now.signInCode === "OFF" ? "TELEGRAM" : "OFF" });
        return now;
      },
    });
    await show();
    expect(screen.getByTestId("account-code-state")).toHaveTextContent(
      "Only the password is asked for.",
    );
    await fireEvent.press(screen.getByTestId("account-sign-in-code"));
    await waitFor(() => expect(calls("PATCH", "/auth/account")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/auth/account")[0]![1])).toEqual({ signInCode: "TELEGRAM" });
    await waitFor(() =>
      expect(screen.getByTestId("account-code-state")).toHaveTextContent(
        "The code is asked for at every sign-in.",
      ),
    );
    await fireEvent.press(screen.getByTestId("account-sign-in-code"));
    await waitFor(() => expect(calls("PATCH", "/auth/account")).toHaveLength(2));
    expect(sentBody(calls("PATCH", "/auth/account")[1]![1])).toEqual({ signInCode: "OFF" });
  });

  it("cannot be switched on before a Telegram chat is linked", async () => {
    serve({
      "GET /auth/account": account({ telegramLinked: false }),
      "GET /auth/sessions": { items: [session()] },
    });
    await show();
    expect(screen.getByTestId("account-needs-telegram")).toBeOnTheScreen();
    expect(screen.getByTestId("account-sign-in-code")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("account-sign-in-code"));
    expect(calls("PATCH", "/auth/account")).toHaveLength(0);
  });

  it("says why when the server refuses the switch", async () => {
    serve({
      "GET /auth/account": account(),
      "GET /auth/sessions": { items: [session()] },
      "PATCH /auth/account": () =>
        answer(422, {
          error: {
            code: "errors.validation",
            message: "errors.validation",
            fields: { signInCode: ["account.signInCode.needsTelegram"] },
          },
        }),
    });
    await show();
    await fireEvent.press(screen.getByTestId("account-sign-in-code"));
    expect(await screen.findByTestId("account-code-problem")).toHaveTextContent(
      /Your Telegram chat is not linked yet/,
    );
    expect(screen.getByTestId("account-code-state")).toHaveTextContent(
      "Only the password is asked for.",
    );
  });
});

describe("the devices on My account", () => {
  it("lists them, marks this one, and signs another one out", async () => {
    let items = [session(), OTHER];
    serve({
      "GET /auth/account": account(),
      "GET /auth/sessions": () => ({ items }),
      "DELETE /auth/sessions/se2": () => {
        items = [session()];
        return undefined;
      },
    });
    await show();
    expect(screen.getByTestId("session-se1")).toHaveTextContent(/Kampus app on iPhone/);
    expect(screen.getByTestId("session-se1")).toHaveTextContent(/This device/);
    expect(screen.getByTestId("session-se1")).toHaveTextContent(/Address: 10\.0\.0\.5/);
    expect(screen.queryByTestId("session-sign-out-se1")).toBeNull();
    expect(screen.getByTestId("session-se2")).toHaveTextContent(/Chrome on Windows/);
    await fireEvent.press(screen.getByTestId("session-sign-out-se2"));
    await waitFor(() => expect(calls("DELETE", "/auth/sessions/se2")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("session-se2")).toBeNull());
    expect(screen.getByTestId("account-sign-out-others")).toBeDisabled();
  });

  it("signs out everywhere else and says how many there were", async () => {
    let items = [session(), OTHER, session({ id: "se3", device: "Safari on Mac", current: false })];
    serve({
      "GET /auth/account": account(),
      "GET /auth/sessions": () => ({ items }),
      "DELETE /auth/sessions": () => {
        items = [session()];
        return { revoked: 2 };
      },
    });
    await show();
    await fireEvent.press(screen.getByTestId("account-sign-out-others"));
    await waitFor(() => expect(calls("DELETE", "/auth/sessions")).toHaveLength(1));
    expect(await screen.findByTestId("account-signed-out-others")).toHaveTextContent(
      "2 other devices were signed out.",
    );
    await waitFor(() => expect(screen.queryByTestId("session-se3")).toBeNull());
  });

  it("has nothing to sign out with only this device", async () => {
    serve({ "GET /auth/account": account(), "GET /auth/sessions": { items: [session()] } });
    await show();
    expect(screen.getByTestId("account-sign-out-others")).toBeDisabled();
  });

  it("says so when a device cannot be signed out", async () => {
    serve({
      "GET /auth/account": account(),
      "GET /auth/sessions": { items: [session(), OTHER] },
      "DELETE /auth/sessions/se2": () =>
        answer(404, { error: { code: "errors.notFound", message: "errors.notFound" } }),
    });
    await show();
    await fireEvent.press(screen.getByTestId("session-sign-out-se2"));
    expect(await screen.findByTestId("account-sign-out-problem")).toBeOnTheScreen();
  });

  it("stands side by side on a tablet", async () => {
    mockWide = true;
    serve({ "GET /auth/account": account(), "GET /auth/sessions": { items: [session()] } });
    await show();
    expect(screen.getByTestId("account-code")).toBeOnTheScreen();
  });
});

describe("asking for the account to be deleted (A-267)", () => {
  it("asks after a second press, shows the day it was asked, and takes it back", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    serve({
      "GET /auth/account": account(),
      "GET /auth/sessions": { items: [session()] },
      "POST /auth/account/deletion": { requestedAt: "2026-11-25T09:00:00.000Z" },
      "DELETE /auth/account/deletion": { ok: true },
    });
    await show();
    expect(screen.queryByTestId("account-deletion-asked")).toBeNull();
    await fireEvent.press(screen.getByTestId("account-deletion-ask"));
    // Nothing is sent until the person confirms.
    expect(calls("POST", "/auth/account/deletion")).toHaveLength(0);
    expect(await screen.findByText("Ask for your account to be deleted?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("account-deletion-confirm-confirm"));
    expect(await screen.findByTestId("account-deletion-asked")).toHaveTextContent(
      /You asked on .*2026/,
    );
    expect(calls("POST", "/auth/account/deletion")).toHaveLength(1);
    expect(screen.queryByTestId("account-deletion-ask")).toBeNull();

    await fireEvent.press(screen.getByTestId("account-deletion-withdraw"));
    await waitFor(() => expect(screen.queryByTestId("account-deletion-asked")).toBeNull());
    expect(calls("DELETE", "/auth/account/deletion")).toHaveLength(1);
    expect(screen.getByTestId("account-deletion-ask")).toBeOnTheScreen();

    // What goes and what the centre keeps is the site's page, in the app's language.
    await fireEvent.press(screen.getByTestId("account-deletion-more"));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/en\/delete-account$/));
    open.mockRestore();
  });

  it("shows an earlier request, and says so when the server refuses a new one", async () => {
    serve({
      "GET /auth/account": account(),
      "GET /auth/sessions": { items: [session()] },
      "POST /auth/account/deletion": () =>
        answer(500, { error: { code: "errors.internal", message: "errors.internal" } }),
    });
    await show();
    await fireEvent.press(screen.getByTestId("account-deletion-ask"));
    await fireEvent.press(await screen.findByTestId("account-deletion-confirm-confirm"));
    await waitFor(() => expect(calls("POST", "/auth/account/deletion")).toHaveLength(1));
    // The question stays open with the reason; the account is as it was.
    expect(await screen.findByTestId("account-deletion-confirm-confirm")).toBeOnTheScreen();
    expect(screen.queryByTestId("account-deletion-asked")).toBeNull();
  });
});

describe("the site's address of My account", () => {
  it("opens the app's screen", () => {
    expect(nativeRoute("/account")).toBe("/staff/account");
    expect(nativeRoute("/account/salary")).toBe("/staff/salary");
  });
});
