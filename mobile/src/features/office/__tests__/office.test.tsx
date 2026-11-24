import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type {
  DashboardKpis,
  FinanceOverview,
  MySalary,
  NotificationsPage,
  RevenueForecast,
  RoomSchedule,
  SearchResults,
  SetupChecklist,
} from "@/api/office";
import { HomeScreen, kpiPath } from "@/features/office/home-screen";
import { Menu } from "@/features/office/menu";
import { NotificationsScreen } from "@/features/office/notifications-screen";
import { PairBars } from "@/features/office/pair-bars";
import { SalaryScreen } from "@/features/office/salary-screen";
import { SearchScreen } from "@/features/office/search-screen";
import { hasHome, nativeRoute } from "@/features/office/site-paths";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import type { Me } from "@/lib/session";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));
const mockOpenOnSite = jest.fn<Promise<void>, [string]>();
jest.mock("@/lib/web", () => ({ openOnSite: (path: string) => mockOpenOnSite(path) }));
let mockMe: Me;
jest.mock("@/lib/session", () => ({
  useMe: () => mockMe,
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * The office's side of the app (A-230): the centre's home, the bell, the
 * search, the menu of every page and "My salary". Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

function me(permissions: string[], change: Partial<Me> = {}): Me {
  return {
    user: {
      id: "u1",
      fullName: "Dilnoza Karimova",
      phone: "+998905557788",
      photoUrl: null,
      mustChangePassword: false,
      hasSalary: false,
    },
    roles: [{ code: "ADMIN", name: "Administrator" }],
    view: { current: "FULL", canSwitch: false },
    permissions,
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
    ...change,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockOpenOnSite.mockReset();
  mockOpenOnSite.mockResolvedValue();
  mockMe = me(["dashboard.view", "students.view", "groups.view"]);
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

/** Answers by "<VERB> <end of the path>"; a function is given the address. */
type Routes = Record<string, unknown | ((url: string) => unknown)>;
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
    return answer(body === undefined ? 204 : 200, body);
  });
}

const KPIS: DashboardKpis = {
  activeLeads: 7,
  groups: 12,
  remainingDebt: 4500000,
  debtors: 9,
  dueSoon: 3,
  activeStudents: 140,
  studentsInGroups: 151,
  trial: 5,
  leftThisMonth: 2,
  teachers: 11,
  exams: 1,
  newAdmissions: 6,
  utilisation: 64,
};

const ROOMS: RoomSchedule = {
  weekday: 2,
  workStart: "08:00",
  workEnd: "20:00",
  rooms: [
    {
      id: "r1",
      name: "Room 1",
      capacity: 12,
      blocks: [
        {
          groupId: "g1",
          groupName: "GE-Morning A1",
          courseName: "General English",
          color: "#2d4498",
          teacherName: "Jasur Aliyev",
          startTime: "09:00",
          endTime: "10:30",
        },
      ],
    },
    { id: "r2", name: "Room 2", capacity: 8, blocks: [] },
  ],
  unassigned: [],
};

const FORECAST: RevenueForecast = {
  month: "2026-11",
  nextMonth: "2026-12",
  current: { expected: 10000000, collected: 6000000, percent: 60 },
  next: { expected: 11000000, collected: 500000 },
  memberships: 140,
  months: [
    { month: "2026-10", kind: "past", expected: 9000000, collected: 8800000 },
    { month: "2026-11", kind: "current", expected: 10000000, collected: 6000000 },
    { month: "2026-12", kind: "next", expected: 11000000, collected: 500000 },
  ],
  byCourse: [
    {
      id: "c1",
      name: "General English",
      expected: 10000000,
      collected: 6000000,
      nextExpected: 11000000,
    },
  ],
  byBranch: [],
};

function finance(change: Partial<FinanceOverview> = {}): FinanceOverview {
  return {
    income: 30000000,
    studentIncome: 29000000,
    otherIncome: 1000000,
    expenses: 12000000,
    profit: 18000000,
    activeBalance: 21000000,
    averagePayment: 400000,
    paymentCount: 70,
    byMethod: [
      { id: "m1", name: "Cash", amount: 20000000 },
      { id: "m2", name: "Card", amount: 10000000 },
    ],
    yearly: Array.from({ length: 12 }, (_, index) => ({
      month: `2026-${String(index + 1).padStart(2, "0")}`,
      income: (index + 1) * 1000000,
      expenses: (index + 1) * 400000,
    })),
    ...change,
  };
}

const SETUP: SetupChecklist = {
  steps: [
    { key: "branches", done: true, count: 1, href: "/settings/general" },
    { key: "telegram", done: false, count: null, href: "/settings/integrations" },
  ],
  done: 1,
  total: 2,
  shown: true,
};

describe("the centre's home", () => {
  it("keeps the figures hidden until Show numbers is pressed", async () => {
    serve({ "GET /dashboard/kpis": KPIS, "GET /dashboard/schedule": ROOMS });
    await renderScreen(<HomeScreen />);
    await screen.findByTestId("home-kpis");

    expect(screen.getByTestId("home-welcome")).toHaveTextContent("Welcome, Dilnoza Karimova");
    expect(screen.getByTestId("kpi-activeStudents-value")).toHaveTextContent("***");
    expect(screen.getByTestId("utilisation")).toHaveTextContent("Center utilisation ***%");

    await fireEvent.press(screen.getByTestId("show-numbers"));
    expect(screen.getByTestId("kpi-activeStudents-value")).toHaveTextContent("140");
    expect(screen.getByTestId("kpi-remainingDebt-value")).toHaveTextContent(/4,500,000/);
    expect(screen.getByTestId("utilisation")).toHaveTextContent("Center utilisation 64%");
  });

  it("asks only for the parts the person may see", async () => {
    serve({ "GET /dashboard/kpis": KPIS, "GET /dashboard/schedule": ROOMS });
    await renderScreen(<HomeScreen />);
    await screen.findByTestId("rooms");

    expect(calls("GET", "/dashboard/finance")).toHaveLength(0);
    expect(calls("GET", "/dashboard/forecast")).toHaveLength(0);
    expect(calls("GET", "/dashboard/setup")).toHaveLength(0);
    expect(screen.queryByTestId("home-finance")).toBeNull();
    expect(screen.queryByTestId("setup-checklist")).toBeNull();
  });

  it("opens a figure's page in the app where the app has it, on the site where not", async () => {
    mockMe = me(["dashboard.view", "students.view", "groups.view", "reports.view"]);
    serve({ "GET /dashboard/kpis": KPIS, "GET /dashboard/schedule": ROOMS });
    await renderScreen(<HomeScreen />);
    await screen.findByTestId("home-kpis");

    await fireEvent.press(screen.getByTestId("kpi-studentsInGroups"));
    expect(mockPush).toHaveBeenCalledWith("/staff/students");

    // Leads have their board in the app (A-232).
    await fireEvent.press(screen.getByTestId("kpi-activeLeads"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/leads");
    // So have the debtors (A-236).
    await fireEvent.press(screen.getByTestId("kpi-debtors"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/debts");
    // And the reports (A-238): who left opens the Left students report.
    await fireEvent.press(screen.getByTestId("kpi-leftThisMonth"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/reports/churn");
    // A figure about students opens the app's list with the site's filter already set (A-231).
    await fireEvent.press(screen.getByTestId("kpi-remainingDebt"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/students",
      params: { paymentStatus: "DEBTOR" },
    });
  });

  it("shows who is in which room, and asks again for another weekday", async () => {
    serve({ "GET /dashboard/kpis": KPIS, "GET /dashboard/schedule": ROOMS });
    await renderScreen(<HomeScreen />);
    const room = await screen.findByTestId("room-r1");
    expect(room).toHaveTextContent(/09:00–10:30/);
    expect(room).toHaveTextContent(/GE-Morning A1/);
    expect(screen.getByTestId("room-r2")).toHaveTextContent(/Free/);

    await fireEvent.press(screen.getByTestId("block-g1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/group/[id]", params: { id: "g1" } });

    await fireEvent.press(screen.getByTestId("rooms-day-5"));
    await waitFor(() =>
      expect(calls("GET", "/dashboard/schedule").some(([url]) => url.includes("weekday=5"))).toBe(
        true,
      ),
    );
  });

  it("shows the money, the forecast and the setup list to those who have them", async () => {
    mockMe = me(["dashboard.view", "dashboard.finance", "settings.org", "reports.view"]);
    serve({
      "GET /dashboard/kpis": KPIS,
      "GET /dashboard/schedule": ROOMS,
      "GET /dashboard/forecast": FORECAST,
      "GET /dashboard/finance": (url: string) =>
        url.includes("paymentMethodId=m2")
          ? finance({ income: 10000000, byMethod: [{ id: "m2", name: "Card", amount: 10000000 }] })
          : finance(),
      "GET /dashboard/setup": SETUP,
      "PATCH /dashboard/setup": { ...SETUP, shown: false },
    });
    await renderScreen(<HomeScreen />);
    await screen.findByTestId("finance-income");
    await screen.findByTestId("forecast-this-month");
    await screen.findByTestId("setup-checklist");

    expect(screen.getByTestId("finance-income-value")).toHaveTextContent("***");
    await fireEvent.press(screen.getByTestId("show-numbers"));
    expect(screen.getByTestId("finance-income-value")).toHaveTextContent(/30,000,000/);
    expect(screen.getByTestId("forecast-collected")).toHaveTextContent(/6,000,000/);
    expect(screen.getByTestId("setup-progress")).toHaveTextContent("1 of 2 done");
    expect(screen.getByTestId("setup-step-telegram")).toHaveTextContent(/Connect the bot/);
    // What is done is one line, not a row each.
    expect(screen.queryByTestId("setup-step-branches")).toBeNull();
    expect(screen.getByTestId("setup-done")).toHaveTextContent("Branches");

    // One payment type of the year.
    await fireEvent.press(screen.getByTestId("finance-method"));
    await fireEvent.press(await screen.findByTestId("finance-method-option-m2"));
    await waitFor(() =>
      expect(screen.getByTestId("finance-income-value")).toHaveTextContent(/10,000,000/),
    );

    // The year before.
    await fireEvent.press(screen.getByTestId("finance-year-prev"));
    const year = new Date().getFullYear();
    await waitFor(() =>
      expect(
        calls("GET", "/dashboard/finance").some(([url]) => url.includes(`year=${year - 1}`)),
      ).toBe(true),
    );

    await fireEvent.press(screen.getByTestId("setup-hide"));
    await waitFor(() => expect(calls("PATCH", "/dashboard/setup")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/dashboard/setup")[0]![1])).toEqual({ shown: false });
  });

  it("drops a payment type the month shown does not have, and counts other income in", async () => {
    mockMe = me(["dashboard.view", "dashboard.finance"]);
    serve({
      "GET /dashboard/kpis": KPIS,
      "GET /dashboard/schedule": ROOMS,
      "GET /dashboard/finance": (url: string) => {
        if (url.includes("paymentMethodId=m2")) {
          return finance({
            income: 10000000,
            otherIncome: 0,
            byMethod: [{ id: "m2", name: "Card", amount: 10000000 }],
          });
        }
        // October took cash only, and 350,000 that did not come from students.
        return url.includes("month=10")
          ? finance({
              income: 800000,
              otherIncome: 350000,
              byMethod: [{ id: "m1", name: "Cash", amount: 450000 }],
            })
          : finance();
      },
    });
    await renderScreen(<HomeScreen />);
    await screen.findByTestId("finance-income");
    await fireEvent.press(screen.getByTestId("show-numbers"));
    // What students paid, type by type, and the rest: together the Income above.
    expect(screen.getByTestId("finance-other-income")).toHaveTextContent(/Other income.*1,000,000/);

    await fireEvent.press(screen.getByTestId("finance-method"));
    await fireEvent.press(await screen.findByTestId("finance-method-option-m2"));
    await waitFor(() =>
      expect(screen.getByTestId("finance-income-value")).toHaveTextContent(/10,000,000/),
    );
    expect(screen.queryByTestId("finance-other-income")).toBeNull();

    // October has no Card: the choice no longer counts, and nothing stays filtered unseen.
    await fireEvent.press(screen.getByTestId("finance-month"));
    await fireEvent.press(await screen.findByTestId("finance-month-option-10"));
    await waitFor(() =>
      expect(screen.getByTestId("finance-income-value")).toHaveTextContent(/800,000/),
    );
    expect(screen.queryByTestId("finance-method")).toBeNull();
    expect(screen.getByTestId("finance-other-income")).toHaveTextContent(/350,000/);
  });

  it("leads each figure where the site leads it", () => {
    expect(kpiPath("leftThisMonth", true)).toBe("/reports/churn");
    expect(kpiPath("leftThisMonth", false)).toBe("/students?archived=true");
    expect(kpiPath("remainingDebt", false)).toBe("/students?paymentStatus=DEBTOR");
  });
});

describe("two sums for each step of time", () => {
  it("writes the pressed step's sums under the plot, the last step first", async () => {
    await renderScreen(
      <PairBars
        rows={[
          { label: "Oct", name: "Oct 2026", first: 900, second: 880 },
          { label: "Nov", name: "Nov 2026", first: 1000, second: 600 },
        ]}
        legend={{ first: "Charged", second: "Collected" }}
        format={(value) => `${value} so'm`}
      />,
    );
    expect(screen.getByTestId("pair-bars-picked")).toHaveTextContent(/Nov 2026/);
    expect(screen.getByTestId("pair-bars-picked")).toHaveTextContent(/1000 so'm/);

    await fireEvent.press(screen.getByTestId("pair-bars-step-0"));
    expect(screen.getByTestId("pair-bars-picked")).toHaveTextContent(/Oct 2026/);
    expect(screen.getByTestId("pair-bars-picked")).toHaveTextContent(/880 so'm/);
    expect(screen.getByTestId("pair-bars-step-0").props.accessibilityLabel).toBe(
      "Oct 2026. Charged: 900 so'm. Collected: 880 so'm",
    );
  });
});

describe("where a page of the site lives in the app", () => {
  it("knows the pages the app has", () => {
    expect(nativeRoute("/students/s1")).toEqual({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });
    expect(nativeRoute("/groups/g1")).toEqual({
      pathname: "/staff/group/[id]",
      params: { id: "g1" },
    });
    expect(nativeRoute("/dashboard")).toBe("/staff/home");
    expect(nativeRoute("/today")).toBe("/staff");
    expect(nativeRoute("/account/salary")).toBe("/staff/salary");
    expect(nativeRoute("/notifications")).toBe("/staff/notifications");
    // Finance (A-237): its page, the entries of a kind and of a category, a payroll month.
    expect(nativeRoute("/finance")).toBe("/staff/finance");
    expect(nativeRoute("/finance/investment")).toEqual({
      pathname: "/staff/finance/[section]",
      params: { section: "investment" },
    });
    expect(nativeRoute("/finance/costs/c1")).toEqual({
      pathname: "/staff/finance/costs/[id]",
      params: { id: "c1" },
    });
    expect(nativeRoute("/finance/salary-detail/2026-11-01")).toEqual({
      pathname: "/staff/finance/salary/[month]",
      params: { month: "2026-11" },
    });
    // The debtors and the cash desk (A-236), the debtors with a notification's filter.
    expect(nativeRoute("/debts")).toBe("/staff/debts");
    expect(nativeRoute("/cashdesk")).toBe("/staff/cashdesk");
    expect(nativeRoute("/debts?branchId=b1&status=NEEDS_CALL")).toEqual({
      pathname: "/staff/debts",
      params: { branchId: "b1", status: "NEEDS_CALL" },
    });
    expect(nativeRoute("/students?paymentStatus=DEBTOR")).toEqual({
      pathname: "/staff/students",
      params: { paymentStatus: "DEBTOR" },
    });
    expect(nativeRoute("/students?archived=true")).toEqual({
      pathname: "/staff/students",
      params: { archived: "true" },
    });
  });

  it("sends everything else to the site", () => {
    expect(nativeRoute("/assistant")).toBeNull();
    // A report's Excel file is the site's, and so is a report the site does not have.
    expect(nativeRoute("/reports/taxes")).toBeNull();
    expect(nativeRoute("/reports/payments/export.xlsx")).toBeNull();
    // Finance has no such page, and a payroll month is a month.
    expect(nativeRoute("/finance/taxes")).toBeNull();
    expect(nativeRoute("/finance/salary-detail/2026-13-01")).toBeNull();
    expect(nativeRoute("/finance/costs")).toBeNull();
    // A day close's sheet to print is the site's page.
    expect(nativeRoute("/cashdesk/c1")).toBeNull();
    // A debtors filter the app's list does not have stays the site's.
    expect(nativeRoute("/debts?status=SOMETHING")).toBeNull();
    // A leads filter the app's board does not have stays the site's.
    expect(nativeRoute("/leads?teacherId=t1")).toBeNull();
    // A students filter the app does not know stays the site's.
    expect(nativeRoute("/students?schoolId=x")).toBeNull();
    // A value the app's list does not know would show everyone: the site's too.
    expect(nativeRoute("/students?groupStatus=TRIAL")).toBeNull();
    expect(nativeRoute("/groups?status=ACTIVE")).toBeNull();
    expect(nativeRoute("/groups/g1/attendance")).toBeNull();
    expect(nativeRoute("/account")).toBeNull();
    expect(nativeRoute("/settings/organizations")).toBeNull();
  });

  it("gives the home to the office, not to the teaching view", () => {
    expect(hasHome(me(["dashboard.view"]))).toBe(true);
    expect(hasHome(me(["groups.view"]))).toBe(false);
    expect(
      hasHome(me(["dashboard.view"], { view: { current: "TEACHING", canSwitch: true } })),
    ).toBe(false);
  });
});

function notifications(change: Partial<NotificationsPage> = {}): NotificationsPage {
  return {
    items: [
      {
        id: "n1",
        kind: "PAYMENT",
        params: { name: "Ali Valiyev", amount: 400000, group: "GE-Morning A1", by: "Dilnoza" },
        href: "/students/s1",
        readAt: null,
        createdAt: "2026-11-23T09:00:00.000Z",
      },
      {
        id: "n2",
        kind: "LEAD",
        params: { name: "Sardor", column: "New", source: "Instagram" },
        href: "/leads?boardId=b1",
        readAt: "2026-11-22T10:00:00.000Z",
        createdAt: "2026-11-22T09:00:00.000Z",
      },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    unread: 1,
    ...change,
  };
}

describe("the bell's list", () => {
  it("marks a notification read and opens what it is about", async () => {
    serve({ "GET /notifications": notifications(), "POST /notifications/read": undefined });
    await renderScreen(<NotificationsScreen />);
    const first = await screen.findByTestId("notification-n1");
    expect(first).toHaveTextContent(/Ali Valiyev paid .*400,000.* for GE-Morning A1/);
    expect(screen.getByTestId("unread-n1")).toBeTruthy();
    expect(screen.queryByTestId("unread-n2")).toBeNull();

    await fireEvent.press(first);
    await waitFor(() => expect(calls("POST", "/notifications/read")).toHaveLength(1));
    expect(sentBody(calls("POST", "/notifications/read")[0]![1])).toEqual({ ids: ["n1"] });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });

    // A lead opens its board in the app (A-232); one that was read is not marked again.
    await fireEvent.press(screen.getByTestId("notification-n2"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/leads",
      params: { boardId: "b1" },
    });
    expect(calls("POST", "/notifications/read")).toHaveLength(1);
  });

  it("marks all read, and lists only the unread on request", async () => {
    serve({ "GET /notifications": notifications(), "POST /notifications/read": undefined });
    await renderScreen(<NotificationsScreen />);
    await fireEvent.press(await screen.findByTestId("mark-all-read"));
    await waitFor(() => expect(calls("POST", "/notifications/read")).toHaveLength(1));
    expect(sentBody(calls("POST", "/notifications/read")[0]![1])).toEqual({ all: true });

    await fireEvent.press(screen.getByText("1 unread"));
    await waitFor(() =>
      expect(calls("GET", "/notifications").some(([url]) => url.includes("unread=1"))).toBe(true),
    );
  });

  it("says so when there is nothing", async () => {
    serve({ "GET /notifications": notifications({ items: [], total: 0, unread: 0 }) });
    await renderScreen(<NotificationsScreen />);
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
    expect(screen.queryByTestId("mark-all-read")).toBeNull();
  });

  it("does not say there are none yet when only the unread list is empty", async () => {
    serve({
      "GET /notifications": (url: string) =>
        url.includes("unread=1")
          ? notifications({ items: [], total: 0, unread: 0 })
          : notifications({ unread: 0 }),
    });
    await renderScreen(<NotificationsScreen />);
    await screen.findByTestId("notification-n1");
    await fireEvent.press(screen.getByText("0 unread"));
    expect(await screen.findByText("No unread notifications.")).toBeTruthy();
    expect(screen.queryByText("No notifications yet.")).toBeNull();
  });
});

const FOUND: SearchResults = {
  students: [
    { id: "s1", fullName: "Ali Valiyev", phone: "+998901112233", groups: ["GE-Morning A1"] },
  ],
  leads: [{ id: "l1", fullName: "Alisher", phone: null, boardId: "b1", columnName: "New" }],
  groups: [{ id: "g1", name: "Algebra 9", courseName: "Mathematics", teacherName: "Jasur Aliyev" }],
};

describe("the search over everything", () => {
  it("asks from two letters on, and opens what was found", async () => {
    serve({ "GET /search": FOUND });
    await renderScreen(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-field"), "a");
    await new Promise((done) => setTimeout(done, 400));
    expect(calls("GET", "/search")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("search-field"), "al");
    const students = await screen.findByTestId("found-students");
    expect(students).toHaveTextContent(/Ali Valiyev/);
    expect(calls("GET", "/search")[0]![0]).toContain("q=al");

    await fireEvent.press(screen.getByTestId("found-student-s1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });
    await fireEvent.press(screen.getByTestId("found-group-g1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/group/[id]", params: { id: "g1" } });
    // A lead opens its board with the name searched (A-232).
    await fireEvent.press(screen.getByTestId("found-lead-l1"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/leads",
      params: { boardId: "b1", q: "Alisher" },
    });
  });
});

describe("the menu of every page", () => {
  it("lists what the person may open, and marks what opens on the site", async () => {
    mockMe = me(
      [
        "dashboard.view",
        "groups.view",
        "students.view",
        "leads.view",
        "finance.view",
        "reports.view",
      ],
      { user: { ...me([]).user, hasSalary: true } },
    );
    serve({ "GET /notifications": notifications() });
    await renderScreen(<Menu />);

    for (const key of [
      "notifications",
      "search",
      "salary",
      "dashboard",
      "today",
      "groups",
      "students",
      "leads",
      "finance",
    ]) {
      expect(screen.getByTestId(`menu-${key}`)).toBeTruthy();
    }
    // No right to them, no row.
    expect(screen.queryByTestId("menu-settings")).toBeNull();
    expect(screen.queryByTestId("menu-exams")).toBeNull();
    // The app has students, leads, finance (A-237) and reports (A-238); the assistant is the
    // site's for now.
    expect(screen.queryByTestId("menu-students-site", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("menu-leads-site", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("menu-finance-site", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("menu-reports-site", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("menu-assistant-site", { includeHiddenElements: true })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("menu-notifications")).toHaveTextContent(/1/));

    await fireEvent.press(screen.getByTestId("menu-salary"));
    expect(mockPush).toHaveBeenCalledWith("/staff/salary");
    await fireEvent.press(screen.getByTestId("menu-finance"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/finance");
    await fireEvent.press(screen.getByTestId("menu-reports"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/reports");
    await fireEvent.press(screen.getByTestId("menu-assistant"));
    expect(mockOpenOnSite).toHaveBeenCalledWith("/en/assistant");
  });

  it("leaves the home and the salary out for a teacher without them", async () => {
    mockMe = me(["groups.view", "groups.attendance.mark"], {
      view: { current: "TEACHING", canSwitch: false },
    });
    serve({ "GET /notifications": notifications({ items: [], total: 0, unread: 0 }) });
    await renderScreen(<Menu />);
    expect(screen.queryByTestId("menu-dashboard")).toBeNull();
    expect(screen.queryByTestId("menu-salary")).toBeNull();
    expect(screen.getByTestId("menu-checking")).toBeTruthy();
    expect(screen.getByTestId("menu-today")).toBeTruthy();
  });
});

function salary(change: Partial<MySalary> = {}): MySalary {
  return {
    month: "2026-11",
    paid: true,
    method: "MONTHLY",
    rate: 3000000,
    line: {
      fixed: 3000000,
      percent: 0,
      perLesson: 1200000,
      perStudent: 0,
      bonus: 200000,
      penalty: 50000,
      advance: 500000,
      net: 3850000,
      details: [
        {
          groupId: "g1",
          groupName: "GE-Morning A1",
          shareType: "PER_LESSON",
          shareValue: 100000,
          students: 9,
          lessons: 12,
          coursePrice: 400000,
          amount: 1200000,
        },
      ],
    },
    official: null,
    entries: [{ id: "e1", type: "BONUS", date: "2026-11-10", amount: 200000, comment: "Olympiad" }],
    history: [{ month: "2026-10", net: 3600000, status: "APPROVED" }],
    ...change,
  };
}

describe("my salary", () => {
  it("shows the month group by group, and an earlier month on request", async () => {
    serve({
      "GET /account/salary": (url: string) =>
        url.includes("month=2026-10") ? salary({ month: "2026-10" }) : salary(),
    });
    await renderScreen(<SalaryScreen />);
    await screen.findByTestId("salary-net");

    expect(screen.getByTestId("salary-month")).toHaveTextContent("Nov 2026");
    expect(screen.getByTestId("salary-net")).toHaveTextContent(/3,850,000/);
    expect(screen.getByTestId("salary-adjustments")).toHaveTextContent(/−.*350,000/);
    expect(screen.getByTestId("salary-rule")).toHaveTextContent(/3,000,000.* per month/);
    expect(screen.getByTestId("salary-group-g1")).toHaveTextContent(/12 lessons/);
    expect(screen.getByTestId("salary-entry-e1")).toHaveTextContent(/Olympiad/);
    // The running month has no next one.
    expect(screen.getByTestId("salary-next").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId("salary-prev"));
    await waitFor(() => expect(screen.getByTestId("salary-month")).toHaveTextContent("Oct 2026"));
    expect(calls("GET", "/account/salary").some(([url]) => url.includes("month=2026-10"))).toBe(
      true,
    );
    expect(screen.getByTestId("salary-this-month")).toBeTruthy();
  });

  it("says so when the person has no salary rule", async () => {
    serve({ "GET /account/salary": salary({ paid: false, history: [] }) });
    await renderScreen(<SalaryScreen />);
    expect(await screen.findByText("No salary rule yet")).toBeTruthy();
    expect(screen.queryByTestId("salary-net")).toBeNull();
  });
});
