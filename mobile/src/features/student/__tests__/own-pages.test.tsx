import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { Linking, Share } from "react-native";

import type { ClassPage, PayOptions, Portal, PortalSchedule, PortalTelegram } from "@/api/types";
import { ClassScreen } from "@/features/student/class-screen";
import { InviteScreen } from "@/features/student/invite-screen";
import { PAY_POLL_MS, PayScreen } from "@/features/student/pay-screen";
import { ResultsScreen } from "@/features/student/results-screen";
import { ScheduleScreen } from "@/features/student/schedule-screen";
import { TelegramScreen } from "@/features/student/telegram-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({ type: "opened" })),
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      canGoBack: () => true,
      replace: jest.fn(),
    }),
    useLocalSearchParams: () => ({ token: "tok" }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});

/*
 * What a student arranges for themselves in the app (A-216): lesson times and
 * the time zone, paying online, Telegram, the invite code and certificates.
 * Each test plays the server and reads what the app shows and what it sends.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;

const NO_PAY: PayOptions = {
  providers: [],
  suggestedAmount: 0,
  suggestedMonth: "2026-11-01",
  months: ["2026-11-01"],
};

function portal(change: Partial<Portal> = {}, pay: PayOptions = NO_PAY) {
  return {
    portal: {
      student: { fullName: "Demo Student One", coins: 12, timeZone: null },
      group: {
        name: "Aziz 1:1",
        courseName: "General English",
        teachers: ["Demo Teacher"],
        endDate: "2027-03-01",
      },
      nextLesson: null,
      lessons: [],
      stats: { lessonsHeld: 3, attendancePercent: 100, gradeAverage: 4.5 },
      money: { monthlyPrice: 500000, balance: 0, nextPaymentDate: null, payments: [] },
      packages: null,
      exams: [],
      tests: [],
      ...change,
    } satisfies Portal,
    pay,
  };
}

const page = (change: Partial<ClassPage> = {}): ClassPage => ({
  organizationName: "Demo centre",
  groupName: "Aziz 1:1",
  studentName: "Demo Student One",
  enabled: true,
  roomId: null,
  schedule: [
    { weekday: 2, startTime: "09:00", endTime: "10:00" },
    { weekday: 4, startTime: "09:00", endTime: "10:00" },
  ],
  timeZone: null,
  localSchedule: null,
  ...change,
});

/** Two days from today in the centre's calendar: always inside the days the picker offers. */
const soon = new Date(Date.now() + 5 * 3_600_000 + 2 * 86_400_000).toISOString().slice(0, 10);

const schedule = (change: Partial<PortalSchedule> = {}): PortalSchedule => ({
  rules: {
    enabled: true,
    hours: 12,
    workStart: "08:00",
    workEnd: "12:00",
    stepMinutes: 60,
    bookingLimit: 2,
    bookedAhead: 0,
  },
  upcoming: [
    {
      id: "u1",
      date: soon,
      startTime: "09:00",
      endTime: "10:00",
      topic: "Past simple",
      canChange: true,
      deadline: "2026-11-25T16:00:00.000Z",
    },
    {
      id: "u2",
      date: "2026-11-24",
      startTime: "09:00",
      endTime: "10:00",
      topic: null,
      canChange: false,
      deadline: "2026-11-23T16:00:00.000Z",
    },
  ],
  cancelled: [],
  hasAvailability: false,
  slots: [],
  ...change,
});

/** Plays the server: each address ending answers with what the test set for it. */
function serve(answers: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url, init) => {
    const path = url.split("?")[0]!;
    const method = init?.method ?? "GET";
    for (const [key, body] of Object.entries(answers)) {
      const [verb, tail] = key.includes(" ") ? key.split(" ") : ["GET", key];
      if (verb === method && path.endsWith(tail!)) {
        const made = typeof body === "function" ? body(sentBody(init)) : body;
        return made instanceof Object && "status" in made && "ok" in made
          ? (made as Response)
          : answer(made === undefined ? 204 : 200, made);
      }
    }
    return answer(404, { error: { code: "NOT_FOUND", message: "errors.notFound" } });
  });
}

function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  openBrowser.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  clearClients();
  globalThis.fetch = realFetch;
});

describe("the schedule in the app", () => {
  it("shows the weekly times and the next lessons, with nothing to change in a group", async () => {
    serve({
      "/portal": portal(),
      "/class/tok": page(),
      "/schedule": schedule({ rules: { ...schedule().rules, enabled: false } }),
    });
    await renderScreen(<ScheduleScreen />);
    expect(await screen.findByTestId("weekly-2")).toHaveTextContent(/Tuesday.*09:00–10:00/);
    expect(screen.getByTestId("weekly-4")).toHaveTextContent(/Thursday/);
    expect(screen.getByTestId("upcoming-u1")).toHaveTextContent(/Past simple/);
    expect(screen.queryByTestId("move-u1")).toBeNull();
    expect(screen.queryByTestId("booking")).toBeNull();
    expect(screen.queryByTestId("rule")).toBeNull();
  });

  it("shows the times in the student's own zone when they set one", async () => {
    serve({
      "/portal": portal(),
      "/class/tok": page({
        timeZone: "Europe/Berlin",
        localSchedule: [{ weekday: 2, startTime: "05:00", endTime: "06:00" }],
      }),
      "/schedule": schedule(),
    });
    await renderScreen(<ScheduleScreen />);
    expect(await screen.findByTestId("weekly-2")).toHaveTextContent(/05:00–06:00/);
    expect(screen.getByTestId("weekly")).toHaveTextContent(/Times in your zone, Europe\/Berlin/);
    // Single lessons stay in the centre's time, and the page says so.
    expect(screen.getByTestId("centre-times")).toHaveTextContent(/Asia\/Tashkent/);
  });

  it("moves a lesson to a day and a start the student picks", async () => {
    const moved = schedule();
    moved.upcoming[0] = { ...moved.upcoming[0]!, startTime: "10:00", endTime: "11:00" };
    serve({
      "/portal": portal(),
      "/class/tok": page(),
      "/schedule": schedule(),
      "POST /u1/move": moved,
    });
    await renderScreen(<ScheduleScreen />);
    expect(await screen.findByTestId("rule")).toHaveTextContent(/up to 12 hours/);
    // A lesson past the window says so and has no buttons.
    expect(screen.getByTestId("too-late-u2")).toBeTruthy();
    expect(screen.queryByTestId("move-u2")).toBeNull();

    await fireEvent.press(screen.getByTestId("move-u1"));
    const picker = screen.getByTestId("pick-time");
    // The centre works 8 to 12 and the lesson is an hour: 11:00 is the last start.
    expect(within(picker).getByTestId("pick-start-11:00")).toBeTruthy();
    expect(within(picker).queryByTestId("pick-start-12:00")).toBeNull();
    expect(within(picker).getByTestId("pick-save")).toBeDisabled();
    await fireEvent.press(within(picker).getByTestId(`pick-day-${soon}`));
    await fireEvent.press(within(picker).getByTestId("pick-start-10:00"));
    expect(within(picker).getByTestId("pick-chosen")).toHaveTextContent(/10:00–11:00/);
    await fireEvent.press(within(picker).getByTestId("pick-save"));

    await waitFor(() => expect(screen.queryByTestId("pick-time")).toBeNull());
    expect(sentBody(calls("POST", "/u1/move")[0]![1])).toEqual({
      date: soon,
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(screen.getByTestId("upcoming-u1")).toHaveTextContent(/10:00–11:00/);
  });

  it("keeps the picker open and says why when the server refuses the time", async () => {
    serve({
      "/portal": portal(),
      "/class/tok": page(),
      "/schedule": schedule(),
      "POST /u1/move": () =>
        answer(409, { error: { code: "CONFLICT", message: "errors.rescheduleTooLate" } }),
    });
    await renderScreen(<ScheduleScreen />);
    await fireEvent.press(await screen.findByTestId("move-u1"));
    await fireEvent.press(screen.getByTestId(`pick-day-${soon}`));
    await fireEvent.press(screen.getByTestId("pick-start-08:00"));
    await fireEvent.press(screen.getByTestId("pick-save"));
    expect(await screen.findByTestId("pick-problem")).toBeTruthy();
    expect(screen.getByTestId("pick-time")).toBeTruthy();
  });

  it("cancels a lesson only after a second press", async () => {
    const after = schedule({
      upcoming: [schedule().upcoming[1]!],
      cancelled: [
        {
          dayOffId: "d1",
          date: soon,
          startTime: "09:00",
          endTime: "10:00",
          reason: "@student.cancelled",
        },
      ],
    });
    serve({
      "/portal": portal(),
      "/class/tok": page(),
      "/schedule": schedule(),
      "POST /u1/cancel": after,
    });
    await renderScreen(<ScheduleScreen />);
    await fireEvent.press(await screen.findByTestId("cancel-u1"));
    expect(calls("POST", "/u1/cancel")).toHaveLength(0);
    // "Keep the lesson" backs out.
    await fireEvent.press(screen.getByTestId("cancel-no-u1"));
    expect(screen.queryByTestId("cancel-ask-u1")).toBeNull();

    await fireEvent.press(screen.getByTestId("cancel-u1"));
    await fireEvent.press(screen.getByTestId("cancel-yes-u1"));
    expect(await screen.findByTestId("cancelled-d1")).toHaveTextContent(/cancelled by you/);
    expect(calls("POST", "/u1/cancel")).toHaveLength(1);
    expect(screen.queryByTestId("upcoming-u1")).toBeNull();
  });

  it("picks a new time for a lesson taken off, from the teacher's free times", async () => {
    const slots = [
      { date: soon, startTime: "08:00", endTime: "09:00" },
      { date: soon, startTime: "11:00", endTime: "12:00" },
    ];
    const waiting = schedule({
      cancelled: [
        {
          dayOffId: "d1",
          date: soon,
          startTime: "09:00",
          endTime: "10:00",
          reason: "Teacher is ill",
        },
      ],
      hasAvailability: true,
      slots,
    });
    serve({
      "/portal": portal(),
      "/class/tok": page(),
      "/schedule": waiting,
      "POST /rebook/d1": schedule({ hasAvailability: true, slots: [slots[0]!] }),
    });
    await renderScreen(<ScheduleScreen />);
    expect(await screen.findByTestId("cancelled-d1")).toHaveTextContent(/Teacher is ill/);
    await fireEvent.press(screen.getByTestId("rebook-d1"));
    await fireEvent.press(screen.getByTestId(`pick-slot-${soon}-11:00`));
    expect(screen.getByTestId("pick-chosen")).toHaveTextContent(/11:00–12:00/);
    await fireEvent.press(screen.getByTestId("pick-save"));
    await waitFor(() => expect(screen.queryByTestId("cancelled")).toBeNull());
    expect(sentBody(calls("POST", "/rebook/d1")[0]![1])).toEqual({
      date: soon,
      startTime: "11:00",
      endTime: "12:00",
    });
  });

  it("books an extra lesson while the student may, and not past the limit", async () => {
    const full = schedule({ rules: { ...schedule().rules, bookedAhead: 2 } });
    serve({
      "/portal": portal(),
      "/class/tok": page(),
      "/schedule": schedule(),
      "POST /book": full,
    });
    await renderScreen(<ScheduleScreen />);
    expect(await screen.findByTestId("booking-left")).toHaveTextContent(/2 more/);
    await fireEvent.press(screen.getByTestId("book"));
    await fireEvent.press(screen.getByTestId(`pick-day-${soon}`));
    await fireEvent.press(screen.getByTestId("pick-start-09:00"));
    await fireEvent.press(screen.getByTestId("pick-save"));
    await waitFor(() => expect(screen.getByTestId("booking-left")).toHaveTextContent(/0 more/));
    expect(sentBody(calls("POST", "/book")[0]![1])).toEqual({
      date: soon,
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(screen.queryByTestId("book")).toBeNull();
  });

  it("finds a time zone by city, saves it, and goes back to the centre's time", async () => {
    let zone: string | null = null;
    serve({
      "/portal": portal(),
      "/class/tok": () => page({ timeZone: zone }),
      "/schedule": schedule(),
      "POST /time-zone": (body: { timeZone: string | null }) => {
        zone = body.timeZone;
        return undefined;
      },
    });
    await renderScreen(<ScheduleScreen />);
    expect(await screen.findByTestId("time-zone-current")).toHaveTextContent(/the centre's time/);
    expect(screen.queryByTestId("time-zone-centre")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("time-zone-search"), "zzz");
    expect(screen.getByTestId("time-zone-none")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("time-zone-search"), "new york");
    await fireEvent.press(screen.getByTestId("time-zone-pick-America/New_York"));
    await waitFor(() =>
      expect(screen.getByTestId("time-zone-current")).toHaveTextContent(/America\/New_York/),
    );
    expect(sentBody(calls("POST", "/time-zone")[0]![1])).toEqual({ timeZone: "America/New_York" });

    await fireEvent.press(screen.getByTestId("time-zone-centre"));
    await waitFor(() => expect(screen.queryByTestId("time-zone-centre")).toBeNull());
    expect(sentBody(calls("POST", "/time-zone")[1]![1])).toEqual({ timeZone: null });
  });
});

describe("paying online in the app", () => {
  const pay: PayOptions = {
    providers: ["PAYME", "CLICK"],
    suggestedAmount: 400000,
    suggestedMonth: "2026-11-01",
    months: ["2026-10-01", "2026-11-01", "2026-12-01"],
  };

  it("starts a payment, opens the provider's page and shows when the money landed", async () => {
    jest.useFakeTimers();
    let asked = 0;
    serve({
      "/portal": portal({}, pay),
      "POST /pay": { id: "o1", url: "https://checkout.example/o1" },
      "/pay/o1": () => {
        asked += 1;
        return {
          id: "o1",
          provider: "CLICK",
          status: asked < 2 ? "PENDING" : "PAID",
          amount: 350000,
          effectiveMonth: "2026-12-01",
        };
      },
    });
    await renderScreen(<PayScreen />);
    const amount = await screen.findByTestId("pay-amount");
    expect(amount.props.value).toBe("400000");
    await fireEvent.changeText(amount, "350 000 so'm");
    await fireEvent.press(screen.getByTestId("pay-month-2026-12-01"));
    await fireEvent.press(screen.getByTestId("pay-click"));

    await waitFor(() => expect(openBrowser).toHaveBeenCalled());
    expect(openBrowser.mock.calls[0]![0]).toBe("https://checkout.example/o1");
    expect(sentBody(calls("POST", "/pay")[0]![1])).toEqual({
      provider: "CLICK",
      amount: 350000,
      effectiveMonth: "2026-12-01",
    });
    expect(screen.getByTestId("pay-outcome")).toHaveTextContent(/Checking your payment/);
    // The student may have closed the provider's page: another try is allowed at once.
    expect(screen.getByTestId("pay-payme")).not.toBeDisabled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(PAY_POLL_MS);
    });
    expect(screen.getByTestId("pay-outcome")).toHaveTextContent(/Checking your payment/);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PAY_POLL_MS);
    });
    expect(screen.getByTestId("pay-outcome")).toHaveTextContent(/was received/);
    // The balance is asked for again.
    expect(calls("GET", "/portal").length).toBeGreaterThan(1);
  });

  it("says the payment was not completed, and refuses too small a sum", async () => {
    jest.useFakeTimers();
    serve({
      "/portal": portal({}, pay),
      "POST /pay": { id: "o2", url: "https://checkout.example/o2" },
      "/pay/o2": {
        id: "o2",
        provider: "PAYME",
        status: "CANCELLED",
        amount: 400000,
        effectiveMonth: "2026-11-01",
      },
    });
    await renderScreen(<PayScreen />);
    await fireEvent.changeText(await screen.findByTestId("pay-amount"), "500");
    expect(screen.getByTestId("pay-payme")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("pay-amount"), "400000");
    await fireEvent.press(screen.getByTestId("pay-payme"));
    await waitFor(() => expect(openBrowser).toHaveBeenCalled());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PAY_POLL_MS);
    });
    expect(screen.getByTestId("pay-outcome")).toHaveTextContent(/not completed/);
  });

  it("says so when the centre takes no payments online", async () => {
    serve({ "/portal": portal() });
    await renderScreen(<PayScreen />);
    expect(await screen.findByText(/does not take payments online yet/)).toBeTruthy();
    expect(screen.queryByTestId("pay")).toBeNull();
  });
});

describe("Telegram and the invite code in the app", () => {
  it("opens the centre's bot, then removes a connected chat", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    let state: PortalTelegram = {
      link: "https://t.me/kampus_bot?start=abc",
      chats: [{ chatId: "77", name: "Aziz", linkedAt: "2026-11-20T08:00:00.000Z" }],
    };
    serve({
      "/telegram": () => state,
      "DELETE /telegram/77": () => {
        state = { ...state, chats: [] };
        return undefined;
      },
      "/portal": portal(),
    });
    await renderScreen(<TelegramScreen />);
    expect(await screen.findByTestId("telegram-chat-77")).toHaveTextContent("Connected: Aziz");
    await fireEvent.press(screen.getByTestId("telegram-connect"));
    expect(open).toHaveBeenCalledWith("https://t.me/kampus_bot?start=abc");
    expect(screen.getByTestId("telegram-watching")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("telegram-remove-77"));
    await waitFor(() => expect(screen.queryByTestId("telegram-chat-77")).toBeNull());
    expect(calls("DELETE", "/telegram/77")).toHaveLength(1);
    expect(screen.getByTestId("telegram-connect")).toHaveTextContent("Connect Telegram");
  });

  it("says so when the centre has no bot yet", async () => {
    serve({ "/telegram": { link: null, chats: [] }, "/portal": portal() });
    await renderScreen(<TelegramScreen />);
    expect(await screen.findByTestId("telegram-not-ready")).toBeTruthy();
    expect(screen.queryByTestId("telegram-connect")).toBeNull();
  });

  it("shows the invite code and shares the link", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });
    serve({
      "/referral": {
        code: "JV5TBF",
        link: "https://kampus.example/en/forms/site?ref=JV5TBF",
        joined: 2,
      },
      "/portal": portal(),
    });
    await renderScreen(<InviteScreen />);
    expect(await screen.findByTestId("invite-code")).toHaveTextContent("JV5TBF");
    expect(screen.getByTestId("invite-joined")).toHaveTextContent(
      "2 friends have joined through you.",
    );
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/referral?locale=en"))).toBe(true);
    await fireEvent.press(screen.getByTestId("invite-share"));
    expect(share).toHaveBeenCalledWith({
      message: "https://kampus.example/en/forms/site?ref=JV5TBF",
    });
  });

  it("opens and shares a certificate from Results", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });
    serve({
      "/portal": portal(),
      "/gradebook": { courseName: "General English", categories: [], final: null, level: null },
      "/badges": [],
      "/certificates": [
        {
          id: "c1",
          number: "KC-0007",
          title: "General English",
          level: "B1",
          issuedAt: "2026-11-01",
          url: "https://kampus.example/en/cert/abc",
        },
      ],
    });
    await renderScreen(<ResultsScreen />);
    expect(await screen.findByTestId("certificate-c1")).toHaveTextContent(
      /General English, B1.*KC-0007/,
    );
    await fireEvent.press(screen.getByTestId("certificate-open-c1"));
    expect(openBrowser.mock.calls[0]![0]).toBe("https://kampus.example/en/cert/abc");
    await fireEvent.press(screen.getByTestId("certificate-share-c1"));
    expect(share).toHaveBeenCalledWith({ message: "https://kampus.example/en/cert/abc" });
  });
});

describe("a group's page with everything in the app", () => {
  it("lists the schedule, Telegram and the invite code, and offers paying online", async () => {
    serve({
      "/portal": portal(
        {
          money: { monthlyPrice: 500000, balance: -450000, nextPaymentDate: null, payments: [] },
          packages: {
            purchased: 8,
            used: 3,
            lessonsLeft: 5,
            offers: [{ id: "k1", name: "Eight lessons", lessons: 8, price: 800000 }],
          },
        },
        { ...NO_PAY, providers: ["PAYME"] },
      ),
      "/chat": { messages: [], unread: 0 },
      "/announcements": [],
      "/course": { courseName: "General English", total: 0, open: 0, topics: [] },
      "/telegram": { link: "https://t.me/kampus_bot?start=abc", chats: [] },
    });
    await renderScreen(<ClassScreen />);
    expect(await screen.findByTestId("note-telegram")).toHaveTextContent("Not connected");
    expect(screen.getByTestId("package-offers")).toHaveTextContent(/Eight lessons: 8 lessons for/);
    // With paying online at hand, the debt does not send the student to the centre.
    expect(screen.getByTestId("debt")).not.toHaveTextContent(/learning centre/);
    // Nothing on this page leaves the app for the site.
    expect(screen.queryByTestId("open-my-page")).toBeNull();
    for (const [row, pathname] of [
      ["schedule", "/student/schedule/[token]"],
      ["telegram", "/student/telegram/[token]"],
      ["invite", "/student/invite/[token]"],
      ["pay", "/student/pay/[token]"],
    ] as const) {
      await fireEvent.press(screen.getByTestId(`open-${row}`));
      expect(mockPush).toHaveBeenLastCalledWith({ pathname, params: { token: "tok" } });
    }
  });

  it("has no pay button when the centre takes no payments online", async () => {
    serve({
      "/portal": portal(),
      "/chat": { messages: [], unread: 0 },
      "/announcements": [],
      "/course": { courseName: "General English", total: 0, open: 0, topics: [] },
      "/telegram": {
        link: null,
        chats: [{ chatId: "1", name: null, linkedAt: "2026-11-20T08:00:00.000Z" }],
      },
    });
    await renderScreen(<ClassScreen />);
    expect(await screen.findByTestId("note-telegram")).toHaveTextContent("1 chat connected");
    expect(screen.queryByTestId("open-pay")).toBeNull();
    await settle();
  });
});
