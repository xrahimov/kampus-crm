import { notifyManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type {
  CoinReportOptions,
  CoinsReport,
  Product,
  ProductCategory,
  PurchaseRequest,
} from "@/api/office-coins";
import type { GraduatesReport } from "@/api/office-graduates";
import type { StaffAttendanceReport } from "@/api/office-staff-attendance";
import { CoinsReportScreen } from "@/features/reports/coins-report";
import { typedCount } from "@/features/reports/coins-sheets";
import { GraduatesReportScreen, typedBand } from "@/features/reports/graduates-report";
import {
  minutesText,
  StaffAttendanceReportScreen,
} from "@/features/reports/staff-attendance-report";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { centreToday } from "@/lib/days";
jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
const mockOpenOnSite = jest.fn<Promise<void>, [string]>();
jest.mock("@/lib/web", () => ({ openOnSite: (path: string) => mockOpenOnSite(path) }));
const mockSaveFile = jest.fn<Promise<string>, [string, string]>();
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));
const mockChoosePhoto = jest.fn();
jest.mock("@/features/files/pick", () => ({
  choosePhoto: (options: unknown) => mockChoosePhoto(options),
}));
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
 * The last three reports in the app (A-239): graduates with their results and
 * certificates, staff attendance with its five tabs, and coins with the
 * rating, the marketplace and the purchase requests. Each test plays the server.
 */
type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeAll(() => notifyManager.setScheduler((flush) => queueMicrotask(flush)));
afterAll(() => notifyManager.setScheduler((flush) => setTimeout(flush, 0)));

const ALL_RIGHTS = [
  "reports.view",
  "students.view",
  "students.update",
  "staff.update",
  "coins.manage",
];

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockOpenOnSite.mockReset();
  mockSaveFile.mockReset();
  mockSaveFile.mockResolvedValue("opened");
  mockOpenOnSite.mockResolvedValue();
  mockChoosePhoto.mockReset();
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

const TODAY = centreToday();
const [YEAR, MONTH] = TODAY.split("-").map(Number) as [number, number];
const THIS_MONTH = `${YEAR}-${String(MONTH).padStart(2, "0")}`;

/* ----- graduates ----- */

const GRADUATES: GraduatesReport = {
  year: YEAR,
  month: MONTH,
  kpis: {
    count: 2,
    bestTeacher: { name: "Aziz Rahimov", count: 2 },
    avgIelts: 6.5,
    commonCefr: "B2",
    universityPercent: 100,
    employedPercent: null,
  },
  rows: [
    {
      membershipId: "m1",
      studentId: "st1",
      fullName: "Jasur Toshmatov",
      groupName: "IELTS Evening",
      branchName: "Chilonzor",
      courseName: "IELTS",
      teacherName: "Aziz Rahimov",
      graduatedAt: `${THIS_MONTH}-03`,
      examResult: "42/50",
      result: { ieltsScore: 6.5, cefrLevel: "B2", university: true, employed: null, note: null },
      certificate: { id: "c1", number: "K-0012", code: "abc", revokedAt: null },
    },
    {
      membershipId: "m2",
      studentId: "st2",
      fullName: "Malika Yusupova",
      groupName: "IELTS Evening",
      branchName: "Chilonzor",
      courseName: "IELTS",
      teacherName: "Aziz Rahimov",
      graduatedAt: `${THIS_MONTH}-02`,
      examResult: null,
      result: null,
      certificate: null,
    },
  ],
  options: {
    groups: [{ id: "g1", name: "IELTS Evening" }],
    teachers: [{ id: "t1", fullName: "Aziz Rahimov" }],
    courses: [{ id: "c1", name: "IELTS" }],
  },
};

describe("the graduates report", () => {
  it("shows the month's figures and each graduate with what came of the studies", async () => {
    serve({ "GET /reports/graduates": GRADUATES });
    await show(<GraduatesReportScreen />);
    expect(await screen.findByTestId("kpi-count")).toHaveTextContent(/Graduates\s*2/);
    expect(screen.getByTestId("kpi-bestTeacher")).toHaveTextContent(/Aziz Rahimov.*2 graduates/);
    expect(screen.getByTestId("kpi-avgIelts")).toHaveTextContent(/6\.5/);
    expect(screen.getByTestId("kpi-commonCefr")).toHaveTextContent(/B2/);
    expect(screen.getByTestId("kpi-university")).toHaveTextContent(/100%/);
    expect(screen.getByTestId("kpi-employed")).toHaveTextContent(/—/);

    const first = screen.getByTestId("graduate-m1");
    expect(first).toHaveTextContent(/Jasur Toshmatov/);
    expect(first).toHaveTextContent(/IELTS Evening, Chilonzor, Aziz Rahimov/);
    expect(screen.getByTestId("graduate-m1-results")).toHaveTextContent(
      /Exam: 42\/50.*IELTS 6\.5.*B2.*Went to university/,
    );
    expect(screen.getByTestId("graduate-m1-paper")).toHaveTextContent("Certificate K-0012");
    expect(screen.getByTestId("graduate-m2-results")).toHaveTextContent("No result");
    expect(screen.queryByTestId("graduate-m2-paper")).toBeNull();

    expect(asked("GET", "/reports/graduates").get("year")).toBe(String(YEAR));
    expect(asked("GET", "/reports/graduates").get("month")).toBe(String(MONTH));
    expect(asked("GET", "/reports/graduates").has("result")).toBe(false);
  });

  it("asks again for every filter, and fetches the same list as an Excel file", async () => {
    serve({ "GET /reports/graduates": GRADUATES });
    await show(<GraduatesReportScreen />);
    await fireEvent.press(await screen.findByTestId("graduates-group"));
    await fireEvent.press(await screen.findByTestId("graduates-group-option-g1"));
    await fireEvent.press(screen.getByTestId("graduates-teacher"));
    await fireEvent.press(await screen.findByTestId("graduates-teacher-option-t1"));
    await fireEvent.press(screen.getByTestId("graduates-course"));
    await fireEvent.press(await screen.findByTestId("graduates-course-option-c1"));
    await fireEvent.press(screen.getByTestId("graduates-result"));
    await fireEvent.press(await screen.findByTestId("graduates-result-option-no"));
    await waitFor(() => expect(asked("GET", "/reports/graduates").get("result")).toBe("no"));
    const query = asked("GET", "/reports/graduates");
    expect(query.get("groupId")).toBe("g1");
    expect(query.get("teacherId")).toBe("t1");
    expect(query.get("courseId")).toBe("c1");

    await fireEvent.press(screen.getByTestId("report-excel"));
    const path = mockSaveFile.mock.calls.at(-1)![0];
    expect(path.startsWith("/reports/graduates/export.xlsx?")).toBe(true);
    expect(path).toContain("groupId=g1");
    expect(path).toContain("result=no");
    expect(path.endsWith("&locale=en")).toBe(true);
  });

  it("records what came of a graduate's studies", async () => {
    serve({
      "GET /reports/graduates": GRADUATES,
      "PUT /memberships/m2/graduate": {
        ieltsScore: 7,
        cefrLevel: "C1",
        university: false,
        employed: true,
        note: "Works at a bank",
      },
    });
    await show(<GraduatesReportScreen />);
    await fireEvent.press(await screen.findByTestId("graduate-m2"));
    await fireEvent.press(await screen.findByTestId("graduate-do-result"));

    // A band the test does not have is not sent.
    await fireEvent.changeText(await screen.findByTestId("graduate-result-ielts"), "9.7");
    await fireEvent.press(screen.getByTestId("graduate-result-save"));
    expect(
      await screen.findByText("Enter a band from 0 to 9 in halves, such as 6.5."),
    ).toBeTruthy();
    expect(calls("PUT", "/memberships/m2/graduate")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("graduate-result-ielts"), "7,0");
    await fireEvent.press(screen.getByTestId("graduate-result-cefr"));
    await fireEvent.press(await screen.findByTestId("graduate-result-cefr-option-C1"));
    await fireEvent.press(screen.getByTestId("graduate-result-employed"));
    await fireEvent.changeText(screen.getByTestId("graduate-result-note"), " Works at a bank ");
    const asks = calls("GET", "/reports/graduates").length;
    await fireEvent.press(screen.getByTestId("graduate-result-save"));
    await waitFor(() => expect(calls("PUT", "/memberships/m2/graduate")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/memberships/m2/graduate")[0]![1])).toEqual({
      ieltsScore: 7,
      cefrLevel: "C1",
      university: false,
      employed: true,
      note: "Works at a bank",
    });
    // The list and its figures are read again.
    await waitFor(() => expect(calls("GET", "/reports/graduates").length).toBeGreaterThan(asks));
  });

  it("starts the result from what was recorded before", async () => {
    serve({ "GET /reports/graduates": GRADUATES, "PUT /memberships/m1/graduate": {} });
    await show(<GraduatesReportScreen />);
    await fireEvent.press(await screen.findByTestId("graduate-m1"));
    await fireEvent.press(await screen.findByTestId("graduate-do-result"));
    expect((await screen.findByTestId("graduate-result-ielts")).props.value).toBe("6.5");
    await fireEvent.press(screen.getByTestId("graduate-result-save"));
    await waitFor(() => expect(calls("PUT", "/memberships/m1/graduate")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/memberships/m1/graduate")[0]![1])).toEqual({
      ieltsScore: 6.5,
      cefrLevel: "B2",
      university: true,
      employed: false,
      note: null,
    });
  });

  it("issues a certificate with the course as its title", async () => {
    serve({
      "GET /reports/graduates": GRADUATES,
      "POST /memberships/m2/certificate": { id: "c2" },
    });
    await show(<GraduatesReportScreen />);
    await fireEvent.press(await screen.findByTestId("graduate-m2"));
    // No certificate yet: it can be issued, not revoked or opened.
    expect(screen.queryByTestId("graduate-do-revoke")).toBeNull();
    expect(screen.queryByTestId("graduate-do-open-certificate")).toBeNull();
    await fireEvent.press(await screen.findByTestId("graduate-do-certificate"));
    expect((await screen.findByTestId("graduate-certificate-title")).props.value).toBe("IELTS");

    // A certificate needs a title.
    await fireEvent.changeText(screen.getByTestId("graduate-certificate-title"), "  ");
    await fireEvent.press(screen.getByTestId("graduate-certificate-save"));
    expect(calls("POST", "/memberships/m2/certificate")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("graduate-certificate-title"), "IELTS course");
    await fireEvent.changeText(screen.getByTestId("graduate-certificate-level"), "B2");
    await fireEvent.press(screen.getByTestId("graduate-certificate-save"));
    await waitFor(() => expect(calls("POST", "/memberships/m2/certificate")).toHaveLength(1));
    expect(sentBody(calls("POST", "/memberships/m2/certificate")[0]![1])).toEqual({
      title: "IELTS course",
      level: "B2",
      issuedAt: TODAY,
    });
  });

  it("revokes a certificate after asking, and opens its page on the site", async () => {
    serve({
      "GET /reports/graduates": GRADUATES,
      "POST /certificates/c1/revoke": { id: "c1" },
    });
    await show(<GraduatesReportScreen />);
    await fireEvent.press(await screen.findByTestId("graduate-m1"));
    expect(screen.queryByTestId("graduate-do-certificate")).toBeNull();
    await fireEvent.press(await screen.findByTestId("graduate-do-open-certificate"));
    expect(mockOpenOnSite).toHaveBeenLastCalledWith("/en/certificates/c1");

    await fireEvent.press(screen.getByTestId("graduate-m1"));
    await fireEvent.press(await screen.findByTestId("graduate-do-revoke"));
    expect(calls("POST", "/certificates/c1/revoke")).toHaveLength(0);
    await fireEvent.press(await screen.findByTestId("graduate-revoke-confirm"));
    await waitFor(() => expect(calls("POST", "/certificates/c1/revoke")).toHaveLength(1));
  });

  it("says why a certificate was not revoked", async () => {
    serve({
      "GET /reports/graduates": GRADUATES,
      "POST /certificates/c1/revoke": answer(409, {
        error: { code: "CONFLICT", message: "errors.conflict" },
      }),
    });
    await show(<GraduatesReportScreen />);
    await fireEvent.press(await screen.findByTestId("graduate-m1"));
    await fireEvent.press(await screen.findByTestId("graduate-do-revoke"));
    await fireEvent.press(await screen.findByTestId("graduate-revoke-confirm"));
    await waitFor(() => expect(calls("POST", "/certificates/c1/revoke")).toHaveLength(1));
    await settled();
    // Still open, with the refusal in it.
    expect(screen.getByTestId("graduate-revoke-confirm")).toBeTruthy();
  });

  it("only opens the student's page for someone who may not change students", async () => {
    mockPermissions = ["reports.view", "students.view"];
    serve({ "GET /reports/graduates": GRADUATES });
    await show(<GraduatesReportScreen />);
    await fireEvent.press(await screen.findByTestId("graduate-m2"));
    expect(screen.queryByTestId("graduate-do-result")).toBeNull();
    expect(screen.queryByTestId("graduate-do-certificate")).toBeNull();
    await fireEvent.press(await screen.findByTestId("graduate-do-student"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "st2" },
    });
  });

  it("says so when nobody graduated in the month", async () => {
    serve({
      "GET /reports/graduates": {
        ...GRADUATES,
        rows: [],
        kpis: { ...GRADUATES.kpis, count: 0, bestTeacher: null },
      },
    });
    await show(<GraduatesReportScreen />);
    expect(await screen.findByText("No graduates in this month.")).toBeTruthy();
  });

  it("reads an IELTS band the way it is typed", () => {
    expect(typedBand("6.5")).toBe(6.5);
    expect(typedBand("6,5")).toBe(6.5);
    expect(typedBand(" 9 ")).toBe(9);
    expect(typedBand("0")).toBe(0);
    expect(typedBand("9.5")).toBeNull();
    expect(typedBand("6.3")).toBeNull();
    expect(typedBand("10")).toBeNull();
    expect(typedBand("")).toBeNull();
  });
});

/* ----- staff attendance ----- */

const week = (statuses: Array<[string, string | null]>) =>
  statuses.map(([status, checkIn], index) => ({
    date: `${THIS_MONTH}-${String(index + 1).padStart(2, "0")}`,
    status: status as "PRESENT",
    checkIn,
  }));

const ATTENDANCE: StaffAttendanceReport = {
  year: YEAR,
  month: MONTH,
  date: `${THIS_MONTH}-03`,
  branchId: null,
  kpis: { total: 2, cameToday: 1, lateToday: 1, absentToday: 1 },
  daily: [
    {
      userId: "u1",
      fullName: "Aziz Rahimov",
      branchName: "Chilonzor",
      expectedIn: "09:00",
      expectedOut: "18:00",
      checkIn: "09:25",
      checkOut: null,
      lateMinutes: 25,
      earlyLeaveMinutes: 0,
      workedMinutes: 485,
      status: "LATE",
      source: "MANUAL",
    },
    {
      userId: "u2",
      fullName: "Nodira Karimova",
      branchName: null,
      expectedIn: "09:00",
      expectedOut: "18:00",
      checkIn: null,
      checkOut: null,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
      status: "ABSENT",
      source: null,
    },
  ],
  weekly: {
    from: `${THIS_MONTH}-01`,
    to: `${THIS_MONTH}-07`,
    rows: [
      {
        userId: "u1",
        fullName: "Aziz Rahimov",
        days: week([
          ["PRESENT", "08:55"],
          ["PRESENT", "09:00"],
          ["LATE", "09:25"],
          ["ABSENT", null],
          ["PRESENT", "08:58"],
          ["NOT_WORKING_DAY", null],
          ["NOT_WORKING_DAY", null],
        ]),
      },
    ],
  },
  monthly: [
    {
      userId: "u1",
      fullName: "Aziz Rahimov",
      branchName: "Chilonzor",
      workingDays: 22,
      presentDays: 19,
      lateDays: 2,
      absentDays: 1,
      workedMinutes: 9125,
      lateMinutes: 40,
    },
  ],
  statistics: {
    punctualityRate: 86,
    attendanceRate: 95,
    avgWorkedMinutes: 480,
    byDay: [
      { date: `${THIS_MONTH}-01`, present: 2, late: 0, absent: 0 },
      { date: `${THIS_MONTH}-02`, present: 1, late: 1, absent: 0 },
      { date: `${THIS_MONTH}-03`, present: 0, late: 1, absent: 1 },
      { date: `${THIS_MONTH}-04`, present: 0, late: 0, absent: 0 },
    ],
  },
  schedules: [
    {
      userId: "u1",
      fullName: "Aziz Rahimov",
      days: [
        null,
        { weekday: 1, start: "09:00", end: "18:00" },
        { weekday: 2, start: "09:00", end: "18:00" },
        null,
        null,
        null,
        null,
      ],
    },
  ],
  lateAfterMinutes: 10,
};

describe("the staff attendance report", () => {
  it("shows the day's figures and each person's day", async () => {
    serve({ "GET /reports/staff-attendance": ATTENDANCE });
    await show(<StaffAttendanceReportScreen />);
    expect(await screen.findByTestId("kpi-total")).toHaveTextContent(/Total staff\s*2/);
    expect(screen.getByTestId("kpi-cameToday")).toHaveTextContent(/1/);
    expect(screen.getByTestId("kpi-lateToday")).toHaveTextContent(/1/);
    expect(screen.getByTestId("kpi-absentToday")).toHaveTextContent(/1/);

    const first = screen.getByTestId("attendance-day-u1");
    expect(first).toHaveTextContent(/Aziz Rahimov.*Chilonzor/);
    expect(first).toHaveTextContent(/Expected in\s*09:00.*Check-in\s*09:25.*Late\s*25m/);
    expect(first).toHaveTextContent(/Check-out\s*—.*Worked\s*8:05/);
    expect(screen.getByTestId("attendance-day-u1-status")).toHaveTextContent("Late");
    expect(screen.getByTestId("attendance-day-u2-status")).toHaveTextContent("Absent");

    // The month is asked for; the day is left to the server until one is typed.
    const query = asked("GET", "/reports/staff-attendance");
    expect(query.get("year")).toBe(String(YEAR));
    expect(query.get("month")).toBe(String(MONTH));
    expect(query.has("date")).toBe(false);
    expect(screen.getByTestId("attendance-date").props.value).toBe(
      `03.${String(MONTH).padStart(2, "0")}.${YEAR}`,
    );
  });

  it("asks for a typed day, and lets the server pick again in another month", async () => {
    serve({ "GET /reports/staff-attendance": ATTENDANCE });
    await show(<StaffAttendanceReportScreen />);
    const typed = `15${String(MONTH).padStart(2, "0")}${YEAR}`;
    await fireEvent.changeText(await screen.findByTestId("attendance-date"), typed);
    await waitFor(() =>
      expect(asked("GET", "/reports/staff-attendance").get("date")).toBe(`${THIS_MONTH}-15`),
    );

    const other = MONTH === 1 ? 2 : 1;
    await fireEvent.press(screen.getByTestId("report-month"));
    await fireEvent.press(await screen.findByTestId(`report-month-option-${other}`));
    await waitFor(() =>
      expect(asked("GET", "/reports/staff-attendance").get("month")).toBe(String(other)),
    );
    expect(asked("GET", "/reports/staff-attendance").has("date")).toBe(false);
  });

  it("corrects a check-in and check-out", async () => {
    serve({
      "GET /reports/staff-attendance": ATTENDANCE,
      "PUT /staff-attendance/manual": undefined,
    });
    await show(<StaffAttendanceReportScreen />);
    await fireEvent.press(await screen.findByTestId("attendance-day-u1"));
    expect((await screen.findByTestId("manual-check-in")).props.value).toBe("09:25");
    expect(screen.getByTestId("manual-check-out").props.value).toBe("");

    // Half a time is not sent.
    await fireEvent.changeText(screen.getByTestId("manual-check-out"), "18");
    await fireEvent.press(screen.getByTestId("manual-check-save"));
    expect(calls("PUT", "/staff-attendance/manual")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("manual-check-in"), "0905");
    await fireEvent.changeText(screen.getByTestId("manual-check-out"), "1830");
    const asks = calls("GET", "/reports/staff-attendance").length;
    await fireEvent.press(screen.getByTestId("manual-check-save"));
    await waitFor(() => expect(calls("PUT", "/staff-attendance/manual")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/staff-attendance/manual")[0]![1])).toEqual({
      userId: "u1",
      date: `${THIS_MONTH}-03`,
      checkIn: "09:05",
      checkOut: "18:30",
    });
    await waitFor(() =>
      expect(calls("GET", "/reports/staff-attendance").length).toBeGreaterThan(asks),
    );
  });

  it("takes a time away when its field is emptied", async () => {
    serve({
      "GET /reports/staff-attendance": ATTENDANCE,
      "PUT /staff-attendance/manual": undefined,
    });
    await show(<StaffAttendanceReportScreen />);
    await fireEvent.press(await screen.findByTestId("attendance-day-u1"));
    await fireEvent.changeText(await screen.findByTestId("manual-check-in"), "");
    await fireEvent.press(screen.getByTestId("manual-check-save"));
    await waitFor(() => expect(calls("PUT", "/staff-attendance/manual")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/staff-attendance/manual")[0]![1])).toEqual({
      userId: "u1",
      date: `${THIS_MONTH}-03`,
      checkIn: null,
      checkOut: null,
    });
  });

  it("shows the week, the month and the statistics", async () => {
    serve({ "GET /reports/staff-attendance": ATTENDANCE });
    await show(<StaffAttendanceReportScreen />);
    await fireEvent.press(await screen.findByTestId("attendance-tab-weekly"));
    const third = screen.getByTestId(`attendance-week-u1-${THIS_MONTH}-03`);
    expect(third).toHaveTextContent(/3.*09:25/);
    expect(third.props.accessibilityLabel).toMatch(/Late, 09:25$/);
    expect(
      screen.getByTestId(`attendance-week-u1-${THIS_MONTH}-04`).props.accessibilityLabel,
    ).toMatch(/Absent$/);

    await fireEvent.press(screen.getByTestId("attendance-tab-monthly"));
    // The day field belongs to the day and the week.
    expect(screen.queryByTestId("attendance-date")).toBeNull();
    expect(screen.getByTestId("attendance-month-u1")).toHaveTextContent(
      /Working days\s*22.*Present\s*19.*Late\s*2.*Absent\s*1.*Worked\s*152:05.*Late\s*40m/,
    );

    await fireEvent.press(screen.getByTestId("attendance-tab-statistics"));
    expect(screen.getByTestId("attendance-statistics")).toHaveTextContent(
      /Attendance\s*95%.*On time\s*86%.*Average worked per day\s*8:00/,
    );
    // The last day with anyone counted is written out; pressing another day writes that one.
    expect(screen.getByTestId("attendance-by-day-picked")).toHaveTextContent(
      /Present\s*0.*Late\s*1.*Absent\s*1/,
    );
    await fireEvent.press(screen.getByTestId("attendance-by-day-0"));
    expect(screen.getByTestId("attendance-by-day-picked")).toHaveTextContent(
      /Present\s*2.*Late\s*0.*Absent\s*0/,
    );
    expect(screen.getByTestId("attendance-by-day-1").props.accessibilityLabel).toMatch(
      /Present: 1\. Late: 1\. Absent: 0$/,
    );
  });

  it("sets a person's working week", async () => {
    serve({
      "GET /reports/staff-attendance": ATTENDANCE,
      "PUT /work-schedules": undefined,
    });
    await show(<StaffAttendanceReportScreen />);
    await fireEvent.press(await screen.findByTestId("attendance-tab-schedules"));
    const card = screen.getByTestId("attendance-schedule-u1");
    expect(card).toHaveTextContent(/Mon\s*09:00–18:00.*Tue\s*09:00–18:00.*Wed\s*—.*Sun\s*—/);
    await fireEvent.press(card);

    // Tuesday off, Saturday on with hours that end before they start.
    await fireEvent.press(await screen.findByTestId("schedule-day-2"));
    await fireEvent.press(screen.getByTestId("schedule-day-6"));
    await fireEvent.changeText(screen.getByTestId("schedule-start-6"), "1000");
    await fireEvent.changeText(screen.getByTestId("schedule-end-6"), "0900");
    await fireEvent.press(screen.getByTestId("schedule-save"));
    expect(await screen.findByText("The end of the day must be after its start.")).toBeTruthy();
    expect(calls("PUT", "/work-schedules")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("schedule-end-6"), "1400");
    await fireEvent.press(screen.getByTestId("schedule-save"));
    await waitFor(() => expect(calls("PUT", "/work-schedules")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/work-schedules")[0]![1])).toEqual({
      userId: "u1",
      days: [
        { weekday: 1, start: "09:00", end: "18:00" },
        { weekday: 6, start: "10:00", end: "14:00" },
      ],
    });
  });

  it("says why a working week was not saved", async () => {
    serve({
      "GET /reports/staff-attendance": ATTENDANCE,
      "PUT /work-schedules": answer(403, {
        error: { code: "FORBIDDEN", message: "errors.branchForbidden" },
      }),
    });
    await show(<StaffAttendanceReportScreen />);
    await fireEvent.press(await screen.findByTestId("attendance-tab-schedules"));
    await fireEvent.press(screen.getByTestId("attendance-schedule-u1"));
    await fireEvent.press(await screen.findByTestId("schedule-save"));
    expect(await screen.findByTestId("schedule-problem")).toBeTruthy();
  });

  it("changes nothing for someone who may not change staff", async () => {
    mockPermissions = ["reports.view"];
    serve({ "GET /reports/staff-attendance": ATTENDANCE });
    await show(<StaffAttendanceReportScreen />);
    await fireEvent.press(await screen.findByTestId("attendance-day-u1"));
    expect(screen.queryByTestId("manual-check-in")).toBeNull();
    await fireEvent.press(screen.getByTestId("attendance-tab-schedules"));
    await fireEvent.press(screen.getByTestId("attendance-schedule-u1"));
    expect(screen.queryByTestId("schedule-save")).toBeNull();
  });

  it("says so when the branch has no staff", async () => {
    serve({
      "GET /reports/staff-attendance": { ...ATTENDANCE, daily: [], monthly: [], schedules: [] },
    });
    await show(<StaffAttendanceReportScreen />);
    expect(await screen.findByText("No staff in this branch.")).toBeTruthy();
  });

  it("writes a length of time the way the site does", () => {
    expect(minutesText(0)).toBe("—");
    expect(minutesText(25)).toBe("25m");
    expect(minutesText(60)).toBe("1:00");
    expect(minutesText(485)).toBe("8:05");
  });
});

/* ----- coins ----- */

const COINS: CoinsReport = {
  kpis: { totalGiven: 340, totalSpent: 120, purchases: 3, activeStudents: 2 },
  rating: [
    {
      rank: 1,
      studentId: "st1",
      fullName: "Jasur Toshmatov",
      branchName: "Chilonzor",
      balance: 180,
      earned: 240,
      spent: 60,
      lastActivity: `${THIS_MONTH}-02T08:00:00.000Z`,
    },
    {
      rank: 2,
      studentId: "st2",
      fullName: "Malika Yusupova",
      branchName: "Yunusobod",
      balance: 40,
      earned: 100,
      spent: 60,
      lastActivity: null,
    },
  ],
};
const COIN_OPTIONS: CoinReportOptions = {
  branches: [
    { id: "b1", name: "Chilonzor" },
    { id: "b2", name: "Yunusobod" },
  ],
  courses: [
    { id: "c1", name: "IELTS", branchId: "b1" },
    { id: "c2", name: "SAT", branchId: "b2" },
  ],
  groups: [
    { id: "g1", name: "IELTS Evening", branchId: "b1", courseId: "c1" },
    { id: "g2", name: "SAT Morning", branchId: "b2", courseId: "c2" },
  ],
};
const CATEGORIES: ProductCategory[] = [
  { id: "k1", name: "Stationery", productCount: 1 },
  { id: "k2", name: "Sweets", productCount: 0 },
];
const PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Notebook",
    categoryId: "k1",
    categoryName: "Stationery",
    imageUrl: "/api/v1/files/photos/a.jpg",
    priceCoins: 50,
    stock: 4,
    isActive: true,
    purchasedCount: 3,
  },
  {
    id: "p2",
    name: "Backpack",
    categoryId: "k1",
    categoryName: "Stationery",
    imageUrl: null,
    priceCoins: 500,
    stock: 0,
    isActive: false,
    purchasedCount: 0,
  },
];
const REQUESTS: PurchaseRequest[] = [
  {
    id: "r1",
    studentId: "st1",
    studentName: "Jasur Toshmatov",
    productId: "p1",
    productName: "Notebook",
    coins: 50,
    status: "PENDING",
    createdAt: `${THIS_MONTH}-03T08:00:00.000Z`,
    decidedAt: null,
    decidedByName: null,
  },
  {
    id: "r2",
    studentId: "st2",
    studentName: "Malika Yusupova",
    productId: "p1",
    productName: "Notebook",
    coins: 50,
    status: "APPROVED",
    createdAt: `${THIS_MONTH}-01T08:00:00.000Z`,
    decidedAt: `${THIS_MONTH}-01T09:00:00.000Z`,
    decidedByName: "Dilnoza Karimova",
  },
];

const coinRoutes = (): Routes => ({
  "GET /coins/report": COINS,
  "GET /coins/options": COIN_OPTIONS,
  "GET /marketplace/categories": CATEGORIES,
  "GET /marketplace/products": PRODUCTS,
  "GET /marketplace/purchase-requests": REQUESTS,
});

describe("the coins report", () => {
  it("shows the figures and the rating, narrowed by its filters", async () => {
    serve(coinRoutes());
    await show(<CoinsReportScreen />);
    expect(await screen.findByTestId("kpi-totalGiven")).toHaveTextContent(/Coins given\s*340/);
    expect(screen.getByTestId("kpi-totalSpent")).toHaveTextContent(/120/);
    expect(screen.getByTestId("kpi-purchases")).toHaveTextContent(/3/);
    expect(screen.getByTestId("kpi-activeStudents")).toHaveTextContent(/2/);
    expect(screen.getByTestId("coins-student-st1")).toHaveTextContent(
      /#1.*Jasur Toshmatov.*Chilonzor.*Current coins\s*180.*Earned\s*240.*Spent\s*60/,
    );
    // All time is not sent: it is what the server gives by itself.
    expect(asked("GET", "/coins/report").has("period")).toBe(false);

    await fireEvent.press(screen.getByTestId("coins-period-WEEK"));
    await waitFor(() => expect(asked("GET", "/coins/report").get("period")).toBe("WEEK"));

    // A branch narrows the courses and groups on offer, and takes the group back.
    await fireEvent.press(await screen.findByTestId("coins-group"));
    await fireEvent.press(await screen.findByTestId("coins-group-option-g2"));
    await waitFor(() => expect(asked("GET", "/coins/report").get("groupId")).toBe("g2"));
    await fireEvent.press(screen.getByTestId("coins-branch"));
    await fireEvent.press(await screen.findByTestId("coins-branch-option-b1"));
    await waitFor(() => expect(asked("GET", "/coins/report").get("branchId")).toBe("b1"));
    expect(asked("GET", "/coins/report").has("groupId")).toBe(false);
    await fireEvent.press(screen.getByTestId("coins-course"));
    expect(await screen.findByTestId("coins-course-option-c1")).toBeTruthy();
    expect(screen.queryByTestId("coins-course-option-c2")).toBeNull();
    await fireEvent.press(await screen.findByTestId("coins-course-option-c1"));
    await waitFor(() => expect(asked("GET", "/coins/report").get("courseId")).toBe("c1"));

    await fireEvent.changeText(screen.getByTestId("coins-search"), " jasur ");
    await waitFor(() => expect(asked("GET", "/coins/report").get("q")).toBe("jasur"));
  });

  it("opens a student's coins: the balance and every time coins came or went", async () => {
    serve({
      ...coinRoutes(),
      "GET /students/st1/coins": {
        balance: 180,
        items: [
          {
            id: "x1",
            studentId: "st1",
            groupName: "IELTS Evening",
            kind: "PURCHASE",
            amount: -60,
            reasonName: null,
            event: null,
            comment: "Notebook",
            givenByName: "Dilnoza Karimova",
            createdAt: `${THIS_MONTH}-02T08:00:00.000Z`,
          },
          {
            id: "x2",
            studentId: "st1",
            groupName: null,
            kind: "AUTO",
            amount: 5,
            reasonName: null,
            event: "HOMEWORK",
            comment: null,
            givenByName: null,
            createdAt: `${THIS_MONTH}-01T08:00:00.000Z`,
          },
        ],
      },
    });
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-student-st1"));
    expect(await screen.findByTestId("coin-history-balance")).toHaveTextContent(
      "Balance: 180 coins",
    );
    expect(screen.getByTestId("coin-history-x1")).toHaveTextContent(
      /Notebook, IELTS Evening.*Dilnoza Karimova.*-60/,
    );
    expect(screen.getByTestId("coin-history-x2")).toHaveTextContent(/Homework.*\+5/);
  });

  it("lists the products, and adds one with its picture", async () => {
    mockChoosePhoto.mockResolvedValue({
      kind: "file",
      file: { uri: "file:///p.jpg", name: "p.jpg", type: "image/jpeg", size: 1000 },
    });
    serve({
      ...coinRoutes(),
      "POST /uploads": { key: "photos/new.jpg", url: "/api/v1/files/photos/new.jpg", size: 1000 },
      "POST /marketplace/products": { ...PRODUCTS[0], id: "p3" },
    });
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-tab-marketplace"));
    expect(await screen.findByTestId("coins-product-p1")).toHaveTextContent(
      /Notebook.*Stationery.*Active.*Price \(coins\)\s*50.*Purchased\s*3.*Stock\s*4/,
    );
    expect(screen.getByTestId("coins-product-p2")).toHaveTextContent(/Backpack.*Inactive/);

    await fireEvent.press(screen.getByTestId("coins-add-product"));
    // Nothing typed yet: the name is asked for and nothing is sent.
    await fireEvent.press(await screen.findByTestId("product-save"));
    expect(calls("POST", "/marketplace/products")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("product-picture-choose"));
    await waitFor(() => expect(calls("POST", "/uploads")).toHaveLength(1));
    // A small square picture is asked of the phone: the server takes up to 2 MB.
    expect(mockChoosePhoto).toHaveBeenCalledWith({ smallSquare: true });
    await fireEvent.changeText(screen.getByTestId("product-name"), " Pen ");
    await fireEvent.changeText(screen.getByTestId("product-price"), "15");
    await fireEvent.changeText(screen.getByTestId("product-stock"), "20");
    await waitFor(() => expect(screen.getByTestId("product-picture-remove")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("product-save"));
    await waitFor(() => expect(calls("POST", "/marketplace/products")).toHaveLength(1));
    expect(sentBody(calls("POST", "/marketplace/products")[0]![1])).toEqual({
      name: "Pen",
      // The first category is chosen at first, as on the site.
      categoryId: "k1",
      imageUrl: "/api/v1/files/photos/new.jpg",
      priceCoins: 15,
      stock: 20,
      isActive: true,
    });
  });

  it("says why a picture was not taken", async () => {
    mockChoosePhoto.mockResolvedValue({
      kind: "file",
      file: { uri: "file:///p.jpg", name: "p.jpg", type: "image/jpeg", size: 5_000_000 },
    });
    serve({
      ...coinRoutes(),
      "POST /uploads": answer(400, {
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { file: ["validation.fileSize"] },
        },
      }),
    });
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-tab-marketplace"));
    await fireEvent.press(await screen.findByTestId("coins-add-product"));
    await fireEvent.press(await screen.findByTestId("product-picture-choose"));
    expect(await screen.findByTestId("product-picture-problem")).toHaveTextContent(
      "The image must be 2 MB or smaller.",
    );
  });

  it("changes a product and removes one after asking", async () => {
    serve({
      ...coinRoutes(),
      "PATCH /marketplace/products/p2": PRODUCTS[1],
      "DELETE /marketplace/products/p2": undefined,
    });
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-tab-marketplace"));
    await fireEvent.press(await screen.findByTestId("coins-product-p2"));
    await fireEvent.press(await screen.findByTestId("product-do-edit"));
    expect((await screen.findByTestId("product-name")).props.value).toBe("Backpack");
    await fireEvent.changeText(screen.getByTestId("product-stock"), "3");
    await fireEvent.press(screen.getByTestId("product-active"));
    await fireEvent.press(screen.getByTestId("product-save"));
    await waitFor(() => expect(calls("PATCH", "/marketplace/products/p2")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/marketplace/products/p2")[0]![1])).toEqual({
      name: "Backpack",
      categoryId: "k1",
      imageUrl: null,
      priceCoins: 500,
      stock: 3,
      isActive: true,
    });

    await settled();
    await fireEvent.press(screen.getByTestId("coins-product-p2"));
    await fireEvent.press(await screen.findByTestId("product-do-delete"));
    expect(calls("DELETE", "/marketplace/products/p2")).toHaveLength(0);
    await fireEvent.press(await screen.findByTestId("product-delete-confirm"));
    await waitFor(() => expect(calls("DELETE", "/marketplace/products/p2")).toHaveLength(1));
  });

  it("adds a category and removes only one without products", async () => {
    serve({
      ...coinRoutes(),
      "POST /marketplace/categories": { id: "k3", name: "Toys", productCount: 0 },
      "DELETE /marketplace/categories/k2": undefined,
    });
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-tab-marketplace"));
    await fireEvent.press(await screen.findByTestId("coins-categories"));
    expect(await screen.findByTestId("category-k1")).toHaveTextContent(/Stationery\s*1/);
    // A category with products cannot go.
    expect(screen.getByTestId("category-k1-remove").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByTestId("category-k1-remove"));
    await fireEvent.press(screen.getByTestId("category-k2-remove"));
    await waitFor(() => expect(calls("DELETE", "/marketplace/categories/k2")).toHaveLength(1));
    expect(calls("DELETE", "/marketplace/categories/k1")).toHaveLength(0);

    await settled();
    await fireEvent.changeText(screen.getByTestId("categories-name"), " Toys ");
    await fireEvent.press(screen.getByTestId("categories-add"));
    await waitFor(() => expect(calls("POST", "/marketplace/categories")).toHaveLength(1));
    expect(sentBody(calls("POST", "/marketplace/categories")[0]![1])).toEqual({ name: "Toys" });
    await waitFor(() => expect(screen.getByTestId("categories-name").props.value).toBe(""));
  });

  it("approves and rejects purchase requests, and narrows them by status", async () => {
    serve({
      ...coinRoutes(),
      "PATCH /marketplace/purchase-requests/r1": { ...REQUESTS[0], status: "APPROVED" },
    });
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-tab-requests"));
    expect(await screen.findByTestId("coins-request-r1")).toHaveTextContent(
      /Jasur Toshmatov.*Notebook.*Pending.*Coins: 50/,
    );
    expect(screen.getByTestId("coins-request-r2")).toHaveTextContent(/Approved.*Dilnoza Karimova/);
    // Only a request that waits can be decided.
    expect(screen.queryByTestId("coins-request-r2-approve")).toBeNull();

    const asks = calls("GET", "/coins/report").length;
    await fireEvent.press(screen.getByTestId("coins-request-r1-approve"));
    await waitFor(() =>
      expect(calls("PATCH", "/marketplace/purchase-requests/r1")).toHaveLength(1),
    );
    expect(sentBody(calls("PATCH", "/marketplace/purchase-requests/r1")[0]![1])).toEqual({
      status: "APPROVED",
    });
    // Approving spends coins: the figures on top are read again.
    await waitFor(() => expect(calls("GET", "/coins/report").length).toBeGreaterThan(asks));

    await settled();
    await fireEvent.press(screen.getByTestId("coins-request-r1-reject"));
    await waitFor(() =>
      expect(calls("PATCH", "/marketplace/purchase-requests/r1")).toHaveLength(2),
    );
    expect(sentBody(calls("PATCH", "/marketplace/purchase-requests/r1")[1]![1])).toEqual({
      status: "REJECTED",
    });

    await settled();
    await fireEvent.press(screen.getByTestId("coins-request-status"));
    await fireEvent.press(await screen.findByTestId("coins-request-status-option-PENDING"));
    await waitFor(() =>
      expect(asked("GET", "/marketplace/purchase-requests").get("status")).toBe("PENDING"),
    );
  });

  it("says why a request could not be approved", async () => {
    serve({
      ...coinRoutes(),
      "PATCH /marketplace/purchase-requests/r1": answer(400, {
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { studentId: ["validation.notEnoughCoins"] },
        },
      }),
    });
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-tab-requests"));
    await fireEvent.press(await screen.findByTestId("coins-request-r1-approve"));
    expect(await screen.findByTestId("coins-request-problem")).toHaveTextContent(
      "The student does not have enough coins.",
    );
  });

  it("files a request for a student, and not one the student cannot afford", async () => {
    serve({
      ...coinRoutes(),
      "GET /marketplace/products": [
        ...PRODUCTS,
        { ...PRODUCTS[0], id: "p4", name: "Headphones", priceCoins: 300 },
      ],
      "GET /coins/students": [
        { id: "st1", fullName: "Jasur Toshmatov", phone: "+998901112233", balance: 180 },
      ],
      "POST /marketplace/purchase-requests": REQUESTS[0],
    });
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-tab-requests"));
    await waitFor(() =>
      expect(screen.getByTestId("coins-add-request").props.accessibilityState).not.toMatchObject({
        disabled: true,
      }),
    );
    await fireEvent.press(screen.getByTestId("coins-add-request"));
    await fireEvent.changeText(await screen.findByTestId("request-student-search"), "jas");
    await fireEvent.press(await screen.findByTestId("request-student-st1"));
    expect(screen.getByTestId("request-balance")).toHaveTextContent("Balance: 180 coins");
    expect(asked("GET", "/coins/students").get("q")).toBe("jas");

    await fireEvent.press(screen.getByTestId("request-product"));
    // What cannot be bought is not offered: switched off, or none left.
    expect(screen.queryByTestId("request-product-option-p2")).toBeNull();
    await fireEvent.press(await screen.findByTestId("request-product-option-p4"));
    expect(await screen.findByText("The student does not have enough coins.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("request-save"));
    expect(calls("POST", "/marketplace/purchase-requests")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("request-product"));
    await fireEvent.press(await screen.findByTestId("request-product-option-p1"));
    await fireEvent.press(screen.getByTestId("request-save"));
    await waitFor(() => expect(calls("POST", "/marketplace/purchase-requests")).toHaveLength(1));
    expect(sentBody(calls("POST", "/marketplace/purchase-requests")[0]![1])).toEqual({
      studentId: "st1",
      productId: "p1",
    });
  });

  it("only shows the lists to someone who does not manage coins", async () => {
    mockPermissions = ["reports.view"];
    serve(coinRoutes());
    await show(<CoinsReportScreen />);
    await fireEvent.press(await screen.findByTestId("coins-tab-marketplace"));
    await fireEvent.press(await screen.findByTestId("coins-product-p1"));
    expect(screen.queryByTestId("coins-add-product")).toBeNull();
    expect(screen.queryByTestId("coins-categories")).toBeNull();
    expect(screen.queryByTestId("product-do-edit")).toBeNull();

    await fireEvent.press(screen.getByTestId("coins-tab-requests"));
    expect(await screen.findByTestId("coins-request-r1")).toBeTruthy();
    expect(screen.queryByTestId("coins-request-r1-approve")).toBeNull();
    expect(screen.queryByTestId("coins-add-request")).toBeNull();
  });

  it("reads a whole number the way it is typed", () => {
    expect(typedCount("15", 1, 100)).toBe(15);
    expect(typedCount("1 000", 0, 1_000_000)).toBe(1000);
    expect(typedCount("0", 1, 100)).toBeNull();
    expect(typedCount("0", 0, 100)).toBe(0);
    expect(typedCount("1.5", 0, 100)).toBeNull();
    expect(typedCount("", 0, 100)).toBeNull();
    expect(typedCount("101", 0, 100)).toBeNull();
  });
});
