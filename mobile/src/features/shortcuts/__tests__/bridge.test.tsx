import { notifyManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react-native";
import * as AppIntents from "expo-app-intents";

import type { StudentHome, Today } from "@/api/types";
import { answer, clearClients, renderScreen } from "@/features/student/test-support";
import type { SessionState } from "@/lib/session";

import { shortcutNote } from "../../../../modules/kampus-call";
import { ShortcutScreen } from "../shortcut-screen";
import { ShortcutsBridge } from "../shortcuts-bridge";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("../../../../modules/kampus-call", () => ({ shortcutNote: { save: jest.fn() } }));
const mockPush = jest.fn();
const mockRedirect = jest.fn();
let mockArrived: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockArrived,
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirect(href);
    return null;
  },
}));
let mockState: SessionState = { status: "signedOut" };
jest.mock("@/lib/session", () => ({
  useSession: () => ({ state: mockState }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * The shortcuts' two moving parts (A-273): the bridge that keeps the phone's
 * note in step with the app and turns Siri's wish into a screen, and the
 * screen that finds the lesson. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const intents = jest.mocked(AppIntents);
const save = jest.mocked(shortcutNote.save);

type Wish = Parameters<Parameters<typeof AppIntents.useAppIntents>[0]>[0][number];
/** Hands the bridge what Siri left, as the phone would. */
async function siriLeaves(wishes: Wish[]) {
  const handler = intents.useAppIntents.mock.calls.at(-1)?.[0];
  await act(async () => {
    await handler?.(wishes, null);
  });
}
const wish = (change: Partial<Wish>): Wish =>
  ({
    id: "w1",
    name: "open",
    params: { what: "start-lesson" },
    createdAt: Date.now(),
    ...change,
  }) as Wish;

const TEACHER: SessionState = {
  status: "staff",
  me: {
    user: {
      id: "u1",
      fullName: "Dilnoza Karimova",
      phone: "+998900000004",
      photoUrl: null,
      mustChangePassword: false,
      hasSalary: false,
    },
    roles: [{ code: "TEACHER", name: "Teacher" }],
    view: { current: "TEACHING", canSwitch: false },
    permissions: [],
    branches: [],
    activeBranch: null,
  },
};

// A day whose one lesson runs around the clock, so that it is "on" whenever the test runs.
const DAY: Today = {
  date: "2026-11-26",
  today: "2026-11-26",
  lessons: [
    {
      id: "l1",
      groupId: "g1",
      groupName: "English A1",
      courseName: "English",
      color: null,
      date: "2026-11-26",
      startTime: "00:00",
      endTime: "23:59",
      roomName: "Room 3",
      topic: null,
      suggestedTopic: null,
      isExtra: false,
      teacherNames: [],
      members: [],
      present: 0,
      marked: 0,
      homework: null,
    },
  ],
  next: null,
  debtors: [],
  debtorCount: 0,
  debtTotal: 0,
  canMark: true,
  canSeeBalances: false,
};

const HOME: StudentHome = {
  account: { id: "a1", name: "Dana", phone: null, hasPassword: true },
  signedInWith: "PASSWORD",
  profiles: [
    {
      studentId: "s1",
      fullName: "Dana",
      relation: "SELF",
      organizationName: "Centre",
      groups: [
        {
          membershipId: "m1",
          token: "tok-1",
          groupName: "English A1",
          courseName: "English",
          teachers: [],
          status: "ACTIVE",
          nextLesson: { date: "2026-11-27", startTime: "10:00", endTime: "11:00" },
          balance: 0,
          nextPaymentDate: null,
          unreadNews: 0,
          live: true,
        },
      ],
      homework: [],
    },
  ],
} as StudentHome;

function serve(routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url) => {
    const path = Object.keys(routes).find((key) => url.includes(key));
    return path ? answer(200, routes[path]) : answer(404, { error: { code: "x" } });
  });
}

beforeAll(() => notifyManager.setScheduler((flush) => queueMicrotask(flush)));
afterAll(() => {
  notifyManager.setScheduler((flush) => setTimeout(flush, 0));
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  mockState = { status: "signedOut" };
  mockArrived = {};
});
afterEach(clearClients);

describe("the bridge between the app and the phone's shortcuts", () => {
  it("writes a teacher's day and what waits to be checked, once both are known", async () => {
    mockState = TEACHER;
    serve({ "/today": DAY, "/homework/queue": { total: 2, items: [] } });
    await renderScreen(<ShortcutsBridge />);
    await waitFor(() => {
      const text = save.mock.calls.at(-1)?.[0];
      expect(text && JSON.parse(text)).toMatchObject({
        kind: "staff",
        toCheck: 2,
        locale: "en",
        lessons: [{ id: "l1", title: "English A1", place: "Room 3" }],
      });
    });
  });

  it("asks the server nothing for a student, and writes what the home screen loaded", async () => {
    mockState = { status: "student" };
    const client = await renderScreen(<ShortcutsBridge />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      client.setQueryData(["student", "home"], HOME);
    });
    await waitFor(() => expect(save).toHaveBeenCalled());
    const text = save.mock.calls.at(-1)?.[0];
    expect(text && JSON.parse(text)).toMatchObject({
      kind: "student",
      toCheck: null,
      lessons: [{ id: "m1", live: true }],
    });
    expect(text).not.toContain("tok-1");
  });

  it("wipes the note when nobody is signed in, and asks the server nothing", async () => {
    await renderScreen(<ShortcutsBridge />);
    await waitFor(() => expect(save).toHaveBeenCalledWith(null));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the shortcut's screen for a wish Siri just left, and removes the wish", async () => {
    mockState = { status: "student" };
    await renderScreen(<ShortcutsBridge />);
    await siriLeaves([wish({})]);
    expect(intents.removePendingInvocationAsync).toHaveBeenCalledWith("w1");
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/shortcut/[what]",
      params: { what: "start-lesson" },
    });
  });

  it("drops a wish that is old, unknown, or left while nobody is signed in", async () => {
    mockState = { status: "student" };
    await renderScreen(<ShortcutsBridge />);
    await siriLeaves([
      wish({ id: "old", createdAt: Date.now() - 10 * 60_000 }),
      wish({ id: "odd", params: { what: "settings" } }),
      wish({ id: "other", name: "somethingElse" }),
    ]);
    expect(mockPush).not.toHaveBeenCalled();
    expect(intents.removePendingInvocationAsync.mock.calls.map(([id]) => id)).toEqual([
      "old",
      "odd",
      "other",
    ]);
  });

  it("does not obey a wish on the sign-in screen", async () => {
    await renderScreen(<ShortcutsBridge />);
    await siriLeaves([wish({})]);
    expect(mockPush).not.toHaveBeenCalled();
    expect(intents.removePendingInvocationAsync).toHaveBeenCalledWith("w1");
  });
});

describe("the screen behind a shortcut", () => {
  it("passes a teacher on to the lesson that is on", async () => {
    mockState = TEACHER;
    mockArrived = { what: "start-lesson" };
    serve({ "/today": DAY });
    await renderScreen(<ShortcutScreen />);
    await waitFor(() =>
      expect(mockRedirect).toHaveBeenCalledWith({
        pathname: "/staff/lesson/[id]",
        params: { id: "l1", date: "2026-11-26" },
      }),
    );
  });

  it("waits, and sends nobody anywhere, while the server has not answered", async () => {
    mockState = TEACHER;
    mockArrived = { what: "next-lesson" };
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));
    await renderScreen(<ShortcutScreen />);
    expect(screen.getByTestId("shortcut-screen")).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("passes a student into the room of the lesson that is on", async () => {
    mockState = { status: "student" };
    mockArrived = { what: "start-lesson" };
    serve({ "/student-auth/home": HOME });
    await renderScreen(<ShortcutScreen />);
    await waitFor(() =>
      expect(mockRedirect).toHaveBeenCalledWith({
        pathname: "/student/room/[token]",
        params: { token: "tok-1" },
      }),
    );
  });

  it("goes to the front door when the server cannot be asked or the wish is unknown", async () => {
    mockState = TEACHER;
    mockArrived = { what: "homework" };
    fetchMock.mockResolvedValue(answer(500, { error: { code: "server" } }));
    await renderScreen(<ShortcutScreen />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/staff"));

    mockRedirect.mockClear();
    mockState = { status: "student" };
    mockArrived = { what: "settings" };
    await renderScreen(<ShortcutScreen />);
    expect(mockRedirect).toHaveBeenCalledWith("/student");
  });
});
