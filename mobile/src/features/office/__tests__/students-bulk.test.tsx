import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { StudentOptions } from "@/api/office-students";
import type { Page, StudentDetail, StudentGroupCard, StudentRow } from "@/api/types";
import { StudentsScreen } from "@/features/staff/students-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

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
}));
let mockPermissions: string[] = [];
let mockView = "FULL";
const mockSaveFile = jest.fn<Promise<string>, [string, string]>(async () => "opened");
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    permissions: mockPermissions,
    view: { current: mockView, canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * Several students ticked on the Students list and one thing done to all of
 * them, an SMS to everyone the list shows, and Activate (A-260), as the
 * site's Students page has them. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockParams = {};
  mockView = "FULL";
  mockSaveFile.mockClear();
  mockPermissions = [
    "students.view",
    "students.update",
    "students.delete",
    "discounts.give",
    "sms.send",
    "groups.update",
  ];
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

function group(change: Partial<StudentGroupCard> = {}): StudentGroupCard {
  return {
    membershipId: "m1",
    groupId: "g1",
    groupName: "GE-Morning A1",
    courseName: "General English",
    status: "ACTIVE",
    groupStatus: "ACTIVE",
    teacherName: "Jasur Aliyev",
    time: "09:00–10:30",
    weekdays: [1, 3, 5],
    balance: -400000,
    joinedAt: "2026-09-01",
    billingFrom: null,
    leftAt: null,
    groupStartDate: "2026-09-01",
    groupEndDate: "2027-02-28",
    customPrice: null,
    note: null,
    nextPaymentDate: null,
    monthlyPrice: 400000,
    discount: null,
    instalments: [],
    lessonsLeft: null,
    gradeAverage: null,
    ...change,
  };
}

function student(change: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: "s1",
    fullName: "Ali Valiyev",
    phone: "+998901112233",
    note: null,
    isArchived: false,
    isBlacklisted: false,
    gradeAverage: null,
    balance: -400000,
    groups: [group()],
    birthDate: null,
    schoolName: null,
    parents: [],
    customFields: [],
    ...change,
  };
}

function page(items: StudentRow[]): Page<StudentRow> {
  return { items, total: items.length, page: 1, pageSize: 30 };
}

const OPTIONS: StudentOptions = {
  schools: [],
  sources: [],
  courses: [{ id: "c1", name: "General English", branchId: "b1" }],
  groups: [
    {
      id: "g1",
      name: "GE-Morning A1",
      branchId: "b1",
      courseId: "c1",
      teacherId: "t1",
      teacherName: "Jasur Aliyev",
      time: "09:00–10:30",
      status: "ACTIVE",
    },
  ],
  teachers: [{ id: "t1", fullName: "Jasur Aliyev" }],
  paymentMethods: [{ id: "pm1", name: "Cash" }],
};

const LIST = [
  student(),
  student({ id: "s2", fullName: "Bobur Rahimov" }),
  student({ id: "s3", fullName: "Zarina Aliyeva", groups: [group({ status: "TRIAL" })] }),
];

async function showList(more: Routes = {}, items: StudentRow[] = LIST) {
  serve({ "GET /students": page(items), "GET /students/options": OPTIONS, ...more });
  await renderScreen(<StudentsScreen />);
  await screen.findByTestId(`student-${items[0]!.id}`);
}

const tick = (id: string) => fireEvent.press(screen.getByTestId(`student-tick-${id}`));

describe("ticking students on the list", () => {
  it("shows the bar only once a student is ticked, and counts them", async () => {
    await showList();
    expect(screen.queryByTestId("students-bulk")).toBeNull();
    await tick("s1");
    expect(await screen.findByTestId("students-bulk-count")).toHaveTextContent("1 selected");
    await tick("s2");
    expect(screen.getByTestId("students-bulk-count")).toHaveTextContent("2 selected");
    await tick("s1");
    expect(screen.getByTestId("students-bulk-count")).toHaveTextContent("1 selected");
    await fireEvent.press(screen.getByTestId("bulk-clear"));
    expect(screen.queryByTestId("students-bulk")).toBeNull();
    // A tick is not a tap on the row.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("ticks everyone shown with one box, and unticks them", async () => {
    await showList();
    await fireEvent.press(screen.getByTestId("students-select-all"));
    expect(await screen.findByTestId("students-bulk-count")).toHaveTextContent("3 selected");
    await fireEvent.press(screen.getByTestId("students-select-all"));
    expect(screen.queryByTestId("students-bulk")).toBeNull();
  });

  it("has no tick boxes for someone who may do none of it", async () => {
    mockPermissions = ["students.view", "students.create"];
    await showList();
    expect(screen.queryByTestId("student-tick-s1")).toBeNull();
    expect(screen.queryByTestId("students-select-all")).toBeNull();
  });

  it("has no tick boxes in a teacher's view", async () => {
    mockView = "TEACHER";
    await showList();
    expect(screen.queryByTestId("student-tick-s1")).toBeNull();
    expect(screen.queryByTestId("students-sms")).toBeNull();
    expect(screen.queryByTestId("students-activate")).toBeNull();
  });

  it("offers each button to whoever may do what it does", async () => {
    mockPermissions = ["students.view", "sms.send"];
    await showList();
    await tick("s1");
    expect(screen.getByTestId("bulk-sms")).toBeOnTheScreen();
    expect(screen.getByTestId("bulk-excel")).toBeOnTheScreen();
    expect(screen.queryByTestId("bulk-add-to-group")).toBeNull();
    expect(screen.queryByTestId("bulk-discount")).toBeNull();
    expect(screen.queryByTestId("bulk-archive")).toBeNull();
  });

  it("puts the ticked students into a group, as active from a day", async () => {
    await showList({ "POST /students/bulk": { done: 1, skipped: 1 } });
    await tick("s1");
    await tick("s2");
    await fireEvent.press(screen.getByTestId("bulk-add-to-group"));
    expect(await screen.findByText("Add 2 students to a group")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("bulk-join-group"));
    const option = await screen.findByTestId("bulk-join-group-option-g1");
    expect(option).toHaveTextContent(/GE-Morning A1 \(Jasur Aliyev\) · 09:00–10:30/);
    await fireEvent.press(option);
    await fireEvent.changeText(screen.getByTestId("bulk-join-day"), "01.12.2026");
    await fireEvent.press(screen.getByTestId("bulk-join-save"));
    await waitFor(() => expect(calls("POST", "/students/bulk")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/bulk")[0]![1])).toEqual({
      action: "addToGroup",
      studentIds: ["s1", "s2"],
      groupId: "g1",
      joinedAt: "2026-12-01",
      status: "ACTIVE",
    });
    expect(await screen.findByTestId("students-bulk-note")).toHaveTextContent("1 done, 1 skipped.");
    expect(screen.queryByTestId("students-bulk")).toBeNull();
  });

  it("gives the ticked students one discount in a group", async () => {
    await showList({ "POST /students/bulk": { done: 2, skipped: 0 } });
    await tick("s1");
    await tick("s2");
    await fireEvent.press(screen.getByTestId("bulk-discount"));
    expect(await screen.findByText("Discount for 2 students")).toBeOnTheScreen();
    // Nothing is sent until a group and a price are there.
    await fireEvent.press(screen.getByTestId("bulk-discount-save"));
    expect(calls("POST", "/students/bulk")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("bulk-discount-group"));
    await fireEvent.press(await screen.findByTestId("bulk-discount-group-option-g1"));
    await fireEvent.changeText(screen.getByTestId("bulk-discount-price"), "300 000");
    await fireEvent.changeText(screen.getByTestId("bulk-discount-months"), "3");
    await fireEvent.changeText(screen.getByTestId("bulk-discount-comment"), " Siblings ");
    await fireEvent.press(screen.getByTestId("bulk-discount-save"));
    await waitFor(() => expect(calls("POST", "/students/bulk")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/bulk")[0]![1])).toEqual({
      action: "discount",
      studentIds: ["s1", "s2"],
      groupId: "g1",
      discountedPrice: 300000,
      months: 3,
      comment: "Siblings",
    });
    expect(await screen.findByTestId("students-bulk-note")).toHaveTextContent("2 done, 0 skipped.");
  });

  it("shows the server's refusal of a discount on its field and keeps the ticks", async () => {
    serve({
      "GET /students": page(LIST),
      "GET /students/options": OPTIONS,
    });
    const usual = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) =>
      init?.method === "POST" && url.endsWith("/students/bulk")
        ? (answer(422, {
            error: {
              code: "errors.validation",
              message: "errors.validation",
              fields: { months: ["validation.max"] },
            },
          }) as Response)
        : usual(url, init),
    );
    await renderScreen(<StudentsScreen />);
    await screen.findByTestId("student-s1");
    await tick("s1");
    await fireEvent.press(screen.getByTestId("bulk-discount"));
    await fireEvent.press(await screen.findByTestId("bulk-discount-group"));
    await fireEvent.press(await screen.findByTestId("bulk-discount-group-option-g1"));
    await fireEvent.changeText(screen.getByTestId("bulk-discount-price"), "300000");
    await fireEvent.changeText(screen.getByTestId("bulk-discount-months"), "99");
    await fireEvent.press(screen.getByTestId("bulk-discount-save"));
    await waitFor(() => expect(calls("POST", "/students/bulk")).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("bulk-discount-sheet")).toBeOnTheScreen());
    expect(screen.getByTestId("students-bulk-count")).toHaveTextContent("1 selected");
    expect(screen.queryByTestId("students-bulk-note")).toBeNull();
  });

  it("sends one SMS to the ticked students", async () => {
    await showList({
      "POST /sms/count": { count: 2, skipped: 0, sample: ["Ali Valiyev", "Bobur Rahimov"] },
      "GET /sms-templates": [],
      "POST /sms/send": { total: 2, sent: 2, failed: 0, skipped: 0, adapter: "fake" },
    });
    await tick("s1");
    await tick("s2");
    await fireEvent.press(screen.getByTestId("bulk-sms"));
    expect(await screen.findByText("SMS to 2 students")).toBeOnTheScreen();
    await waitFor(() => expect(calls("POST", "/sms/count")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms/count")[0]![1])).toEqual({
      target: { kind: "students", studentIds: ["s1", "s2"] },
    });
    await fireEvent.changeText(await screen.findByTestId("bulk-sms-sheet-text"), "No lesson today");
    await fireEvent.press(screen.getByTestId("bulk-sms-sheet-send"));
    await waitFor(() => expect(calls("POST", "/sms/send")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms/send")[0]![1])).toEqual({
      target: { kind: "students", studentIds: ["s1", "s2"] },
      text: "No lesson today",
    });
  });

  it("takes the ticked students as an Excel file", async () => {
    await showList();
    await tick("s1");
    await tick("s3");
    expect(screen.getByTestId("bulk-excel")).toHaveTextContent("Excel (selected)");
    await fireEvent.press(screen.getByTestId("bulk-excel"));
    await waitFor(() => expect(mockSaveFile).toHaveBeenCalledTimes(1));
    const path = mockSaveFile.mock.calls[0]![0];
    expect(path).toContain("/students/export.xlsx?");
    expect(decodeURIComponent(path)).toContain("ids=s1,s3");
    expect(path).not.toContain("archived");
  });

  it("archives the ticked students after a question", async () => {
    await showList({ "POST /students/bulk": { done: 2, skipped: 0 } });
    await tick("s1");
    await tick("s2");
    await fireEvent.press(screen.getByTestId("bulk-archive"));
    expect(await screen.findByText("Archive 2 students?")).toBeOnTheScreen();
    expect(calls("POST", "/students/bulk")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("bulk-confirm-confirm"));
    await waitFor(() => expect(calls("POST", "/students/bulk")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/bulk")[0]![1])).toEqual({
      action: "archive",
      studentIds: ["s1", "s2"],
    });
    expect(await screen.findByTestId("students-bulk-note")).toHaveTextContent("2 done, 0 skipped.");
  });

  it("only brings students back, or takes their file, in the archive", async () => {
    mockParams = { archived: "true" };
    await showList({ "POST /students/bulk": { done: 1, skipped: 0 } }, [
      student({ isArchived: true, groups: [] }),
    ]);
    await tick("s1");
    expect(screen.getByTestId("bulk-archive")).toHaveTextContent("Restore");
    expect(screen.queryByTestId("bulk-add-to-group")).toBeNull();
    expect(screen.queryByTestId("bulk-discount")).toBeNull();
    expect(screen.queryByTestId("bulk-sms")).toBeNull();
    await fireEvent.press(screen.getByTestId("bulk-excel"));
    await waitFor(() => expect(mockSaveFile).toHaveBeenCalledTimes(1));
    expect(mockSaveFile.mock.calls[0]![0]).toContain("archived=true");
    await fireEvent.press(screen.getByTestId("bulk-archive"));
    expect(await screen.findByText("Restore 1 students?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("bulk-confirm-confirm"));
    await waitFor(() => expect(calls("POST", "/students/bulk")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/bulk")[0]![1])).toEqual({
      action: "restore",
      studentIds: ["s1"],
    });
  });
});

describe("an SMS to everyone the list shows", () => {
  it("goes to the students under the search and the filters", async () => {
    mockParams = { paymentStatus: "DEBTOR" };
    await showList({
      "POST /sms/count": { count: 3, skipped: 0, sample: ["Ali Valiyev"] },
      "GET /sms-templates": [],
      "POST /sms/send": { total: 3, sent: 3, failed: 0, skipped: 0, adapter: "fake" },
    });
    await fireEvent.changeText(screen.getByTestId("students-search"), "ali");
    await waitFor(() =>
      expect(calls("GET", "/students").some(([url]) => url.includes("q=ali"))).toBe(true),
    );
    await fireEvent.press(screen.getByTestId("students-sms"));
    await waitFor(() => expect(calls("POST", "/sms/count")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms/count")[0]![1])).toEqual({
      target: { kind: "studentFilter", paymentStatus: "DEBTOR", q: "ali" },
    });
    await fireEvent.changeText(await screen.findByTestId("students-sms-sheet-text"), "Reminder");
    await fireEvent.press(screen.getByTestId("students-sms-sheet-send"));
    await waitFor(() => expect(calls("POST", "/sms/send")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms/send")[0]![1])).toEqual({
      target: { kind: "studentFilter", paymentStatus: "DEBTOR", q: "ali" },
      text: "Reminder",
    });
  });

  it("is kept from someone who may not send SMS", async () => {
    mockPermissions = ["students.view", "students.update"];
    await showList();
    expect(screen.queryByTestId("students-sms")).toBeNull();
  });
});

describe("Activate on the students list", () => {
  it("activates the new and trial students among those listed, after a question", async () => {
    await showList({ "POST /students/activate": { activated: 1 } });
    await fireEvent.press(screen.getByTestId("students-activate"));
    expect(
      await screen.findByText(
        "Every new and trial student among the 3 listed becomes active today.",
      ),
    ).toBeOnTheScreen();
    expect(calls("POST", "/students/activate")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("students-activate-confirm-confirm"));
    await waitFor(() => expect(calls("POST", "/students/activate")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/activate")[0]![1])).toEqual({
      studentIds: ["s1", "s2", "s3"],
    });
    expect(await screen.findByTestId("students-activated")).toHaveTextContent(
      "1 membership activated.",
    );
  });

  it("is not there when nobody listed is new or on trial", async () => {
    await showList({}, [student()]);
    expect(screen.getByTestId("students-sms")).toBeOnTheScreen();
    expect(screen.queryByTestId("students-activate")).toBeNull();
  });

  it("is kept from someone who may not change groups", async () => {
    mockPermissions = ["students.view", "sms.send"];
    await showList();
    expect(screen.queryByTestId("students-activate")).toBeNull();
  });
});
