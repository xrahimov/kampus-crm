import { notifyManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type {
  ChurnOptions,
  ChurnReport,
  LeadsReport,
  PaymentsReport,
  ReferralsReport,
  StatisticsReport,
  StudentPaymentRow,
  StudentPaymentsOptions,
  StudentPaymentsPage,
  StudentsReport,
} from "@/api/office-reports";
import { nativeRoute } from "@/features/office/site-paths";
import { ChurnReportScreen, leaversByMonth } from "@/features/reports/churn-report";
import { LeadsReportScreen } from "@/features/reports/leads-report";
import { monthBounds } from "@/features/reports/parts";
import { PaymentsReportScreen } from "@/features/reports/payments-report";
import { ReferralsReportScreen } from "@/features/reports/referrals-report";
import { ReportsScreen } from "@/features/reports/reports-screen";
import { StatisticsReportScreen } from "@/features/reports/statistics-report";
import { StudentPaymentsReportScreen } from "@/features/reports/student-payments-report";
import { StudentsReportScreen } from "@/features/reports/students-report";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { centreToday } from "@/lib/days";
jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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
 * Reports in the app (A-238): the list of reports and seven of them, each
 * with the site's filters and figures. Each test plays the server.
 */
type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

// An answer is told to the screen in the same breath it arrives in, not a timer later: a
// redraw then never falls between two steps of a test, where React would not expect it.
beforeAll(() => notifyManager.setScheduler((flush) => queueMicrotask(flush)));
afterAll(() => notifyManager.setScheduler((flush) => setTimeout(flush, 0)));

const ALL_RIGHTS = [
  "reports.view",
  "reports.payments",
  "reports.leads",
  "students.view",
  "groups.view",
  "settings.catalog",
];

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockOpenOnSite.mockReset();
  mockOpenOnSite.mockResolvedValue();
  mockParams = {};
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockActive = { id: "b1", name: "Chilonzor" };
  mockPermissions = ALL_RIGHTS;
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
    if (!key) return answer(404, { error: { code: "NOT_FOUND", message: "errors.notFound" } });
    const route = routes[key];
    const body = typeof route === "function" ? (route as (url: string) => unknown)(url) : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

const [YEAR, MONTH] = centreToday().split("-").map(Number) as [number, number];
const THIS_MONTH = `${YEAR}-${String(MONTH).padStart(2, "0")}`;

const kpi = (value: number, count: number, change: number | null) => ({ value, count, change });

const PAYMENTS: PaymentsReport = {
  year: YEAR,
  month: MONTH,
  branchId: null,
  kpis: {
    total: kpi(5200, 14, 12.5),
    onTime: kpi(4000, 10, -3),
    late: kpi(1200, 4, 0),
    discounts: kpi(300, 2, null),
    bonus: kpi(150, 0, null),
    refunds: kpi(90, 1, null),
  },
  teachers: [
    {
      userId: "t1",
      fullName: "Aziza Karimova",
      groupsCount: 3,
      courses: ["English A1", "IELTS"],
      studentsCount: 28,
      totalPayments: 3100,
      debt: 450,
    },
    {
      userId: "t2",
      fullName: "Bobur Aliyev",
      groupsCount: 1,
      courses: ["Math"],
      studentsCount: 9,
      totalPayments: 2100,
      debt: 0,
    },
  ],
  staff: [
    {
      userId: "s1",
      fullName: "Dilnoza Karimova",
      roles: ["Admin"],
      paymentsCount: 14,
      totalPayments: 5200,
      refunds: 90,
    },
  ],
};

const payment = (id: string, over: Partial<StudentPaymentRow> = {}): StudentPaymentRow => ({
  id,
  studentId: `st-${id}`,
  studentName: `Student ${id}`,
  groupId: "g1",
  groupName: "English A1 morning",
  teacherName: "Aziza Karimova",
  courseName: "English A1",
  amount: 400,
  bonus: 0,
  refunded: 0,
  paidAt: `${THIS_MONTH}-05`,
  effectiveMonth: THIS_MONTH,
  comment: null,
  receivedByName: "Dilnoza Karimova",
  methodName: "Cash",
  ...over,
});

const paymentsPage = (
  items: StudentPaymentRow[],
  page = 1,
  total = items.length,
): StudentPaymentsPage => ({ items, page, pageSize: 30, total, totalAmount: 5200 });

const PAYMENT_OPTIONS: StudentPaymentsOptions = {
  groups: [{ id: "g1", name: "English A1 morning" }],
  methods: [
    { id: "pm1", name: "Cash" },
    { id: "pm2", name: "Card" },
  ],
  teachers: [{ id: "t1", fullName: "Aziza Karimova" }],
  courses: [{ id: "c1", name: "English A1" }],
  staff: [{ id: "s1", fullName: "Dilnoza Karimova" }],
};

const CHURN: ChurnReport = {
  from: `${THIS_MONTH}-01`,
  to: monthBounds(YEAR, MONTH).to,
  kpis: {
    churnRate: 4.2,
    leftCount: 5,
    activeAtStart: 120,
    lostRevenue: 2000,
    avgLifetimeMonths: 6.5,
  },
  dynamics: [
    { date: `${THIS_MONTH}-01`, count: 0 },
    { date: `${THIS_MONTH}-02`, count: 3 },
    { date: `${THIS_MONTH}-03`, count: 2 },
  ],
  breakdown: {
    course: [
      { name: "English A1", count: 4 },
      { name: "Math", count: 1 },
    ],
    teacher: [{ name: "Aziza Karimova", count: 5 }],
    branch: [{ name: "Chilonzor", count: 5 }],
    status: [
      { name: "ACTIVE", count: 4 },
      { name: "ARCHIVED", count: 1 },
    ],
    reason: [
      { name: "Moved away", count: 3 },
      { name: "", count: 2 },
    ],
    joinedThisMonth: 2,
  },
  transfers: { total: 3, leftAfterPercent: 33.3, reasons: [{ name: "Schedule", count: 3 }] },
  discounts: { withDiscount: 1, fullPrice: 4 },
  rows: [
    {
      membershipId: "m1",
      studentId: "st1",
      fullName: "Jasur Toshmatov",
      groupId: "g1",
      groupName: "English A1 morning",
      courseName: "English A1",
      branchName: "Chilonzor",
      hasDiscount: true,
      teacherName: "Aziza Karimova",
      reason: "Moved away",
      leftAt: `${THIS_MONTH}-02`,
      leftByName: "Dilnoza Karimova",
      note: "Family moved to Samarkand",
    },
    {
      membershipId: "m2",
      studentId: "st2",
      fullName: "Malika Yusupova",
      groupId: "g1",
      groupName: "English A1 morning",
      courseName: "English A1",
      branchName: "Chilonzor",
      hasDiscount: false,
      teacherName: null,
      reason: null,
      leftAt: `${THIS_MONTH}-03`,
      leftByName: null,
      note: null,
    },
  ],
  reasons: [
    { id: "r1", name: "Moved away", kind: "LEAVE", isActive: true },
    { id: "r2", name: "Schedule", kind: "TRANSFER", isActive: false },
  ],
};

const CHURN_OPTIONS: ChurnOptions = {
  courses: [{ id: "c1", name: "English A1" }],
  teachers: [{ id: "t1", name: "Aziza Karimova" }],
  groups: [{ id: "g1", name: "English A1 morning" }],
};

const LEADS: LeadsReport = {
  year: YEAR,
  month: MONTH,
  kpis: {
    newLeads: 40,
    conversions: 12,
    lost: 6,
    bestSource: { name: "Instagram", count: 22 },
    bestSalesperson: { name: "Dilnoza Karimova", count: 7 },
    trials: 15,
    trialsAttended: 11,
  },
  funnel: [
    { stage: "NEW", count: 14 },
    { stage: "CONTACTED", count: 8 },
    { stage: "UNREACHABLE", count: 0 },
    { stage: "LOST", count: 6 },
    { stage: "CONVERTED", count: 12 },
  ],
  byMonth: Array.from({ length: 12 }, (_, index) => ({
    month: `${YEAR}-${String(index + 1).padStart(2, "0")}`,
    created: index + 1 === MONTH ? 40 : 10,
    converted: index + 1 === MONTH ? 12 : 3,
    lost: index + 1 === MONTH ? 6 : 1,
  })),
  byCourse: [{ name: "English A1", count: 25 }],
  bySource: [
    { name: "Instagram", count: 22 },
    { name: "Friends", count: 18 },
  ],
  trialsBySource: [
    { name: "Instagram", leads: 22, trials: 9, attended: 7, converted: 5 },
    { name: null, leads: 3, trials: 1, attended: 0, converted: 0 },
  ],
  sources: [
    { id: "src1", name: "Instagram" },
    { id: "src2", name: "Friends" },
  ],
};

const REFERRALS: ReferralsReport = {
  year: YEAR,
  month: MONTH,
  kpis: { leads: 6, joined: 2, coins: 100, bonus: 250, referrers: 3 },
  byMonth: Array.from({ length: 12 }, (_, index) => ({
    month: `${YEAR}-${String(index + 1).padStart(2, "0")}`,
    leads: index + 1 === MONTH ? 6 : 0,
    joined: index + 1 === MONTH ? 2 : 0,
  })),
  rows: [
    { studentId: "st1", fullName: "Jasur Toshmatov", leads: 4, joined: 2, coins: 100, bonus: 250 },
    { studentId: "st2", fullName: "Malika Yusupova", leads: 2, joined: 0, coins: 0, bonus: 0 },
  ],
  referred: [
    {
      id: "p1",
      fullName: "Sardor Rahimov",
      phone: "+998901112233",
      referrerName: "Jasur Toshmatov",
      createdAt: `${THIS_MONTH}-04T08:00:00.000Z`,
      joined: true,
      joinedAt: `${THIS_MONTH}-10`,
    },
    {
      id: "p2",
      fullName: "Nodira Saidova",
      phone: null,
      referrerName: "Malika Yusupova",
      createdAt: `${THIS_MONTH}-06T08:00:00.000Z`,
      joined: false,
      joinedAt: null,
    },
  ],
};

const studentsReport = (page = 1): StudentsReport => ({
  from: `${THIS_MONTH}-01`,
  to: monthBounds(YEAR, MONTH).to,
  kpis: { total: 130, newInPeriod: 9, multiCourse: 4, attendancePercent: 87.5, gradeAverage: null },
  attendance: {
    totals: { expected: 400, present: 350, absent: 30, unmarked: 20 },
    rows: [
      {
        groupId: "g1",
        groupName: "English A1 morning",
        teacherName: "Aziza Karimova",
        students: 12,
        lessons: 13,
        expected: 156,
        present: 140,
        absent: 10,
        unmarked: 6,
      },
    ],
  },
  performance: {
    rows: [
      {
        studentId: page === 1 ? "st1" : "st9",
        fullName: page === 1 ? "Jasur Toshmatov" : "Zarina Ahmedova",
        groups: ["English A1 morning", "IELTS evening"],
        teachers: ["Aziza Karimova"],
        courses: ["English A1", "IELTS"],
        grades: [
          { groupName: "English A1 morning", average: 4.5 },
          { groupName: "IELTS evening", average: null },
        ],
        average: 4.5,
      },
    ],
    page,
    pageSize: 10,
    total: 11,
  },
  options: {
    groups: [{ id: "g1", name: "English A1 morning" }],
    teachers: [{ id: "t1", fullName: "Aziza Karimova" }],
  },
});

const statistics = (view: StatisticsReport["view"] = "monthly"): StatisticsReport => ({
  view,
  from: `${THIS_MONTH}-01`,
  to: monthBounds(YEAR, MONTH).to,
  year: YEAR,
  month: MONTH,
  workHours: { start: "09:00", end: "21:00" },
  kpis: {
    utilisation: 42,
    freeHours: 180,
    students: 21,
    potentialRevenue: 9000,
    freeSeats: 15,
    possibleStudents: 60,
  },
  rows: [
    {
      roomId: "room1",
      roomName: "Room 1",
      capacity: 12,
      roomHours: 312,
      groupId: "g1",
      groupName: "English A1 morning",
      students: 9,
      freeSeats: 3,
      lessonHours: 26,
      coursePrice: 400,
      totalSum: 3600,
      freeHours: null,
      seatHours: 312,
      actualSeatHours: 234,
      planSeatHours: 312,
      fik: 75,
      isRoomTotal: false,
    },
    {
      roomId: "room1",
      roomName: "Room 1",
      capacity: 12,
      roomHours: 312,
      groupId: null,
      groupName: null,
      students: 9,
      freeSeats: 3,
      lessonHours: 26,
      coursePrice: null,
      totalSum: 3600,
      freeHours: 286,
      seatHours: 3744,
      actualSeatHours: 234,
      planSeatHours: 312,
      fik: 8,
      isRoomTotal: true,
    },
  ],
});

describe("the list of reports", () => {
  it("lists the reports the person may see and opens the app's own in the app", async () => {
    serve({});
    await show(<ReportsScreen />);
    const hidden = { includeHiddenElements: true };
    for (const key of [
      "payments",
      "studentPayments",
      "churn",
      "graduates",
      "staffAttendance",
      "coins",
      "leads",
      "referrals",
      "students",
      "statistics",
    ]) {
      expect(screen.getByTestId(`report-${key}`)).toBeTruthy();
    }
    expect(screen.getByTestId("report-payments")).toHaveTextContent("Payments");
    // The three the app does not have yet carry the sign of a page on the site.
    expect(screen.getByTestId("report-graduates-site", hidden)).toBeTruthy();
    expect(screen.getByTestId("report-staffAttendance-site", hidden)).toBeTruthy();
    expect(screen.getByTestId("report-coins-site", hidden)).toBeTruthy();
    expect(screen.queryByTestId("report-churn-site", hidden)).toBeNull();

    await fireEvent.press(screen.getByTestId("report-studentPayments"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/reports/student-payments");
    await fireEvent.press(screen.getByTestId("report-graduates"));
    expect(mockOpenOnSite).toHaveBeenLastCalledWith("/en/reports/graduates");
  });

  it("leaves out what the person has no right to", async () => {
    mockPermissions = ["reports.leads"];
    serve({});
    await show(<ReportsScreen />);
    expect(screen.getByTestId("report-leads")).toBeTruthy();
    expect(screen.getByTestId("report-referrals")).toBeTruthy();
    expect(screen.queryByTestId("report-payments")).toBeNull();
    expect(screen.queryByTestId("report-churn")).toBeNull();
  });

  it("knows which of the site's report addresses the app has", () => {
    expect(nativeRoute("/reports")).toBe("/staff/reports");
    expect(nativeRoute("/reports/payments")).toBe("/staff/reports/payments");
    expect(nativeRoute("/reports/student-payments")).toBe("/staff/reports/student-payments");
    expect(nativeRoute("/reports/churn")).toBe("/staff/reports/churn");
    expect(nativeRoute("/reports/leads")).toBe("/staff/reports/leads");
    expect(nativeRoute("/reports/referrals")).toBe("/staff/reports/referrals");
    expect(nativeRoute("/reports/students")).toBe("/staff/reports/students");
    expect(nativeRoute("/reports/statistics")).toBe("/staff/reports/statistics");
    expect(nativeRoute("/reports/graduates")).toBeNull();
    expect(nativeRoute("/reports/staff-attendance")).toBeNull();
    expect(nativeRoute("/reports/coins")).toBeNull();
    expect(nativeRoute("/reports/payments/export.xlsx")).toBeNull();
  });
});

describe("the payments report", () => {
  it("shows the month's six figures against the month before, and the teachers", async () => {
    serve({ "GET /reports/payments": PAYMENTS });
    await show(<PaymentsReportScreen />);
    expect(await screen.findByTestId("kpi-total")).toHaveTextContent(/Total payments.*5,?200/);
    const sent = asked("GET", "/reports/payments");
    expect(sent.get("year")).toBe(String(YEAR));
    expect(sent.get("month")).toBe(String(MONTH));
    expect(sent.get("branchId")).toBeNull();

    expect(screen.getByTestId("kpi-total")).toHaveTextContent(/14 payments/);
    expect(screen.getByTestId("kpi-total-change")).toHaveTextContent("+12.5%");
    expect(screen.getByTestId("kpi-onTime-change")).toHaveTextContent("-3%");
    expect(screen.getByTestId("kpi-late-change")).toHaveTextContent("0%");
    expect(screen.queryByTestId("kpi-discounts-change")).toBeNull();
    expect(screen.getByTestId("kpi-discounts")).toHaveTextContent(/2 students/);
    expect(screen.getByTestId("kpi-refunds")).toHaveTextContent(/1 refunds/);

    const teacher = screen.getByTestId("payments-teacher-t1");
    expect(teacher).toHaveTextContent(/Aziza Karimova.*English A1, IELTS/);
    expect(teacher).toHaveTextContent(/Groups3.*Students28.*Total.*3,?100.*Debt.*450/);
    expect(screen.getByTestId("payments-teacher-t2")).toHaveTextContent(/Debt—/);
    expect(screen.queryByTestId("payments-staff")).toBeNull();
    // One branch is chosen at the top of the app.
    expect(screen.queryByTestId("report-branch")).toBeNull();
  });

  it("shows who took the money in, and asks again for another month", async () => {
    serve({ "GET /reports/payments": PAYMENTS });
    await show(<PaymentsReportScreen />);
    await screen.findByTestId("kpi-total");
    await fireEvent.press(screen.getByTestId("payments-tab-staff"));
    expect(screen.getByTestId("payments-staff-s1")).toHaveTextContent(
      /Dilnoza Karimova.*Admin.*Payments14.*Total.*5,?200.*Refunds.*90/,
    );
    expect(screen.queryByTestId("payments-teachers")).toBeNull();

    await fireEvent.press(screen.getByTestId("report-month"));
    await fireEvent.press(await screen.findByTestId("report-month-option-3"));
    await waitFor(() => expect(asked("GET", "/reports/payments").get("month")).toBe("3"));
    await fireEvent.press(screen.getByTestId("report-year"));
    await fireEvent.press(await screen.findByTestId(`report-year-option-${YEAR - 1}`));
    await waitFor(() =>
      expect(asked("GET", "/reports/payments").get("year")).toBe(String(YEAR - 1)),
    );

    await fireEvent.press(screen.getByTestId("report-excel"));
    expect(mockOpenOnSite).toHaveBeenLastCalledWith(
      `/en/reports/payments?year=${YEAR - 1}&month=3&tab=staff`,
    );
  });

  it("offers the branch only to someone who sees several and chose none", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    mockActive = null;
    serve({ "GET /reports/payments": { ...PAYMENTS, teachers: [], staff: [] } });
    await show(<PaymentsReportScreen />);
    await screen.findByTestId("kpi-total");
    expect(screen.getByText("No teachers with payments in this month.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("report-branch"));
    await fireEvent.press(await screen.findByTestId("report-branch-option-b2"));
    await waitFor(() => expect(asked("GET", "/reports/payments").get("branchId")).toBe("b2"));
    await fireEvent.press(screen.getByTestId("payments-tab-staff"));
    expect(screen.getByText("No staff received payments in this month.")).toBeTruthy();
  });

  it("says why when the server refuses, with Try again", async () => {
    serve({
      "GET /reports/payments": answer(403, {
        error: { code: "FORBIDDEN", message: "errors.forbidden" },
      }),
    });
    await show(<PaymentsReportScreen />);
    expect(await screen.findByTestId("retry")).toBeTruthy();
  });
});

describe("the student payments report", () => {
  const routes = (pages: Record<number, StudentPaymentsPage>) => ({
    "GET /reports/student-payments/options": PAYMENT_OPTIONS,
    "GET /reports/student-payments": (url: string) =>
      pages[Number(new URL(url, "http://x").searchParams.get("page") ?? "1")] ?? pages[1],
  });

  it("lists the month's payments with their count and sum", async () => {
    serve(
      routes({
        1: paymentsPage([
          payment("p1", {
            studentName: "Jasur Toshmatov",
            refunded: 100,
            bonus: 50,
            comment: "Paid by the father",
          }),
          payment("p2", { teacherName: null, receivedByName: null, methodName: null }),
        ]),
      }),
    );
    await show(<StudentPaymentsReportScreen />);
    expect(await screen.findByTestId("student-payments-summary")).toHaveTextContent(
      /2 payments.*5,?200/,
    );
    const sent = asked("GET", "/reports/student-payments");
    expect(sent.get("year")).toBe(String(YEAR));
    expect(sent.get("month")).toBe(String(MONTH));
    expect(sent.get("page")).toBe("1");
    expect(sent.get("pageSize")).toBe("30");
    expect(sent.get("byPaidAt")).toBeNull();
    expect(sent.get("q")).toBeNull();

    const card = screen.getByTestId("student-payment-p1");
    expect(card).toHaveTextContent(/Jasur Toshmatov.*400.*−.*100/);
    expect(card).toHaveTextContent(/English A1 morning, Aziza Karimova/);
    expect(card).toHaveTextContent(/For month: .* \d{4}, Cash/);
    expect(card).toHaveTextContent(/Bonus: .*50/);
    expect(card).toHaveTextContent(/Received by: Dilnoza Karimova/);
    expect(card).toHaveTextContent(/Paid by the father/);
    expect(screen.getByTestId("student-payment-p2")).not.toHaveTextContent(/Received by/);
    expect(screen.queryByTestId("student-payments-more")).toBeNull();

    await fireEvent.press(card);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "st-p1" },
    });
  });

  it("asks again for every filter, and opens the same list on the site for Excel", async () => {
    serve(routes({ 1: paymentsPage([payment("p1")]) }));
    await show(<StudentPaymentsReportScreen />);
    await screen.findByTestId("student-payment-p1");
    const last = () => asked("GET", "/reports/student-payments");

    await fireEvent.press(screen.getByTestId("student-payments-by-paid-at"));
    await waitFor(() => expect(last().get("byPaidAt")).toBe("true"));
    await fireEvent.changeText(screen.getByTestId("student-payments-search"), " Jasur ");
    await waitFor(() => expect(last().get("q")).toBe("Jasur"));
    for (const [filter, option, key] of [
      ["group", "g1", "groupId"],
      ["method", "pm2", "paymentMethodId"],
      ["teacher", "t1", "teacherId"],
      ["course", "c1", "courseId"],
      ["bonus", "yes", "bonus"],
      ["received-by", "s1", "receivedById"],
    ] as const) {
      await fireEvent.press(screen.getByTestId(`student-payments-${filter}`));
      await fireEvent.press(
        await screen.findByTestId(`student-payments-${filter}-option-${option}`),
      );
      await waitFor(() => expect(last().get(key)).toBe(option));
    }

    await fireEvent.press(screen.getByTestId("report-excel"));
    expect(mockOpenOnSite).toHaveBeenLastCalledWith(
      `/en/reports/student-payments?year=${YEAR}&month=${MONTH}&byPaidAt=true&q=Jasur` +
        "&groupId=g1&paymentMethodId=pm2&teacherId=t1&courseId=c1&bonus=yes&receivedById=s1",
    );

    // "All" takes a filter off again.
    await fireEvent.press(screen.getByTestId("student-payments-method"));
    await fireEvent.press(await screen.findByTestId("student-payments-method-option-none"));
    await waitFor(() => expect(last().get("paymentMethodId")).toBeNull());
  });

  it("shows more a page at a time", async () => {
    const first = Array.from({ length: 30 }, (_, index) => payment(`a${index}`));
    serve(
      routes({
        1: paymentsPage(first, 1, 31),
        2: paymentsPage([payment("last")], 2, 31),
      }),
    );
    await show(<StudentPaymentsReportScreen />);
    await screen.findByTestId("student-payment-a0");
    expect(screen.queryByTestId("student-payment-last")).toBeNull();
    await fireEvent.press(screen.getByTestId("student-payments-more"));
    expect(await screen.findByTestId("student-payment-last")).toBeTruthy();
    expect(asked("GET", "/reports/student-payments").get("page")).toBe("2");
    await waitFor(() => expect(screen.queryByTestId("student-payments-more")).toBeNull());
  });

  it("says so when nothing matches, and does not open a student without the right", async () => {
    mockPermissions = ["reports.payments"];
    serve(routes({ 1: paymentsPage([]) }));
    await show(<StudentPaymentsReportScreen />);
    expect(await screen.findByText("No payments match the filters.")).toBeTruthy();
  });
});

describe("the left students report", () => {
  const routes = () => ({
    "GET /reports/churn/options": CHURN_OPTIONS,
    "GET /reports/churn": CHURN,
    "POST /leave-reasons": { id: "r3", name: "Too far", kind: "TRANSFER", isActive: true },
    "PATCH /leave-reasons/r2": { ...CHURN.reasons[1], isActive: true },
    "DELETE /leave-reasons/r1": undefined,
  });

  it("shows the figures, the leavers by day and by reason, the moves and who left", async () => {
    serve(routes());
    await show(<ChurnReportScreen />);
    expect(await screen.findByTestId("kpi-churnRate")).toHaveTextContent(
      /4\.2%.*of 120 active at start/,
    );
    const sent = asked("GET", "/reports/churn");
    expect(sent.get("from")).toBe(`${THIS_MONTH}-01`);
    expect(sent.get("to")).toBe(monthBounds(YEAR, MONTH).to);
    expect(screen.getByTestId("kpi-leftCount")).toHaveTextContent(/Left5/);
    expect(screen.getByTestId("kpi-lostRevenue")).toHaveTextContent(/2,?000.*per month/);
    expect(screen.getByTestId("kpi-avgLifetime")).toHaveTextContent(/6\.5 months/);

    // The last day somebody left is picked; a press reads another day.
    expect(screen.getByTestId("churn-days-picked")).toHaveTextContent(/Left2/);
    await fireEvent.press(screen.getByTestId("churn-days-step-1"));
    expect(screen.getByTestId("churn-days-picked")).toHaveTextContent(/Left3/);

    // Days up to two months are a bar each; a longer period is added up by month.
    expect(
      leaversByMonth([
        { date: "2026-01-30", count: 1 },
        { date: "2026-01-31", count: 2 },
        { date: "2026-02-01", count: 0 },
        { date: "2027-01-01", count: 4 },
      ]),
    ).toEqual([
      { year: 2026, month: 1, count: 3 },
      { year: 2026, month: 2, count: 0 },
      { year: 2027, month: 1, count: 4 },
    ]);

    expect(screen.getByTestId("churn-by-reason")).toHaveTextContent(
      /Moved away3.*No reason given2/,
    );
    expect(screen.getByTestId("churn-by-list")).toHaveTextContent(/English A14.*Math1/);
    await fireEvent.press(screen.getByTestId("churn-by"));
    await fireEvent.press(await screen.findByTestId("churn-by-option-status"));
    expect(screen.getByTestId("churn-by-list")).toHaveTextContent(/Active4.*Archived1/);
    await fireEvent.press(screen.getByTestId("churn-by"));
    await fireEvent.press(await screen.findByTestId("churn-by-option-joinedThisMonth"));
    expect(screen.getByTestId("churn-by-list")).toHaveTextContent(/Joined this month2/);

    expect(screen.getByTestId("churn-transfers-total")).toHaveTextContent("3");
    expect(screen.getByTestId("churn-transfers")).toHaveTextContent(/33\.3%.*Schedule3/);
    expect(screen.getByTestId("churn-discounts")).toHaveTextContent(
      /Left with a discount1.*Left at full price4/,
    );

    const left = screen.getByTestId("churn-left-m1");
    expect(left).toHaveTextContent(/Jasur Toshmatov/);
    expect(left).toHaveTextContent(/English A1 morning, English A1, Aziza Karimova/);
    expect(left).toHaveTextContent(/Moved away.*Discount.*Removed by: Dilnoza Karimova/);
    expect(left).toHaveTextContent(/Family moved to Samarkand/);
    expect(screen.getByTestId("churn-left-m2")).toHaveTextContent(/No reason given/);
    await fireEvent.press(left);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "st1" },
    });
  });

  it("asks again for other days and filters, and not for days in the wrong order", async () => {
    serve(routes());
    await show(<ChurnReportScreen />);
    await screen.findByTestId("kpi-churnRate");
    const last = () => asked("GET", "/reports/churn");
    const before = calls("GET", "/reports/churn").length;

    // Half a date is not asked for.
    await fireEvent.changeText(screen.getByTestId("churn-from"), "0101");
    await settled();
    expect(calls("GET", "/reports/churn")).toHaveLength(before);
    await fireEvent.changeText(screen.getByTestId("churn-from"), `0101${YEAR}`);
    await waitFor(() => expect(last().get("from")).toBe(`${YEAR}-01-01`));

    // The last day before the first: the field says so and the report stays.
    const asks = calls("GET", "/reports/churn").length;
    await fireEvent.changeText(screen.getByTestId("churn-to"), `0101${YEAR - 1}`);
    expect(await screen.findByText("End date must be after the start date")).toBeTruthy();
    await settled();
    expect(calls("GET", "/reports/churn")).toHaveLength(asks);

    for (const [filter, option, key] of [
      ["course", "c1", "courseId"],
      ["teacher", "t1", "teacherId"],
      ["group", "g1", "groupId"],
      ["reason", "Moved away", "reason"],
      ["discount", "no", "discount"],
    ] as const) {
      await fireEvent.press(screen.getByTestId(`churn-${filter}`));
      await fireEvent.press(await screen.findByTestId(`churn-${filter}-option-${option}`));
      await waitFor(() => expect(last().get(key)).toBe(option));
    }
    // One branch is chosen at the top of the app.
    expect(screen.queryByTestId("churn-branch")).toBeNull();
  });

  it("adds a long period up by month under the plot", async () => {
    const days = Array.from({ length: 90 }, (_, index) => {
      const date = new Date(Date.UTC(YEAR, 0, 1 + index)).toISOString().slice(0, 10);
      return { date, count: date.endsWith("-15") ? 2 : 0 };
    });
    serve({ ...routes(), "GET /reports/churn": { ...CHURN, dynamics: days } });
    await show(<ChurnReportScreen />);
    await screen.findByTestId("kpi-churnRate");
    // January, February and March: three bars, the last one with leavers picked.
    expect(screen.getByTestId("churn-days-step-2")).toBeTruthy();
    expect(screen.queryByTestId("churn-days-step-3")).toBeNull();
    expect(screen.getByTestId("churn-days-picked")).toHaveTextContent(
      new RegExp(`Mar ${YEAR}.*Left2`),
    );
  });

  it("works without the three filters on a server that has no list for them yet", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    mockActive = null;
    serve({ "GET /reports/churn": { ...CHURN, rows: [] } });
    await show(<ChurnReportScreen />);
    await screen.findByTestId("kpi-churnRate");
    await settled();
    expect(screen.queryByTestId("churn-course")).toBeNull();
    expect(screen.queryByTestId("churn-teacher")).toBeNull();
    expect(screen.queryByTestId("churn-group")).toBeNull();
    expect(screen.getByTestId("churn-reason")).toBeTruthy();
    expect(screen.getByText("Nobody left in this period.")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("churn-branch"));
    await fireEvent.press(await screen.findByTestId("churn-branch-option-b2"));
    await waitFor(() => expect(asked("GET", "/reports/churn").get("branchId")).toBe("b2"));
    expect(asked("GET", "/reports/churn/options").get("branchId")).toBe("b2");
  });

  it("sets up the reasons: add one, switch one on, remove one", async () => {
    serve(routes());
    await show(<ChurnReportScreen />);
    await fireEvent.press(await screen.findByTestId("churn-reasons-open"));
    expect(await screen.findByTestId("churn-reason-r1")).toHaveTextContent(/Moved away.*Leaving/);
    expect(screen.getByTestId("churn-reason-r2")).toHaveTextContent(/Schedule.*Transfer/);
    expect(screen.getByTestId("churn-reason-r1-active").props.accessibilityState).toMatchObject({
      checked: true,
    });

    await fireEvent.changeText(screen.getByTestId("churn-reasons-name"), " Too far ");
    await fireEvent.press(screen.getByTestId("churn-reasons-kind-TRANSFER"));
    await fireEvent.press(screen.getByTestId("churn-reasons-add"));
    await waitFor(() => expect(calls("POST", "/leave-reasons")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leave-reasons")[0]![1])).toEqual({
      name: "Too far",
      kind: "TRANSFER",
    });
    await waitFor(() => expect(screen.getByTestId("churn-reasons-name").props.value).toBe(""));

    await fireEvent.press(screen.getByTestId("churn-reason-r2-active"));
    await waitFor(() => expect(calls("PATCH", "/leave-reasons/r2")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/leave-reasons/r2")[0]![1])).toEqual({ isActive: true });

    await settled();
    const asks = calls("GET", "/reports/churn").length;
    await fireEvent.press(screen.getByTestId("churn-reason-r1-remove"));
    await waitFor(() => expect(calls("DELETE", "/leave-reasons/r1")).toHaveLength(1));
    // The report is read again: its list of reasons is the sheet's.
    await waitFor(() => expect(calls("GET", "/reports/churn").length).toBeGreaterThan(asks));
  });

  it("says why a reason was not added, and hides the set-up without the right", async () => {
    serve({
      ...routes(),
      "POST /leave-reasons": answer(409, {
        error: { code: "CONFLICT", message: "errors.conflict" },
      }),
    });
    await show(<ChurnReportScreen />);
    await fireEvent.press(await screen.findByTestId("churn-reasons-open"));
    await fireEvent.changeText(await screen.findByTestId("churn-reasons-name"), "Moved away");
    await fireEvent.press(screen.getByTestId("churn-reasons-add"));
    expect(await screen.findByTestId("churn-reasons-problem")).toBeTruthy();
    expect(screen.getByTestId("churn-reasons-name").props.value).toBe("Moved away");
  });

  it("has no set-up of reasons for someone without the right to the catalogue", async () => {
    mockPermissions = ["reports.view"];
    serve(routes());
    await show(<ChurnReportScreen />);
    await screen.findByTestId("kpi-churnRate");
    expect(screen.queryByTestId("churn-reasons-open")).toBeNull();
    // Without the right to students a card is not a link.
    await fireEvent.press(screen.getByTestId("churn-left-m1"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("the lead statements", () => {
  it("shows the figures, the funnel, the year by months and the trials by source", async () => {
    serve({ "GET /reports/leads": LEADS });
    await show(<LeadsReportScreen />);
    expect(await screen.findByTestId("kpi-newLeads")).toHaveTextContent(/New leads40/);
    expect(screen.getByTestId("kpi-bestSource")).toHaveTextContent(/Instagram.*22 leads/);
    expect(screen.getByTestId("kpi-bestSalesperson")).toHaveTextContent(
      /Dilnoza Karimova.*7 conversions/,
    );
    expect(screen.getByTestId("kpi-trials")).toHaveTextContent(/15/);
    expect(screen.getByTestId("kpi-trialsAttended")).toHaveTextContent(/11/);

    expect(screen.getByTestId("leads-funnel")).toHaveTextContent(
      /New14.*Contacted8.*Unreachable0.*Lost6.*Became a student12/,
    );
    // The month of the report is the one read out under the year's bars.
    expect(screen.getByTestId("leads-months-picked")).toHaveTextContent(
      /Created40.*Converted12.*Lost6/,
    );
    const other = MONTH === 1 ? 1 : 0;
    await fireEvent.press(screen.getByTestId(`leads-months-step-${other}`));
    expect(screen.getByTestId("leads-months-picked")).toHaveTextContent(
      /Created10.*Converted3.*Lost1/,
    );
    expect(screen.getByTestId("leads-by-source")).toHaveTextContent(/Instagram22.*Friends18/);
    expect(screen.getByTestId("leads-by-course")).toHaveTextContent(/English A125/);
    expect(screen.getByTestId("leads-trials-0")).toHaveTextContent(
      /Instagram.*New leads22.*Trials9.*Came7.*Became students5/,
    );
    expect(screen.getByTestId("leads-trials-1")).toHaveTextContent(/No source/);
  });

  it("asks again for one source and sends the same to the site for Excel", async () => {
    serve({
      "GET /reports/leads": {
        ...LEADS,
        kpis: { ...LEADS.kpis, bestSource: null, bestSalesperson: null },
        trialsBySource: [],
        byCourse: [],
      },
    });
    await show(<LeadsReportScreen />);
    expect(await screen.findByTestId("kpi-bestSource")).toHaveTextContent(/Top source—/);
    expect(screen.getByTestId("leads-trials-empty")).toHaveTextContent("No trials this month.");
    expect(screen.getByTestId("leads-by-course-empty")).toHaveTextContent(
      "No leads in this period.",
    );
    await fireEvent.press(screen.getByTestId("leads-source"));
    await fireEvent.press(await screen.findByTestId("leads-source-option-src2"));
    await waitFor(() => expect(asked("GET", "/reports/leads").get("sourceId")).toBe("src2"));
    await fireEvent.press(screen.getByTestId("report-excel"));
    expect(mockOpenOnSite).toHaveBeenLastCalledWith(
      `/en/reports/leads?year=${YEAR}&month=${MONTH}&sourceId=src2`,
    );
  });
});

describe("the referral programme report", () => {
  it("shows who invited whom and what it earned them", async () => {
    serve({ "GET /reports/referrals": REFERRALS });
    await show(<ReferralsReportScreen />);
    expect(await screen.findByTestId("kpi-leads")).toHaveTextContent(/Leads from invites6/);
    expect(screen.getByTestId("kpi-bonus")).toHaveTextContent(/250/);
    expect(screen.getByTestId("referrals-referrers")).toHaveTextContent("Students who invited: 3");
    expect(screen.getByTestId("referrals-months-picked")).toHaveTextContent(/Leads6.*Joined2/);

    expect(screen.getByTestId("referrer-st1")).toHaveTextContent(
      /Jasur Toshmatov.*Leads4.*Joined2.*Coins100.*Bonus.*250/,
    );
    expect(screen.getByTestId("referrer-st2")).toHaveTextContent(/Bonus—/);
    expect(screen.getByTestId("referred-p1")).toHaveTextContent(
      /Sardor Rahimov.*\+998901112233.*Invited by: Jasur Toshmatov.*Joined a group on/,
    );
    expect(screen.getByTestId("referred-p2")).toHaveTextContent(
      /Nodira Saidova.*Invited by: Malika Yusupova.*Lead/,
    );
  });

  it("says so when nobody invited anyone", async () => {
    serve({
      "GET /reports/referrals": {
        ...REFERRALS,
        kpis: { leads: 0, joined: 0, coins: 0, bonus: 0, referrers: 0 },
        byMonth: REFERRALS.byMonth.map((m) => ({ ...m, leads: 0, joined: 0 })),
        rows: [],
        referred: [],
      },
    });
    await show(<ReferralsReportScreen />);
    await screen.findByTestId("kpi-leads");
    expect(screen.getAllByText("Nothing this month")).toHaveLength(3);
    expect(screen.queryByTestId("referrals-months")).toBeNull();
  });
});

describe("the students report", () => {
  const routes = () => ({
    "GET /reports/students": (url: string) =>
      studentsReport(Number(new URL(url, "http://x").searchParams.get("page") ?? "1")),
  });

  it("shows the figures and attendance group by group", async () => {
    serve(routes());
    await show(<StudentsReportScreen />);
    expect(await screen.findByTestId("kpi-total")).toHaveTextContent(/Students130/);
    const sent = asked("GET", "/reports/students");
    expect(sent.get("from")).toBe(`${THIS_MONTH}-01`);
    expect(sent.get("to")).toBe(monthBounds(YEAR, MONTH).to);
    expect(sent.get("page")).toBeNull();
    expect(sent.get("status")).toBeNull();
    expect(screen.getByTestId("kpi-attendance")).toHaveTextContent(/87\.5%/);
    expect(screen.getByTestId("kpi-gradeAverage")).toHaveTextContent(/Average grade—/);
    expect(screen.getByTestId("students-attendance-totals")).toHaveTextContent(
      /Expected400.*Present350.*Absent30.*Unmarked20/,
    );
    const group = screen.getByTestId("students-group-g1");
    expect(group).toHaveTextContent(/English A1 morning.*Aziza Karimova/);
    expect(group).toHaveTextContent(/Students12.*Lessons13.*Unmarked6.*Present140.*Absent10/);
    await fireEvent.press(group);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/group/[id]",
      params: { id: "g1" },
    });
  });

  it("shows each student's grades a page at a time", async () => {
    serve(routes());
    await show(<StudentsReportScreen />);
    await screen.findByTestId("kpi-total");
    await fireEvent.press(screen.getByTestId("students-tab-performance"));
    const student = await screen.findByTestId("students-student-st1");
    expect(student).toHaveTextContent(/Jasur Toshmatov.*Average4\.5/);
    expect(student).toHaveTextContent(/English A1, IELTS, Aziza Karimova/);
    expect(student).toHaveTextContent(/English A1 morning4\.5.*IELTS evening—/);
    expect(screen.getByTestId("students-range")).toHaveTextContent("1–1 of 11");
    expect(screen.getByTestId("students-previous").props.accessibilityState).toMatchObject({
      disabled: true,
    });

    await fireEvent.press(screen.getByTestId("students-next"));
    expect(await screen.findByTestId("students-student-st9")).toBeTruthy();
    expect(asked("GET", "/reports/students").get("page")).toBe("2");
    expect(screen.getByTestId("students-range")).toHaveTextContent("11–11 of 11");
    expect(screen.getByTestId("students-next").props.accessibilityState).toMatchObject({
      disabled: true,
    });

    // Another filter starts from the first page again.
    await fireEvent.press(screen.getByTestId("students-status"));
    await fireEvent.press(await screen.findByTestId("students-status-option-ARCHIVED"));
    await waitFor(() => expect(asked("GET", "/reports/students").get("status")).toBe("ARCHIVED"));
    expect(asked("GET", "/reports/students").get("page")).toBeNull();

    await fireEvent.press(screen.getByTestId("report-excel"));
    expect(mockOpenOnSite).toHaveBeenLastCalledWith(
      `/en/reports/students?year=${YEAR}&month=${MONTH}&from=${THIS_MONTH}-01` +
        `&to=${monthBounds(YEAR, MONTH).to}&status=ARCHIVED&tab=performance`,
    );
  });

  it("takes other days, and the days of another month when the month changes", async () => {
    serve(routes());
    await show(<StudentsReportScreen />);
    await screen.findByTestId("kpi-total");
    const last = () => asked("GET", "/reports/students");
    await fireEvent.changeText(screen.getByTestId("students-from"), `1501${YEAR}`);
    await waitFor(() => expect(last().get("from")).toBe(`${YEAR}-01-15`));

    await fireEvent.press(screen.getByTestId("report-month"));
    await fireEvent.press(await screen.findByTestId("report-month-option-2"));
    await waitFor(() => expect(last().get("month")).toBe("2"));
    expect(last().get("from")).toBe(`${YEAR}-02-01`);
    expect(last().get("to")).toBe(monthBounds(YEAR, 2).to);
    expect(screen.getByTestId("students-from").props.value).toBe(`01.02.${YEAR}`);

    await fireEvent.press(screen.getByTestId("students-group"));
    await fireEvent.press(await screen.findByTestId("students-group-option-g1"));
    await waitFor(() => expect(last().get("groupId")).toBe("g1"));
    await fireEvent.press(screen.getByTestId("students-teacher"));
    await fireEvent.press(await screen.findByTestId("students-teacher-option-t1"));
    await waitFor(() => expect(last().get("teacherId")).toBe("t1"));
  });
});

describe("the centre's statistics", () => {
  const routes = () => ({
    "GET /reports/statistics": (url: string) =>
      statistics(
        (new URL(url, "http://x").searchParams.get("view") as StatisticsReport["view"] | null) ??
          "monthly",
      ),
  });

  it("shows how full the rooms are, room by room with their groups", async () => {
    serve(routes());
    await show(<StatisticsReportScreen />);
    expect(await screen.findByTestId("kpi-utilisation")).toHaveTextContent(/Room utilisation42%/);
    const sent = asked("GET", "/reports/statistics");
    expect(sent.get("view")).toBeNull();
    expect(sent.get("date")).toBeNull();
    expect(sent.get("month")).toBe(String(MONTH));
    expect(screen.getByTestId("kpi-freeHours")).toHaveTextContent(/180 h/);
    expect(screen.getByTestId("kpi-potentialRevenue")).toHaveTextContent(
      /9,?000.*if every seat were filled/,
    );
    expect(screen.getByTestId("statistics-period")).toHaveTextContent(/working hours 09:00–21:00/);

    const room = screen.getByTestId("statistics-room-room1");
    expect(screen.getByTestId("statistics-room-room1-fik")).toHaveTextContent("Utilisation: 8%");
    expect(room).toHaveTextContent(/Room 1.*Capacity12.*Room hours312.*Lesson hours26/);
    expect(room).toHaveTextContent(/Free hours286.*Students9.*Free seats3.*Seat-hours3744/);
    expect(room).toHaveTextContent(/English A1 morning.*Utilisation: 75%/);
    expect(room).toHaveTextContent(/Planned seat-hours312.*Price.*400.*Total.*3,?600/);

    await fireEvent.press(screen.getByTestId("statistics-rooms-open"));
    expect(mockOpenOnSite).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenLastCalledWith("/staff/settings/rooms");
  });

  it("asks for a week or a day by a date, without the month", async () => {
    serve(routes());
    await show(<StatisticsReportScreen />);
    await screen.findByTestId("kpi-utilisation");
    expect(screen.queryByTestId("statistics-date")).toBeNull();

    await fireEvent.press(screen.getByTestId("statistics-view-weekly"));
    await waitFor(() => expect(asked("GET", "/reports/statistics").get("view")).toBe("weekly"));
    expect(asked("GET", "/reports/statistics").get("date")).toBe(centreToday());
    expect(screen.queryByTestId("report-month")).toBeNull();
    expect(screen.getByTestId("report-year")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("statistics-date"), `0203${YEAR}`);
    await waitFor(() =>
      expect(asked("GET", "/reports/statistics").get("date")).toBe(`${YEAR}-03-02`),
    );
    await fireEvent.press(screen.getByTestId("statistics-view-daily"));
    await waitFor(() => expect(asked("GET", "/reports/statistics").get("view")).toBe("daily"));

    await fireEvent.press(screen.getByTestId("report-excel"));
    expect(mockOpenOnSite).toHaveBeenLastCalledWith(
      `/en/reports/statistics?year=${YEAR}&month=${MONTH}&view=daily&date=${YEAR}-03-02`,
    );
  });

  it("says what to do when no room has lessons, and hides the rooms link without the right", async () => {
    mockPermissions = ["reports.view"];
    serve({ "GET /reports/statistics": { ...statistics(), rows: [] } });
    await show(<StatisticsReportScreen />);
    expect(await screen.findByText("No rooms with lessons in this period.")).toBeTruthy();
    expect(screen.getByText("Add rooms with capacities and assign them to groups.")).toBeTruthy();
    expect(screen.queryByTestId("statistics-rooms-open")).toBeNull();
  });
});
