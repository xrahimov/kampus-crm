import { notifyManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Linking } from "react-native";

import type {
  CashClose,
  CashCloseList,
  CashDayPreview,
  DebtCase,
  DebtContact,
  DebtList,
} from "@/api/office-money";
import { CashDeskScreen } from "@/features/money/cashdesk-screen";
import { DebtsScreen } from "@/features/money/debts-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { centreToday } from "@/lib/days";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
let mockArrived: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockArrived,
  useFocusEffect: () => undefined,
}));
const mockOpenOnSite = jest.fn<Promise<void>, [string]>();
jest.mock("@/lib/web", () => ({ openOnSite: (path: string) => mockOpenOnSite(path) }));
let mockPermissions: string[] = [];
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
let mockActive: { id: string; name: string } | null = null;
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    roles: [{ code: "ADMIN", name: "Admin" }],
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockActive,
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * Debts and the cash desk in the app (A-236): the debtors with what was said
 * to them, and the cashiers' day closes with "Close the day" and the
 * hand-over. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

// An answer is told to the screen in the same breath it arrives in, not a timer later: a
// redraw then never falls between two steps of a test, where React would not expect it.
beforeAll(() => notifyManager.setScheduler((flush) => queueMicrotask(flush)));
afterAll(() => notifyManager.setScheduler((flush) => setTimeout(flush, 0)));

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockOpenOnSite.mockReset();
  mockOpenOnSite.mockResolvedValue();
  mockArrived = {};
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockActive = { id: "b1", name: "Chilonzor" };
  mockPermissions = ["payments.create", "students.view"];
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(async () => {
  await settled();
  client = null;
  clearClients();
  globalThis.fetch = realFetch;
});

let client: QueryClient | null = null;
async function show(element: ReactElement): Promise<void> {
  client = await renderScreen(element);
}

/** Lets every answer arrive and be drawn, all of it inside React's `act`. */
async function settled(): Promise<void> {
  const asked = client;
  if (!asked) return;
  await act(async () => {
    for (let turn = 0; turn < 100; turn++) {
      await new Promise((done) => setTimeout(done, 5));
      if (turn > 0 && asked.isFetching() + asked.isMutating() === 0) break;
    }
  });
}

function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}
/** The question part of the last call of that kind. */
function asked(method: string, tail: string): URLSearchParams {
  const last = calls(method, tail).at(-1);
  return new URLSearchParams(last ? (last[0].split("?")[1] ?? "") : "");
}

type Routes = Record<string, unknown | ((url: string) => unknown)>;
/** A route answers with a body, or with a whole answer (a refusal) made by `answer`. */
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
    const body = typeof route === "function" ? (route as (url: string) => unknown)(url) : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

function debt(change: Partial<DebtCase> = {}): DebtCase {
  return {
    id: "d1",
    studentId: "s1",
    studentName: "Jasur Aliyev",
    phone: "+998 90 123 45 67",
    parentPhone: "+998 91 765 43 21",
    branchId: "b1",
    branchName: "Chilonzor",
    groups: [
      { membershipId: "m1", groupId: "g1", groupName: "GE-Morning A1", balance: -700 },
      { membershipId: "m2", groupId: "g2", groupName: "IELTS 6.5", balance: 100 },
    ],
    amount: 700,
    openedAt: "2026-11-01T05:00:00.000Z",
    daysOverdue: 23,
    status: "OPEN",
    promisedAt: null,
    promisedAmount: null,
    promiseMissed: false,
    brokenPromises: 0,
    lastContactAt: null,
    lastChannel: null,
    lastOutcome: null,
    lastContactBy: null,
    needsCall: true,
    telegramAt: null,
    smsAt: null,
    closedAt: null,
    closedReason: null,
    hasTelegram: true,
    ...change,
  };
}

function debts(items: DebtCase[], change: Partial<DebtList> = {}): DebtList {
  return {
    items,
    page: 1,
    pageSize: 30,
    total: items.length,
    summary: { debtors: items.length, amount: 900, promised: 1, needsCall: 2 },
    ...change,
  };
}

const PROMISED = debt({
  id: "d2",
  studentId: "s2",
  studentName: "Malika Yusupova",
  phone: null,
  parentPhone: null,
  amount: 200,
  status: "PROMISED",
  needsCall: false,
  promisedAt: "2026-11-28",
  promisedAmount: 200,
  brokenPromises: 1,
  lastContactAt: "2026-11-20T09:00:00.000Z",
  lastChannel: "CALL",
  lastOutcome: "PROMISED",
  lastContactBy: "Dilnoza Karimova",
  telegramAt: "2026-11-10T09:00:00.000Z",
});

describe("the debtors", () => {
  it("shows the four figures and a card for each debtor", async () => {
    serve({ "GET /debts": debts([debt(), PROMISED]) });
    await show(<DebtsScreen />);

    const card = await screen.findByTestId("debt-d1");
    expect(screen.getByText("2 debtors")).toBeTruthy();
    expect(screen.getByTestId("debts-summary-debtors")).toHaveTextContent(/Debtors2/);
    expect(screen.getByTestId("debts-summary-amount")).toHaveTextContent(/900/);
    expect(screen.getByTestId("debts-summary-promised")).toHaveTextContent(/1$/);
    expect(screen.getByTestId("debts-summary-needsCall")).toHaveTextContent(/Need a call2/);

    expect(card).toHaveTextContent(/Jasur Aliyev/);
    expect(screen.getByTestId("debt-d1-amount")).toHaveTextContent(/700/);
    expect(screen.getByTestId("debt-d1-call")).toHaveTextContent("Call");
    // Only the groups that are short are named.
    expect(card).toHaveTextContent(/GE-Morning A1/);
    expect(card).not.toHaveTextContent(/IELTS/);
    expect(screen.getByTestId("debt-d1-overdue")).toHaveTextContent(/23 days, since Nov 1, 2026/);
    expect(screen.getByTestId("debt-d1-contact")).toHaveTextContent("Nobody has called yet");

    expect(screen.getByTestId("debt-d2-promise")).toHaveTextContent(/Promise: Nov 28, 2026/);
    expect(screen.getByTestId("debt-d2")).toHaveTextContent(/1 promise missed/);
    expect(screen.getByTestId("debt-d2-contact")).toHaveTextContent(
      /Last contact: Nov 20, 2026, Call, Promised to pay, by Dilnoza Karimova/,
    );
    expect(screen.getByTestId("debt-d2")).toHaveTextContent(/Telegram sent/);
    expect(screen.queryByTestId("debt-d2-phone")).toBeNull();

    // The list as the site first shows it: open and promised, the longest overdue first.
    const first = asked("GET", "/debts");
    expect(first.get("sort")).toBe("openedAt:asc");
    expect(first.get("pageSize")).toBe("30");
    expect(first.get("status")).toBeNull();
    expect(first.get("branchId")).toBeNull();
    // One branch is chosen at the top of the app: no branch to pick here.
    expect(screen.queryByTestId("debts-branch")).toBeNull();
  });

  it("asks again with the filter, the order and what is searched for", async () => {
    serve({ "GET /debts": debts([debt()]) });
    await show(<DebtsScreen />);
    await screen.findByTestId("debt-d1");

    await fireEvent.press(screen.getByTestId("debts-status"));
    await fireEvent.press(await screen.findByTestId("debts-status-option-NEEDS_CALL"));
    await waitFor(() => expect(asked("GET", "/debts").get("status")).toBe("NEEDS_CALL"));

    await fireEvent.press(screen.getByTestId("debts-sort"));
    await fireEvent.press(await screen.findByTestId("debts-sort-option-amount"));
    await waitFor(() => expect(asked("GET", "/debts").get("sort")).toBe("amount:desc"));

    await fireEvent.changeText(screen.getByTestId("debts-search"), " Jasur ");
    await waitFor(() => expect(asked("GET", "/debts").get("q")).toBe("Jasur"));
    expect(asked("GET", "/debts").get("status")).toBe("NEEDS_CALL");
  });

  it("offers the branch only to someone who sees several and chose none", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    mockActive = null;
    serve({ "GET /debts": debts([debt()]) });
    await show(<DebtsScreen />);
    await screen.findByTestId("debt-d1");

    await fireEvent.press(screen.getByTestId("debts-branch"));
    await fireEvent.press(await screen.findByTestId("debts-branch-option-b2"));
    await waitFor(() => expect(asked("GET", "/debts").get("branchId")).toBe("b2"));
  });

  it("opens with what a notification asked for", async () => {
    mockArrived = { status: "OPEN", q: "Jasur Aliyev", branchId: "b1" };
    serve({ "GET /debts": debts([debt()]) });
    await show(<DebtsScreen />);
    await screen.findByTestId("debt-d1");

    const first = asked("GET", "/debts");
    expect(first.get("status")).toBe("OPEN");
    expect(first.get("q")).toBe("Jasur Aliyev");
    expect(first.get("branchId")).toBe("b1");
    expect(screen.getByTestId("debts-search").props.value).toBe("Jasur Aliyev");
  });

  it("loads the next page on Show more", async () => {
    serve({
      "GET /debts": (url: string) =>
        url.includes("page=2")
          ? debts([PROMISED], { page: 2, total: 31 })
          : debts([debt()], { total: 31 }),
    });
    await show(<DebtsScreen />);
    await screen.findByTestId("debt-d1");
    expect(screen.queryByTestId("debt-d2")).toBeNull();

    await fireEvent.press(screen.getByTestId("debts-more"));
    await screen.findByTestId("debt-d2");
    expect(screen.getByTestId("debt-d1")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("debts-more")).toBeNull());
  });

  it("says so when nobody owes anything", async () => {
    serve({
      "GET /debts": debts([], { summary: { debtors: 0, amount: 0, promised: 0, needsCall: 0 } }),
    });
    await show(<DebtsScreen />);
    expect(await screen.findByText("No debtors here.")).toBeTruthy();
    expect(screen.getByText("No debtors")).toBeTruthy();
  });

  it("dials the student's number from the card", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    serve({ "GET /debts": debts([debt()]) });
    await show(<DebtsScreen />);
    await fireEvent.press(await screen.findByTestId("debt-d1-phone"));
    expect(open).toHaveBeenCalledWith("tel:+998901234567");
    open.mockRestore();
  });

  it("writes down a call with a promise, and wants the promised day", async () => {
    serve({ "GET /debts": debts([debt()]), "POST /debts/d1/contacts": { id: "c9" } });
    await show(<DebtsScreen />);
    await fireEvent.press(await screen.findByTestId("debt-d1"));
    await fireEvent.press(await screen.findByTestId("debt-do-call"));

    // Both numbers are at hand, the parent's marked.
    expect(await screen.findByTestId("debt-contact-phone")).toHaveTextContent("+998 90 123 45 67");
    expect(screen.getByTestId("debt-contact-parent")).toHaveTextContent(/parent/);
    expect(screen.queryByTestId("debt-contact-promised-at")).toBeNull();

    await fireEvent.press(screen.getByTestId("debt-contact-outcome"));
    await fireEvent.press(await screen.findByTestId("debt-contact-outcome-option-PROMISED"));
    await fireEvent.press(screen.getByTestId("debt-contact-save"));
    expect(await screen.findByText("Required.")).toBeTruthy();
    expect(calls("POST", "/debts/d1/contacts")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("debt-contact-promised-at"), "30112026");
    await fireEvent.changeText(screen.getByTestId("debt-contact-promised-amount"), "500 000");
    await fireEvent.changeText(screen.getByTestId("debt-contact-note"), " Pays on Monday ");
    await fireEvent.press(screen.getByTestId("debt-contact-save"));

    await waitFor(() => expect(calls("POST", "/debts/d1/contacts")).toHaveLength(1));
    expect(sentBody(calls("POST", "/debts/d1/contacts")[0]![1])).toEqual({
      channel: "CALL",
      outcome: "PROMISED",
      promisedAt: "2026-11-30",
      promisedAmount: 500000,
      note: "Pays on Monday",
    });
    // The list is asked for again: the case now carries the promise.
    await waitFor(() => expect(calls("GET", "/debts").length).toBeGreaterThan(1));
  });

  it("logs a plain note without an outcome, and shows the server's refusal", async () => {
    serve({
      "GET /debts": debts([debt()]),
      "POST /debts/d1/contacts": answer(409, {
        error: { code: "CONFLICT", message: "errors.conflict" },
      }),
    });
    await show(<DebtsScreen />);
    await fireEvent.press(await screen.findByTestId("debt-d1"));
    await fireEvent.press(await screen.findByTestId("debt-do-log"));
    await fireEvent.changeText(await screen.findByTestId("debt-contact-note"), "Mother came in");
    await fireEvent.press(screen.getByTestId("debt-contact-save"));

    expect(await screen.findByTestId("debt-contact-problem")).toBeTruthy();
    expect(sentBody(calls("POST", "/debts/d1/contacts")[0]![1])).toEqual({
      channel: "NOTE",
      outcome: null,
      promisedAt: null,
      promisedAmount: null,
      note: "Mother came in",
    });
  });

  it("sends a Telegram reminder and says how many chats it reached", async () => {
    let queued = 2;
    serve({ "GET /debts": debts([debt()]), "POST /debts/d1/remind": () => ({ queued }) });
    await show(<DebtsScreen />);
    await fireEvent.press(await screen.findByTestId("debt-d1"));
    await fireEvent.press(await screen.findByTestId("debt-do-remind"));
    expect(await screen.findByTestId("debts-reminded")).toHaveTextContent(
      "Reminder sent to 2 Telegram chats.",
    );

    queued = 0;
    await fireEvent.press(screen.getByTestId("debt-d1"));
    await fireEvent.press(await screen.findByTestId("debt-do-remind"));
    await waitFor(() =>
      expect(screen.getByTestId("debts-reminded")).toHaveTextContent(
        "This student has no Telegram chat connected yet.",
      ),
    );
  });

  it("shows what was said before, with what the server did on its own", async () => {
    const lines: DebtContact[] = [
      {
        id: "c2",
        channel: "CALL",
        outcome: "PROMISED",
        promisedAt: "2026-11-28",
        promisedAmount: 200,
        note: "Will pay after salary",
        auto: false,
        createdBy: "Dilnoza Karimova",
        createdAt: "2026-11-20T09:00:00.000Z",
      },
      {
        id: "c1",
        channel: "TELEGRAM",
        outcome: null,
        promisedAt: null,
        promisedAmount: null,
        note: null,
        auto: true,
        createdBy: null,
        createdAt: "2026-11-10T09:00:00.000Z",
      },
    ];
    serve({ "GET /debts": debts([PROMISED]), "GET /debts/d2/contacts": lines });
    await show(<DebtsScreen />);
    await fireEvent.press(await screen.findByTestId("debt-d2"));
    await fireEvent.press(await screen.findByTestId("debt-do-history"));

    const call = await screen.findByTestId("debt-contact-c2");
    expect(screen.getByTestId("debt-history-sum")).toHaveTextContent(/23 days, 1 promise missed/);
    expect(call).toHaveTextContent(/Call/);
    expect(call).toHaveTextContent(/Promised to pay/);
    expect(call).toHaveTextContent(/by Nov 28, 2026/);
    expect(call).toHaveTextContent(/Will pay after salary/);
    expect(call).toHaveTextContent(/by Dilnoza Karimova/);
    expect(screen.getByTestId("debt-contact-c1")).toHaveTextContent(/Telegram/);
    expect(screen.getByTestId("debt-contact-c1")).toHaveTextContent(/automatic/);
  });

  it("leaves a closed case its history and the student's page only", async () => {
    const closed = debt({ status: "CLOSED", closedReason: "PAID", needsCall: false });
    serve({ "GET /debts": debts([closed]) });
    await show(<DebtsScreen />);
    await fireEvent.press(await screen.findByTestId("debt-d1"));
    await screen.findByTestId("debt-do-history");
    expect(screen.getByTestId("debt-d1")).toHaveTextContent(/Paid/);
    expect(screen.queryByTestId("debt-do-call")).toBeNull();
    expect(screen.queryByTestId("debt-do-log")).toBeNull();
    expect(screen.queryByTestId("debt-do-remind")).toBeNull();

    await fireEvent.press(screen.getByTestId("debt-do-profile"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });
  });

  it("does not offer the student's page to someone who may not open students", async () => {
    mockPermissions = ["payments.create"];
    serve({ "GET /debts": debts([debt()]) });
    await show(<DebtsScreen />);
    await fireEvent.press(await screen.findByTestId("debt-d1"));
    await screen.findByTestId("debt-do-history");
    expect(screen.queryByTestId("debt-do-profile")).toBeNull();
  });
});

function close(change: Partial<CashClose> = {}): CashClose {
  return {
    id: "c1",
    branchId: "b1",
    branchName: "Chilonzor",
    cashierId: "u2",
    cashierName: "Sevara Tosheva",
    date: "2026-11-23",
    methods: [],
    paymentsCount: 4,
    received: 900,
    expectedCash: 600,
    hasCashMethod: true,
    countedCash: 550,
    difference: -50,
    note: "One note torn",
    acceptedById: null,
    acceptedByName: null,
    acceptedAt: null,
    ...change,
  };
}

const ACCEPTED = close({
  id: "c2",
  date: "2026-11-22",
  countedCash: 620,
  difference: 20,
  note: null,
  acceptedById: "u9",
  acceptedByName: "Hakim Erkinov",
  acceptedAt: "2026-11-22T15:00:00.000Z",
});

function closes(items: CashClose[]): CashCloseList {
  return {
    items,
    totals: {
      expectedCash: 1200,
      countedCash: 1170,
      difference: -30,
      pending: items.filter((c) => !c.acceptedAt).length,
    },
  };
}

function day(change: Partial<CashDayPreview> = {}): CashDayPreview {
  return {
    branchId: "b1",
    branchName: "Chilonzor",
    cashierId: "u1",
    cashierName: "Dilnoza Karimova",
    date: centreToday(),
    methods: [
      {
        methodId: "pm1",
        name: "Cash",
        isCash: true,
        payments: 700,
        income: 0,
        refunds: 60,
        expenses: 40,
        net: 600,
      },
      {
        methodId: "pm2",
        name: "Card",
        isCash: false,
        payments: 300,
        income: 0,
        refunds: 0,
        expenses: 0,
        net: 300,
      },
    ],
    paymentsCount: 4,
    received: 1000,
    expectedCash: 600,
    hasCashMethod: true,
    existing: null,
    ...change,
  };
}

describe("the cash desk", () => {
  it("lists the day closes of this month with their totals", async () => {
    serve({ "GET /cashdesk": closes([close(), ACCEPTED]) });
    await show(<CashDeskScreen />);

    const card = await screen.findByTestId("cash-c1");
    const today = centreToday();
    const first = asked("GET", "/cashdesk");
    expect(first.get("year")).toBe(today.slice(0, 4));
    expect(first.get("month")).toBe(String(Number(today.slice(5, 7))));
    expect(first.get("branchId")).toBeNull();

    expect(card).toHaveTextContent(/Mon, Nov 23, 2026/);
    expect(card).toHaveTextContent(/Chilonzor/);
    // Whose close it is, is for those who see the finances.
    expect(card).not.toHaveTextContent(/Sevara Tosheva/);
    expect(card).toHaveTextContent(/4 payments/);
    expect(card).toHaveTextContent(/One note torn/);
    expect(screen.getByTestId("cash-c1-status")).toHaveTextContent("Awaiting hand-over");
    expect(screen.getByTestId("cash-c1-difference")).toHaveTextContent(/^-.*50/);
    expect(screen.getByTestId("cash-c2-status")).toHaveTextContent("Accepted by Hakim Erkinov");
    expect(screen.getByTestId("cash-c2-difference")).toHaveTextContent(/^\+.*20/);

    expect(screen.getByTestId("cash-totals")).toHaveTextContent(/1,?200/);
    expect(screen.getByTestId("cash-totals-difference")).toHaveTextContent(/^-.*30/);
    expect(screen.getByTestId("cash-pending")).toHaveTextContent("1 awaiting hand-over");
    // Accepting is the manager's.
    expect(screen.queryByTestId("cash-c1-accept")).toBeNull();
    expect(screen.getByTestId("cash-close-day")).toBeTruthy();
  });

  it("asks for another month, the whole year and another year", async () => {
    serve({ "GET /cashdesk": closes([close()]) });
    await show(<CashDeskScreen />);
    await screen.findByTestId("cash-c1");
    const thisYear = Number(centreToday().slice(0, 4));

    await fireEvent.press(screen.getByTestId("cash-month"));
    await fireEvent.press(await screen.findByTestId("cash-month-option-3"));
    await waitFor(() => expect(asked("GET", "/cashdesk").get("month")).toBe("3"));

    await fireEvent.press(screen.getByTestId("cash-month"));
    await fireEvent.press(await screen.findByTestId("cash-month-option-all"));
    await waitFor(() => expect(asked("GET", "/cashdesk").get("month")).toBeNull());

    await fireEvent.press(screen.getByTestId("cash-year"));
    await fireEvent.press(await screen.findByTestId(`cash-year-option-${thisYear - 1}`));
    await waitFor(() => expect(asked("GET", "/cashdesk").get("year")).toBe(String(thisYear - 1)));
  });

  it("lets a manager accept a close, and names the cashier", async () => {
    mockPermissions = ["finance.view", "finance.update"];
    let accepted = false;
    serve({
      "GET /cashdesk": () =>
        closes([
          accepted
            ? close({ acceptedAt: "2026-11-24T04:00:00.000Z", acceptedByName: "Dilnoza Karimova" })
            : close(),
          ACCEPTED,
        ]),
      "POST /cashdesk/c1/accept": () => {
        accepted = true;
        return close();
      },
    });
    await show(<CashDeskScreen />);
    expect(await screen.findByTestId("cash-c1")).toHaveTextContent(/Sevara Tosheva/);
    // Someone who only sees the finances does not close days.
    expect(screen.queryByTestId("cash-close-day")).toBeNull();
    // A close already accepted has nothing to accept.
    expect(screen.queryByTestId("cash-c2-accept")).toBeNull();

    await fireEvent.press(screen.getByTestId("cash-c1-accept"));
    await waitFor(() => expect(calls("POST", "/cashdesk/c1/accept")).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("cash-c1-status")).toHaveTextContent(
        "Accepted by Dilnoza Karimova",
      ),
    );
    expect(screen.queryByTestId("cash-c1-accept")).toBeNull();
  });

  it("shows why a close could not be accepted", async () => {
    mockPermissions = ["finance.view", "finance.update"];
    serve({
      "GET /cashdesk": closes([close()]),
      "POST /cashdesk/c1/accept": answer(403, {
        error: { code: "FORBIDDEN", message: "errors.forbidden" },
      }),
    });
    await show(<CashDeskScreen />);
    await fireEvent.press(await screen.findByTestId("cash-c1-accept"));
    expect(await screen.findByTestId("cash-accept-problem")).toBeTruthy();
  });

  it("opens the sheet to print on the site", async () => {
    serve({ "GET /cashdesk": closes([close()]) });
    await show(<CashDeskScreen />);
    await fireEvent.press(await screen.findByTestId("cash-c1-print"));
    expect(mockOpenOnSite).toHaveBeenCalledWith("/en/cashdesk/c1");
  });

  it("offers the branch only to someone who sees several and chose none", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    mockActive = null;
    serve({ "GET /cashdesk": closes([close()]) });
    await show(<CashDeskScreen />);
    await screen.findByTestId("cash-c1");
    await fireEvent.press(screen.getByTestId("cash-branch"));
    await fireEvent.press(await screen.findByTestId("cash-branch-option-b2"));
    await waitFor(() => expect(asked("GET", "/cashdesk").get("branchId")).toBe("b2"));
  });

  it("says so when no day was closed in the period", async () => {
    serve({ "GET /cashdesk": closes([]) });
    await show(<CashDeskScreen />);
    expect(await screen.findByText("No day closes in this period.")).toBeTruthy();
    expect(screen.queryByTestId("cash-totals")).toBeNull();
  });

  it("closes the day: the day's figures, the counted cash and the difference", async () => {
    serve({
      "GET /cashdesk": closes([]),
      "GET /cashdesk/preview": day(),
      "POST /cashdesk": close(),
    });
    await show(<CashDeskScreen />);
    await fireEvent.press(await screen.findByTestId("cash-close-day"));

    const cash = await screen.findByTestId("cash-method-pm1");
    const today = centreToday();
    expect(asked("GET", "/cashdesk/preview").get("branchId")).toBe("b1");
    expect(asked("GET", "/cashdesk/preview").get("date")).toBe(today);
    expect(cash).toHaveTextContent(/Cash \(cash\)/);
    expect(cash).toHaveTextContent(/Payments: .*700.*Refunds: .*60.*Expenses: .*40/);
    expect(screen.getByTestId("cash-method-pm2")).toHaveTextContent(/Card/);
    expect(screen.getByTestId("cash-method-pm2")).not.toHaveTextContent(/Refunds/);
    expect(screen.getByTestId("cash-close-expected")).toHaveTextContent(/600/);
    expect(screen.getByTestId("cash-close-difference")).toHaveTextContent("—");
    // One branch: nothing to choose.
    expect(screen.queryByTestId("cash-close-branch")).toBeNull();

    // The counted cash is needed.
    await fireEvent.press(screen.getByTestId("cash-close-save"));
    expect(await screen.findByText("Required.")).toBeTruthy();
    expect(calls("POST", "/cashdesk")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("cash-close-counted"), "550");
    expect(screen.getByTestId("cash-close-difference")).toHaveTextContent(/^-.*50/);
    await fireEvent.changeText(screen.getByTestId("cash-close-counted"), "650");
    expect(screen.getByTestId("cash-close-difference")).toHaveTextContent(/^\+.*50/);
    await fireEvent.changeText(screen.getByTestId("cash-close-note"), " Change kept ");
    await fireEvent.press(screen.getByTestId("cash-close-save"));

    await waitFor(() => expect(calls("POST", "/cashdesk")).toHaveLength(1));
    expect(sentBody(calls("POST", "/cashdesk")[0]![1])).toEqual({
      branchId: "b1",
      date: today,
      countedCash: 650,
      note: "Change kept",
    });
    // The list is asked for again with the new close in it.
    await waitFor(() => expect(calls("GET", "/cashdesk").length).toBeGreaterThan(1));
  });

  it("asks for another branch's and another day's figures", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    serve({ "GET /cashdesk": closes([]), "GET /cashdesk/preview": day() });
    await show(<CashDeskScreen />);
    await fireEvent.press(await screen.findByTestId("cash-close-day"));
    await screen.findByTestId("cash-method-pm1");

    await fireEvent.press(screen.getByTestId("cash-close-branch"));
    await fireEvent.press(await screen.findByTestId("cash-close-branch-option-b2"));
    await waitFor(() => expect(asked("GET", "/cashdesk/preview").get("branchId")).toBe("b2"));

    await fireEvent.changeText(screen.getByTestId("cash-close-date"), "02112026");
    await waitFor(() => expect(asked("GET", "/cashdesk/preview").get("date")).toBe("2026-11-02"));
  });

  it("does not count a day that has not come", async () => {
    serve({ "GET /cashdesk": closes([]), "GET /cashdesk/preview": day() });
    await show(<CashDeskScreen />);
    await fireEvent.press(await screen.findByTestId("cash-close-day"));
    await screen.findByTestId("cash-method-pm1");
    const before = calls("GET", "/cashdesk/preview").length;

    await fireEvent.changeText(screen.getByTestId("cash-close-date"), "01012099");
    expect(await screen.findByText("A day in the future cannot be closed.")).toBeTruthy();
    expect(screen.queryByTestId("cash-method-pm1")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("cash-close-counted"), "100");
    await fireEvent.press(screen.getByTestId("cash-close-save"));
    await settled();
    expect(calls("GET", "/cashdesk/preview")).toHaveLength(before);
    expect(calls("POST", "/cashdesk")).toHaveLength(0);
  });

  it("warns when the day was closed before, and stops when it was accepted", async () => {
    let existing: CashDayPreview["existing"] = {
      id: "c1",
      countedCash: 550,
      difference: -50,
      acceptedAt: null,
    };
    serve({
      "GET /cashdesk": closes([]),
      "GET /cashdesk/preview": () => day({ existing, hasCashMethod: false, expectedCash: 0 }),
    });
    await show(<CashDeskScreen />);
    await fireEvent.press(await screen.findByTestId("cash-close-day"));
    expect(await screen.findByTestId("cash-close-again")).toBeTruthy();
    expect(screen.getByTestId("cash-close-no-cash")).toBeTruthy();
    expect(screen.queryByTestId("cash-close-accepted")).toBeNull();
    expect(screen.getByTestId("cash-close-save")).not.toBeDisabled();

    await fireEvent.press(screen.getByTestId("cash-close-close"));
    await settled();
    existing = { ...existing, acceptedAt: "2026-11-24T04:00:00.000Z" };
    await fireEvent.press(screen.getByTestId("cash-close-day"));
    expect(await screen.findByTestId("cash-close-accepted")).toHaveTextContent(
      "This day was already closed and accepted; it cannot be changed.",
    );
    expect(screen.queryByTestId("cash-close-again")).toBeNull();
    expect(screen.getByTestId("cash-close-save")).toBeDisabled();
  });

  it("shows the server's refusal in the sheet", async () => {
    serve({
      "GET /cashdesk": closes([]),
      "GET /cashdesk/preview": day(),
      "POST /cashdesk": answer(409, {
        error: { code: "CONFLICT", message: "errors.cashCloseAccepted" },
      }),
    });
    await show(<CashDeskScreen />);
    await fireEvent.press(await screen.findByTestId("cash-close-day"));
    await screen.findByTestId("cash-method-pm1");
    await fireEvent.changeText(screen.getByTestId("cash-close-counted"), "0");
    await fireEvent.press(screen.getByTestId("cash-close-save"));
    expect(await screen.findByTestId("cash-close-problem")).toHaveTextContent(
      "This day was already closed and accepted; it cannot be changed.",
    );
    expect(sentBody(calls("POST", "/cashdesk")[0]![1])).toMatchObject({ countedCash: 0 });
  });
});
