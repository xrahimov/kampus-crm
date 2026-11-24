import { screen, waitFor } from "@testing-library/react-native";

import type { Today } from "@/api/types";
import { TodayScreen } from "@/features/staff/today-screen";
import { answer, clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
let mockParams: { date?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));

/*
 * Today on a day asked for from elsewhere (A-253): the summary's "not marked"
 * opens the day it counted, as the site's "/today?date=…" does.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

function day(date: string): Today {
  return {
    date,
    today: "2026-11-24",
    lessons: [],
    next: null,
    debtors: [],
    debtorCount: 0,
    debtTotal: 0,
    canMark: true,
    canSeeBalances: false,
  };
}

beforeEach(() => {
  mockParams = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => {
    const asked = /[?&]date=([^&]+)/.exec(url)?.[1];
    return answer(200, day(asked ?? "2026-11-24"));
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});
const asked = () => fetchMock.mock.calls.map(([url]) => url.split("/today")[1]);

describe("the day Today opens on", () => {
  it("is the server's own today when no day was asked for", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByText("Today")).toBeTruthy());
    expect(asked()).toEqual([""]);
  });

  it("is the day asked for, named in the header", async () => {
    mockParams = { date: "2026-11-23" };
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByText("Monday, Nov 23")).toBeTruthy());
    expect(asked()).toEqual(["?date=2026-11-23"]);
  });

  it("is today when what was asked for is not a day", async () => {
    mockParams = { date: "tomorrow" };
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByText("Today")).toBeTruthy());
    expect(asked()).toEqual([""]);
  });
});
