import { notifyManager } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import type { StudentHome } from "@/api/types";
import { StudentHomeScreen } from "@/features/student/home-screen";
import { answer, clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/lib/layout", () => ({ useLayout: () => ({ wide: false, width: 390 }) }));
jest.mock("@/features/shared/device-settings", () => ({ DeviceSettings: () => null }));
const mockSignOut = jest.fn(async () => undefined);
jest.mock("@/lib/session", () => ({ useSession: () => ({ signOut: mockSignOut }) }));

/*
 * "Delete my account" on the student's home (A-267): the app stores ask that an
 * account opened in the app can be deleted in it. Each test plays the server.
 */

notifyManager.setScheduler(queueMicrotask);

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockSignOut.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

const HOME: StudentHome = {
  account: { id: "a1", name: "Lola", phone: "+998901112233", hasPassword: true },
  profiles: [],
  signedInWith: "PASSWORD",
};

function serve(remove: () => Response) {
  fetchMock.mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    const path = url.split("?")[0]!;
    if (method === "GET" && path.endsWith("/student-auth/home")) return answer(200, HOME);
    if (method === "DELETE" && path.endsWith("/student-auth/account")) return remove();
    return answer(404, { error: { code: "errors.notFound", message: "errors.notFound" } });
  });
}

const removals = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => init?.method === "DELETE" && url.endsWith("/student-auth/account"),
  );

describe("a student deletes their own account", () => {
  it("asks first, deletes on the second press and forgets the sign-in on this device", async () => {
    serve(() => answer(200, { ok: true }));
    await renderScreen(<StudentHomeScreen />);
    await fireEvent.press(await screen.findByTestId("delete-account"));
    // The question says what goes and what the centre keeps; nothing is sent yet.
    expect(await screen.findByText("Delete your account?")).toBeOnTheScreen();
    expect(screen.getByText(/stays with the centre/)).toBeOnTheScreen();
    expect(removals()).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("delete-account-confirm-confirm"));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(removals()).toHaveLength(1);
  });

  it("keeps the account and the sign-in when the server refuses, and says why", async () => {
    serve(() => answer(500, { error: { code: "errors.internal", message: "errors.internal" } }));
    await renderScreen(<StudentHomeScreen />);
    await fireEvent.press(await screen.findByTestId("delete-account"));
    await fireEvent.press(await screen.findByTestId("delete-account-confirm-confirm"));
    await waitFor(() => expect(removals()).toHaveLength(1));
    expect(await screen.findByText(/Unexpected error/)).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("stays as it is after Cancel, and opens the site's page about deleting", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    serve(() => answer(200, { ok: true }));
    await renderScreen(<StudentHomeScreen />);
    await fireEvent.press(await screen.findByTestId("delete-account"));
    await fireEvent.press(await screen.findByTestId("delete-account-confirm-cancel"));
    expect(removals()).toHaveLength(0);
    expect(mockSignOut).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("delete-account-more"));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/en\/delete-account$/));
    open.mockRestore();
  });
});
