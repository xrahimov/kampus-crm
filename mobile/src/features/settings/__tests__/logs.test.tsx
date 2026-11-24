import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { ActionRow, CallEntry, LoginRow, SmsLogEntry } from "@/api/office-logs";
import type { Payment } from "@/api/office-students";
import { nativeRoute } from "@/features/office/site-paths";
import { ActionLogScreen, changesOf } from "@/features/settings/action-log-screen";
import { CallsScreen } from "@/features/settings/calls-screen";
import { LoginLogScreen } from "@/features/settings/login-log-screen";
import { PaymentsLogScreen } from "@/features/settings/payments-log-screen";
import { SmsLogScreen } from "@/features/settings/sms-log-screen";
import { answer, clearClients, renderScreen } from "@/features/student/test-support";
import { openOnSite } from "@/lib/web";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));
jest.mock("@/lib/web", () => ({ openOnSite: jest.fn(() => Promise.resolve()) }));
const mockSaveFile = jest.fn<Promise<string>, [string, string]>();
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));
let mockPermissions = ["logs.view", "reports.payments", "staff.view", "payments.create"];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "me" },
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] }, permission: string) =>
    me.permissions.includes("*") || me.permissions.includes(permission),
}));

/*
 * The centre's logs in the app (A-246): the site's Settings → Login log,
 * Action log, Sent SMS, Calls and Payments. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockSaveFile.mockReset();
  mockSaveFile.mockResolvedValue("opened");
  mockPush.mockReset();
  jest.mocked(openOnSite).mockClear();
  mockPermissions = ["logs.view", "reports.payments", "staff.view", "payments.create"];
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

/** The query of the last request made to an address. */
function asked(tail: string): URLSearchParams {
  const last = calls("GET", tail).at(-1);
  return new URLSearchParams(last ? (last[0].split("?")[1] ?? "") : "");
}

type Routes = Record<string, unknown | ((url: string) => unknown)>;
function serve(routes: Routes) {
  fetchMock.mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    const path = url.split("?")[0]!;
    const key = Object.keys(routes).find((k) => {
      const [verb, tail] = k.split(" ") as [string, string];
      return verb === method && path.endsWith(tail);
    });
    if (!key) return answer(404, { error: { code: "NOT_FOUND", message: "errors.notFound" } });
    const route = routes[key];
    const body = typeof route === "function" ? (route as (url: string) => unknown)(url) : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

const page = <T,>(items: T[], total = items.length, at = 1) => ({
  items,
  page: at,
  pageSize: 30,
  total,
});

const ACTORS = [
  { id: "u1", fullName: "Dilnoza Karimova" },
  { id: "u2", fullName: "Sardor Aliyev" },
];

describe("the login log", () => {
  const login = (id: string, more: Partial<LoginRow> = {}): LoginRow => ({
    id,
    userName: "Dilnoza Karimova",
    phone: "+998901112233",
    success: true,
    ip: "10.0.0.7",
    createdAt: "2026-11-20T08:15:00.000Z",
    ...more,
  });

  it("lists who signed in and the failed tries, with how many in all", async () => {
    serve({
      "GET /logs/logins": page([
        login("l1"),
        login("l2", { userName: null, phone: "+998909990000", success: false, ip: null }),
      ]),
    });
    await renderScreen(<LoginLogScreen />);
    expect(await screen.findByText("Logins: 2")).toBeTruthy();
    expect(screen.getByTestId("login-l1")).toHaveTextContent(
      /Dilnoza Karimova.*\+998901112233.*IP 10\.0\.0\.7.*Signed in/,
    );
    // An account that is gone: the phone stands where the name was.
    expect(screen.getByTestId("login-l2")).toHaveTextContent(/^\+998909990000.*Failed$/);
    expect(asked("/logs/logins").get("sort")).toBe("createdAt:desc");
    expect(asked("/logs/logins").get("pageSize")).toBe("30");
    expect(asked("/logs/logins").has("success")).toBe(false);
    expect(asked("/logs/logins").has("from")).toBe(false);
  });

  it("asks again for the outcome, the search and the days", async () => {
    serve({ "GET /logs/logins": page([login("l1")]) });
    await renderScreen(<LoginLogScreen />);
    await screen.findByTestId("login-l1");

    await fireEvent.press(screen.getByTestId("logins-outcome"));
    await fireEvent.press(await screen.findByTestId("logins-outcome-option-false"));
    await waitFor(() => expect(asked("/logs/logins").get("success")).toBe("false"));

    await fireEvent.changeText(screen.getByTestId("logins-search"), " dilnoza ");
    await waitFor(() => expect(asked("/logs/logins").get("q")).toBe("dilnoza"));

    await fireEvent.changeText(screen.getByTestId("logins-from"), "01112026");
    await waitFor(() => expect(asked("/logs/logins").get("from")).toBe("2026-11-01"));
    // A day half typed does not narrow anything.
    await fireEvent.changeText(screen.getByTestId("logins-to"), "3011");
    expect(asked("/logs/logins").has("to")).toBe(false);
    await fireEvent.changeText(screen.getByTestId("logins-to"), "30102026");
    await waitFor(() => expect(asked("/logs/logins").get("to")).toBe("2026-10-30"));
    expect(screen.getByText("End date must be after the start date")).toBeTruthy();
  });

  it("says so when nothing was recorded, and fetches the next thirty on Show more", async () => {
    let total = 0;
    serve({
      "GET /logs/logins": (url: string) => {
        if (total === 0) return page([]);
        const at = Number(new URL(url, "http://x").searchParams.get("page"));
        return page([login(`l${at}`)], 31, at);
      },
    });
    const client = await renderScreen(<LoginLogScreen />);
    expect(await screen.findByText("No logins recorded.")).toBeTruthy();
    expect(screen.queryByTestId("logins-more")).toBeNull();

    total = 31;
    await client.invalidateQueries();
    await screen.findByTestId("login-l1");
    await fireEvent.press(screen.getByTestId("logins-more"));
    await screen.findByTestId("login-l2");
    expect(screen.getByTestId("login-l1")).toBeTruthy();
    expect(asked("/logs/logins").get("page")).toBe("2");
  });
});

describe("the action log", () => {
  const action = (id: string, more: Partial<ActionRow> = {}): ActionRow => ({
    id,
    action: "payment.create",
    entity: "Payment",
    entityId: "p1",
    actorName: "Dilnoza Karimova",
    actorPhone: "+998901112233",
    branchName: "Chilonzor",
    subjectName: "Jasur Toshmatov · +998935556677",
    before: null,
    after: { amount: 500000, comment: "November" },
    createdAt: "2026-11-20T08:15:00.000Z",
    ...more,
  });

  it("writes what was done, to whom, what changed and who did it", async () => {
    serve({
      "GET /logs/actors": ACTORS,
      "GET /logs/actions": page([
        action("a1"),
        action("a2", {
          action: "student.update",
          entity: "Student",
          actorName: null,
          actorPhone: null,
          branchName: null,
          before: { fullName: "Jasur T", phone: "1", tags: ["a"] },
          after: { fullName: "Jasur Toshmatov", phone: "1", tags: ["b"] },
        }),
        action("a3", { action: "something.new", entity: "Thing", subjectName: null, after: null }),
      ]),
    });
    await renderScreen(<ActionLogScreen />);
    expect(await screen.findByTestId("action-a1")).toHaveTextContent(
      /Payment received.*Payment.*Jasur Toshmatov · \+998935556677.*amount: 500000.*comment: November.*Dilnoza Karimova, \+998901112233, Chilonzor/,
    );
    // Only what changed, old and new; lists and what stayed the same are left out.
    expect(screen.getByTestId("action-changes-a2")).toHaveTextContent(
      "fullName: Jasur T → Jasur Toshmatov",
    );
    expect(screen.getByTestId("action-a2")).toHaveTextContent(/Student updated.*System/);
    // An action the app has no words for keeps its own name.
    expect(screen.getByTestId("action-a3")).toHaveTextContent(/something\.new.*Thing/);
    expect(screen.queryByTestId("action-changes-a3")).toBeNull();
  });

  it("narrows by the type of thing and by the staff member", async () => {
    serve({ "GET /logs/actors": ACTORS, "GET /logs/actions": page([action("a1")]) });
    await renderScreen(<ActionLogScreen />);
    await screen.findByTestId("action-a1");

    await fireEvent.press(screen.getByTestId("actions-entity"));
    await fireEvent.press(await screen.findByTestId("actions-entity-option-Refund"));
    await waitFor(() => expect(asked("/logs/actions").get("entity")).toBe("Refund"));

    await fireEvent.press(await screen.findByTestId("actions-actor"));
    await fireEvent.press(await screen.findByTestId("actions-actor-option-u2"));
    await waitFor(() => expect(asked("/logs/actions").get("actorId")).toBe("u2"));

    await fireEvent.changeText(screen.getByTestId("actions-search"), "refund");
    await waitFor(() => expect(asked("/logs/actions").get("q")).toBe("refund"));
  });

  it("leaves the staff filter out on a server that has no list of them yet", async () => {
    serve({ "GET /logs/actions": page([action("a1")]) });
    await renderScreen(<ActionLogScreen />);
    await screen.findByTestId("action-a1");
    await waitFor(() => expect(calls("GET", "/logs/actors")).toHaveLength(1));
    expect(screen.queryByTestId("actions-actor")).toBeNull();
    expect(screen.getByTestId("actions-entity")).toBeTruthy();
  });

  it("reads the changes of a row: plain values only, four at most", () => {
    expect(changesOf(null, { a: 1, b: "x", c: true, d: 2, e: 3 })).toEqual([
      "a: 1",
      "b: x",
      "c: true",
      "d: 2",
    ]);
    expect(changesOf({ a: 1, list: [1] }, { a: 2, list: [2] })).toEqual(["a: 1 → 2"]);
    expect(changesOf({ a: 1 }, { a: null })).toEqual(["a: 1 → —"]);
    expect(changesOf("text", 5)).toEqual([]);
  });
});

describe("the sent SMS", () => {
  const sms = (id: string, more: Partial<SmsLogEntry> = {}): SmsLogEntry => ({
    id,
    recipientType: "PARENT",
    recipientName: "Jasur Toshmatov",
    phone: "+998935556677",
    studentId: "st1",
    text: "The lesson starts at 15:00.",
    status: "SENT",
    sentByName: "Dilnoza Karimova",
    event: null,
    error: null,
    createdAt: "2026-11-20T08:15:00.000Z",
    sentAt: "2026-11-20T08:15:05.000Z",
    ...more,
  });

  it("lists the messages and opens the student a message was about", async () => {
    serve({
      "GET /logs/actors": ACTORS,
      "GET /logs/sms": page([
        sms("m1"),
        sms("m2", {
          recipientType: "STAFF",
          recipientName: "Sardor Aliyev",
          studentId: null,
          status: "FAILED",
          sentByName: null,
          event: "BIRTHDAY",
          error: "The gateway refused the number.",
        }),
      ]),
    });
    await renderScreen(<SmsLogScreen />);
    expect(await screen.findByTestId("sms-log-m1")).toHaveTextContent(
      /Jasur Toshmatov.*Parent \+998935556677.*Sent.*The lesson starts at 15:00\..*Dilnoza Karimova/,
    );
    expect(screen.getByTestId("sms-log-m2")).toHaveTextContent(
      /Sardor Aliyev.*Staff.*Failed.*Sent by the system, Birthday greeting/,
    );
    expect(screen.getByTestId("sms-log-error-m2")).toHaveTextContent(
      "The gateway refused the number.",
    );
    expect(screen.queryByTestId("sms-log-student-m2")).toBeNull();
    await fireEvent.press(screen.getByTestId("sms-log-student-m1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "st1" },
    });
  });

  it("narrows by the status and by who sent it; the system is always a choice", async () => {
    // No list of staff from this server: the system alone can be chosen.
    serve({ "GET /logs/sms": page([sms("m1")]) });
    await renderScreen(<SmsLogScreen />);
    await screen.findByTestId("sms-log-m1");

    await fireEvent.press(screen.getByTestId("sms-log-status"));
    await fireEvent.press(await screen.findByTestId("sms-log-status-option-FAILED"));
    await waitFor(() => expect(asked("/logs/sms").get("status")).toBe("FAILED"));

    await fireEvent.press(await screen.findByTestId("sms-log-sender"));
    await fireEvent.press(await screen.findByTestId("sms-log-sender-option-system"));
    await waitFor(() => expect(asked("/logs/sms").get("sentBy")).toBe("system"));
    expect(screen.queryByTestId("sms-log-sender-option-u1")).toBeNull();
  });

  it("offers the staff as senders when the server lists them", async () => {
    serve({ "GET /logs/actors": ACTORS, "GET /logs/sms": page([sms("m1")]) });
    await renderScreen(<SmsLogScreen />);
    await screen.findByTestId("sms-log-m1");
    await fireEvent.press(screen.getByTestId("sms-log-sender"));
    await fireEvent.press(await screen.findByTestId("sms-log-sender-option-u1"));
    await waitFor(() => expect(asked("/logs/sms").get("sentBy")).toBe("u1"));
  });
});

describe("the calls", () => {
  const call = (id: string, more: Partial<CallEntry> = {}): CallEntry => ({
    id,
    direction: "OUTBOUND",
    status: "ANSWERED",
    fromPhone: "+998711112233",
    toPhone: "+998935556677",
    staffName: "Dilnoza Karimova",
    studentId: "st1",
    studentName: "Jasur Toshmatov",
    durationSeconds: 95,
    startedAt: "2026-11-20T08:15:00.000Z",
    ...more,
  });

  it("lists the calls, newest first, and narrows them", async () => {
    serve({
      "GET /calls": page([
        call("c1"),
        call("c2", {
          direction: "INBOUND",
          status: "MISSED",
          staffName: null,
          studentId: null,
          studentName: null,
          durationSeconds: 0,
        }),
      ]),
    });
    await renderScreen(<CallsScreen />);
    expect(await screen.findByTestId("call-c1")).toHaveTextContent(
      /Outgoing, \+998711112233 → \+998935556677.*Jasur Toshmatov.*Dilnoza Karimova, Duration 1:35.*Answered/,
    );
    expect(screen.getByTestId("call-c2")).toHaveTextContent(/Incoming.*Duration 0:00.*Missed/);
    expect(asked("/calls").get("sort")).toBe("startedAt:desc");
    await fireEvent.press(screen.getByTestId("call-student-c1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "st1" },
    });

    await fireEvent.press(screen.getByTestId("calls-direction"));
    await fireEvent.press(await screen.findByTestId("calls-direction-option-INBOUND"));
    await waitFor(() => expect(asked("/calls").get("direction")).toBe("INBOUND"));
    await fireEvent.press(await screen.findByTestId("calls-status"));
    await fireEvent.press(await screen.findByTestId("calls-status-option-MISSED"));
    await waitFor(() => expect(asked("/calls").get("status")).toBe("MISSED"));
  });

  it("says so when there are none", async () => {
    serve({ "GET /calls": page([]) });
    await renderScreen(<CallsScreen />);
    expect(await screen.findByText("No calls found.")).toBeTruthy();
  });
});

describe("the payments log", () => {
  const payment = (id: string, more: Partial<Payment> = {}): Payment => ({
    id,
    studentId: "st1",
    studentName: "Jasur Toshmatov",
    membershipId: "ms1",
    groupId: "g1",
    groupName: "GE-Morning A1",
    methodName: "Cash",
    amount: 500000,
    bonus: 0,
    refunded: 0,
    effectiveMonth: "2026-11-01",
    paidAt: "2026-11-20",
    comment: null,
    receivedByName: "Dilnoza Karimova",
    createdAt: "2026-11-20T08:15:00.000Z",
    ...more,
  });
  const OPTIONS = {
    methods: [
      { id: "m1", name: "Cash" },
      { id: "m2", name: "Card" },
    ],
    printReceiptAfterPayment: false,
    refundsEnabled: true,
  };
  const log = (items: Payment[], totalAmount: number) => ({ ...page(items), totalAmount });

  it("lists every payment with the sum of all of them", async () => {
    serve({
      "GET /payments/options": OPTIONS,
      "GET /staff": page(ACTORS),
      "GET /payments": log(
        [
          payment("p1"),
          payment("p2", {
            amount: 300000,
            refunded: 100000,
            bonus: 20000,
            comment: "Half now",
            fiscal: { status: "FAILED", error: "No answer" },
          }),
        ],
        700000,
      ),
    });
    await renderScreen(<PaymentsLogScreen />);
    expect(await screen.findByTestId("payment-p1")).toHaveTextContent(
      /Jasur Toshmatov.*GE-Morning A1.*For month.*Cash, Dilnoza Karimova.*500,000/,
    );
    expect(screen.getByTestId("payments-log-total")).toHaveTextContent(/Total:.*700,000/);
    expect(screen.getByTestId("payment-p2")).toHaveTextContent(
      /Half now.*Fiscal receipt: Failed.*300,000.*Refunded:.*100,000.*Bonus:.*20,000/,
    );
    expect(asked("/payments").get("sort")).toBe("paidAt:desc");

    await fireEvent.press(screen.getByTestId("payment-student-p1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "st1" },
    });
    await fireEvent.press(screen.getByTestId("payment-receipt-p1"));
    await waitFor(() => expect(openOnSite).toHaveBeenCalledWith("/en/payments/p1/receipt"));
  });

  it("narrows by days, method and cashier, and fetches the same list as an Excel file", async () => {
    serve({
      "GET /payments/options": OPTIONS,
      "GET /staff": page(ACTORS),
      "GET /payments": log([payment("p1")], 500000),
    });
    await renderScreen(<PaymentsLogScreen />);
    await screen.findByTestId("payment-p1");

    await fireEvent.press(await screen.findByTestId("payments-log-method"));
    await fireEvent.press(await screen.findByTestId("payments-log-method-option-m2"));
    await waitFor(() => expect(asked("/payments").get("paymentMethodId")).toBe("m2"));
    await fireEvent.press(await screen.findByTestId("payments-log-cashier"));
    await fireEvent.press(await screen.findByTestId("payments-log-cashier-option-u1"));
    await waitFor(() => expect(asked("/payments").get("receivedById")).toBe("u1"));
    await fireEvent.changeText(screen.getByTestId("payments-log-from"), "01112026");
    await waitFor(() => expect(asked("/payments").get("from")).toBe("2026-11-01"));

    await fireEvent.press(screen.getByTestId("report-excel"));
    expect(mockSaveFile).toHaveBeenCalledWith(
      "/payments/export.xlsx?from=2026-11-01&paymentMethodId=m2&receivedById=u1&locale=en",
      "kampus.xlsx",
    );
  });

  it("sends a failed fiscal receipt again, for people who take payments", async () => {
    serve({
      "GET /payments/options": OPTIONS,
      "GET /staff": page(ACTORS),
      "GET /payments": log(
        [payment("p2", { fiscal: { status: "FAILED", error: "No answer" } })],
        500000,
      ),
      "POST /payments/p2/fiscal": { status: "ISSUED", error: null },
    });
    await renderScreen(<PaymentsLogScreen />);
    await fireEvent.press(await screen.findByTestId("payment-fiscal-retry-p2"));
    await waitFor(() => expect(calls("POST", "/payments/p2/fiscal")).toHaveLength(1));
    // The list is asked for again: the receipt's new state comes with it.
    await waitFor(() => expect(calls("GET", "/payments").length).toBeGreaterThan(1));
  });

  it("has no cashier filter and no second try without the rights for them", async () => {
    mockPermissions = ["reports.payments"];
    serve({
      "GET /payments/options": OPTIONS,
      "GET /payments": log(
        [payment("p2", { fiscal: { status: "FAILED", error: "No answer" } })],
        500000,
      ),
    });
    await renderScreen(<PaymentsLogScreen />);
    await screen.findByTestId("payment-p2");
    expect(await screen.findByTestId("payments-log-method")).toBeTruthy();
    expect(screen.queryByTestId("payments-log-cashier")).toBeNull();
    expect(calls("GET", "/staff")).toHaveLength(0);
    expect(screen.getByTestId("payment-fiscal-p2")).toBeTruthy();
    expect(screen.queryByTestId("payment-fiscal-retry-p2")).toBeNull();
  });
});

describe("where the site's logs live in the app", () => {
  it("opens the five lists in the app and leaves the rest to the site", () => {
    expect(nativeRoute("/settings/logs/logins")).toBe("/staff/settings/logs/logins");
    expect(nativeRoute("/settings/logs/actions")).toBe("/staff/settings/logs/actions");
    expect(nativeRoute("/settings/logs/sms")).toBe("/staff/settings/logs/sms");
    expect(nativeRoute("/settings/calls")).toBe("/staff/settings/calls");
    expect(nativeRoute("/settings/payments")).toBe("/staff/settings/payments");
    expect(nativeRoute("/settings/logs")).toBeNull();
    expect(nativeRoute("/settings/logs/other")).toBeNull();
    expect(nativeRoute("/settings/logs/sms/more")).toBeNull();
    expect(nativeRoute("/settings/organizations")).toBeNull();
  });
});
