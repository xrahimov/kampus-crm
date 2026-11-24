import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type {
  AbsenceCase,
  AbsenceContact,
  AbsencePage,
  JoinRequest,
  JoinRequests,
} from "@/api/office-follow-up";
import { AbsencesScreen } from "@/features/office/absences-screen";
import { JoinRequestsScreen } from "@/features/office/join-requests-screen";
import { Menu } from "@/features/office/menu";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
let mockPermissions: string[] = [];
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
const mockSaveFile = jest.fn<Promise<string>, [string, string]>(async () => "opened");
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockBranches[0],
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
jest.mock("@/lib/web", () => ({ openOnSite: jest.fn(async () => undefined) }));

/*
 * The people the office answers or calls, in the app (A-232): sign-in
 * requests and absences. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockPermissions = [
    "students.view",
    "students.create",
    "students.update",
    "staff.view",
    "staff.create",
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

function request(change: Partial<JoinRequest> = {}): JoinRequest {
  return {
    id: "j1",
    door: "STUDENT",
    phone: "+998901112233",
    fullName: "Sardor Karimov",
    note: "I study in GE-Morning",
    branchId: "b1",
    branchName: "Chilonzor",
    status: "PENDING",
    createdAt: "2026-11-23T08:00:00.000Z",
    decidedAt: null,
    decidedByName: null,
    ...change,
  };
}

function waiting(items: JoinRequest[]): JoinRequests {
  return { items, doors: ["STUDENT", "STAFF"] };
}

const STUDENT_OPTIONS = {
  schools: [],
  sources: [],
  courses: [],
  groups: [
    {
      id: "g1",
      name: "GE-Morning A1",
      branchId: "b1",
      courseId: "c1",
      teacherId: null,
      teacherName: null,
      time: null,
      status: "ACTIVE",
    },
  ],
  teachers: [],
  paymentMethods: [],
};

describe("sign-in requests", () => {
  it("lets someone in as a new student of a group", async () => {
    serve({
      "GET /join-requests": waiting([request()]),
      "GET /students/options": STUDENT_OPTIONS,
      "POST /join-requests/j1/approve": { ok: true },
    });
    await renderScreen(<JoinRequestsScreen />);
    expect(await screen.findByTestId("join-j1")).toHaveTextContent(
      /They wrote: I study in GE-Morning/,
    );
    await fireEvent.press(screen.getByTestId("join-approve-j1"));
    expect((await screen.findByTestId("join-name")).props.value).toBe("Sardor Karimov");
    await fireEvent.press(await screen.findByTestId("join-group"));
    await fireEvent.press(await screen.findByTestId("join-group-option-g1"));
    await fireEvent.press(screen.getByTestId("join-gender-FEMALE"));
    await fireEvent.press(screen.getByTestId("join-approve-save"));
    await waitFor(() => expect(calls("POST", "/join-requests/j1/approve")).toHaveLength(1));
    expect(sentBody(calls("POST", "/join-requests/j1/approve")[0]![1])).toEqual({
      mode: "newStudent",
      fullName: "Sardor Karimov",
      branchId: "b1",
      gender: "FEMALE",
      groupId: "g1",
    });
  });

  it("puts the number on a student who is already there, as a parent's", async () => {
    serve({
      "GET /join-requests": waiting([request()]),
      "GET /students/options": STUDENT_OPTIONS,
      "GET /students": {
        items: [{ id: "s1", fullName: "Ali Valiyev", phone: "+998907770000", groups: [] }],
        total: 1,
        page: 1,
        pageSize: 8,
      },
      "POST /join-requests/j1/approve": { ok: true },
    });
    await renderScreen(<JoinRequestsScreen />);
    await fireEvent.press(await screen.findByTestId("join-approve-j1"));
    await fireEvent.press(await screen.findByTestId("join-mode"));
    await fireEvent.press(await screen.findByTestId("join-mode-option-parent"));

    // Without a student nothing is sent.
    await fireEvent.press(screen.getByTestId("join-approve-save"));
    expect(calls("POST", "/join-requests/j1/approve")).toHaveLength(0);
    expect(screen.getByTestId("join-fill-all")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("join-student-search"), "Ali");
    await fireEvent.press(await screen.findByTestId("join-student-s1"));
    expect(screen.getByTestId("join-student-picked")).toHaveTextContent("Ali Valiyev");
    await fireEvent.changeText(screen.getByTestId("join-name"), "Vali aka");
    await fireEvent.press(screen.getByTestId("join-approve-save"));
    await waitFor(() => expect(calls("POST", "/join-requests/j1/approve")).toHaveLength(1));
    expect(sentBody(calls("POST", "/join-requests/j1/approve")[0]![1])).toEqual({
      mode: "parent",
      studentId: "s1",
      fullName: "Vali aka",
    });
  });

  it("lets a member of staff in with a role", async () => {
    serve({
      "GET /join-requests": waiting([request({ door: "STAFF", note: null })]),
      "GET /roles": [
        { id: "r1", code: "TEACHER", name: "Teacher", isActive: true },
        { id: "r2", code: "OLD", name: "Old role", isActive: false },
      ],
      "POST /join-requests/j1/approve": { ok: true },
    });
    await renderScreen(<JoinRequestsScreen />);
    await fireEvent.press(await screen.findByTestId("join-approve-j1"));
    expect(screen.queryByTestId("join-mode")).toBeNull();
    await fireEvent.press(await screen.findByTestId("join-role"));
    await screen.findByTestId("join-role-option-TEACHER");
    expect(screen.queryByTestId("join-role-option-OLD")).toBeNull();
    await fireEvent.press(await screen.findByTestId("join-role-option-TEACHER"));
    await fireEvent.press(screen.getByTestId("join-approve-save"));
    await waitFor(() => expect(calls("POST", "/join-requests/j1/approve")).toHaveLength(1));
    expect(sentBody(calls("POST", "/join-requests/j1/approve")[0]![1])).toEqual({
      mode: "newStaff",
      fullName: "Sardor Karimov",
      branchId: "b1",
      gender: "MALE",
      roleCode: "TEACHER",
    });
  });

  it("declines after asking, and lists the declined under their own tab", async () => {
    serve({
      "GET /join-requests": (url: string) =>
        url.includes("status=DECLINED")
          ? waiting([request({ id: "j2", status: "DECLINED", decidedByName: "Aziz Admin" })])
          : waiting([request()]),
      "POST /join-requests/j1/decline": { ok: true },
    });
    await renderScreen(<JoinRequestsScreen />);
    await fireEvent.press(await screen.findByTestId("join-decline-j1"));
    expect(calls("POST", "/join-requests/j1/decline")).toHaveLength(0);
    await fireEvent.press(await screen.findByTestId("join-decline-sheet-confirm"));
    await waitFor(() => expect(calls("POST", "/join-requests/j1/decline")).toHaveLength(1));

    await fireEvent.press(screen.getByTestId("join-tab-DECLINED"));
    expect(await screen.findByTestId("join-j2")).toHaveTextContent(/Declined by Aziz Admin/);
    // A declined person can still be let in, but not declined again.
    expect(screen.getByTestId("join-approve-j2")).toBeTruthy();
    expect(screen.queryByTestId("join-decline-j2")).toBeNull();
  });

  it("is a row of the menu with the number waiting, for whoever may answer", async () => {
    serve({
      "GET /join-requests": waiting([request(), request({ id: "j3" })]),
      "GET /notifications": { items: [], total: 0, page: 1, pageSize: 20, unread: 0 },
    });
    await renderScreen(<Menu />);
    expect(await screen.findByTestId("menu-join-requests")).toHaveTextContent(/Sign-in requests2/);
    expect(screen.queryByTestId("menu-join-requests-site")).toBeNull();
  });

  it("is not in the menu of someone who may add neither students nor staff", async () => {
    mockPermissions = ["students.view"];
    serve({ "GET /notifications": { items: [], total: 0, page: 1, pageSize: 20, unread: 0 } });
    await renderScreen(<Menu />);
    await screen.findByTestId("menu-notifications");
    expect(screen.queryByTestId("menu-join-requests")).toBeNull();
    expect(calls("GET", "/join-requests")).toHaveLength(0);
  });
});

describe("absences", () => {
  function absence(change: Partial<AbsenceCase> = {}): AbsenceCase {
    return {
      id: "a1",
      membershipId: "m1",
      studentId: "s1",
      studentName: "Ali Valiyev",
      phone: "+998901112233",
      parentPhone: "+998907778899",
      groupId: "g1",
      groupName: "GE-Morning A1",
      teacher: "Jasur Aliyev",
      branchId: "b1",
      branchName: "Chilonzor",
      status: "OPEN",
      reason: "STREAK",
      missed: 3,
      sinceAt: "2026-11-14",
      days: 9,
      lastPresentAt: "2026-11-12",
      openedAt: "2026-11-18T08:00:00.000Z",
      lastContactAt: null,
      lastChannel: null,
      lastOutcome: null,
      lastContactBy: null,
      closedAt: null,
      closedReason: null,
      hasTelegram: false,
      ...change,
    };
  }
  function listed(items: AbsenceCase[]): AbsencePage {
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: 30,
      summary: { open: 5, noContact: 2, streak: 4, silent: 1 },
      rules: { streak: 2, silentDays: 14 },
    };
  }

  it("lists who stopped coming and logs a call with how it ended", async () => {
    serve({
      "GET /absences": listed([absence()]),
      "POST /absences/a1/contacts": { id: "k1" },
    });
    await renderScreen(<AbsencesScreen />);
    const card = await screen.findByTestId("absence-a1");
    expect(card).toHaveTextContent(/3 lessons missed in a row/);
    expect(card).toHaveTextContent(/9 days/);
    // The list as it is filtered, as an Excel file (A-256).
    await fireEvent.press(screen.getByTestId("absences-excel"));
    expect(mockSaveFile).toHaveBeenLastCalledWith(
      "/absences/export.xlsx?status=OPEN&locale=en",
      "kampus.xlsx",
    );
    expect(screen.getByTestId("absence-contact-a1")).toHaveTextContent("Nobody has called yet");
    expect(screen.getByTestId("absences-no-contact")).toHaveTextContent("2");
    expect(screen.getByText("Not seen for 14 days")).toBeTruthy();
    expect(calls("GET", "/absences")[0]![0]).toContain("status=OPEN");
    // One branch: no branch filter.
    expect(screen.queryByTestId("absences-branch")).toBeNull();

    await fireEvent.press(screen.getByTestId("absence-log-a1"));
    expect(await screen.findByTestId("absence-contact-dial-1")).toHaveTextContent(
      "+998907778899 (parent)",
    );
    await fireEvent.press(screen.getByTestId("absence-contact-outcome"));
    await fireEvent.press(await screen.findByTestId("absence-contact-outcome-option-ILL"));
    await fireEvent.changeText(screen.getByTestId("absence-contact-note"), "Back on Monday");
    await fireEvent.press(screen.getByTestId("absence-contact-save"));
    await waitFor(() => expect(calls("POST", "/absences/a1/contacts")).toHaveLength(1));
    expect(sentBody(calls("POST", "/absences/a1/contacts")[0]![1])).toEqual({
      channel: "CALL",
      outcome: "ILL",
      note: "Back on Monday",
    });
  });

  it("shows a case's history and opens the student", async () => {
    const contact: AbsenceContact = {
      id: "k1",
      channel: "CALL",
      outcome: "NO_ANSWER",
      note: null,
      createdBy: "Dilnoza Karimova",
      createdAt: "2026-11-20T10:00:00.000Z",
    };
    serve({
      "GET /absences": listed([
        absence({ lastContactAt: "2026-11-20T10:00:00.000Z", lastOutcome: "NO_ANSWER" }),
      ]),
      "GET /absences/a1/contacts": [contact],
    });
    await renderScreen(<AbsencesScreen />);
    await fireEvent.press(await screen.findByTestId("absence-history-a1"));
    expect(await screen.findByTestId("absence-contact-row-k1")).toHaveTextContent(
      /Call: No answer/,
    );

    await fireEvent.press(screen.getByTestId("absence-student-a1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });
  });

  it("narrows the list by reason and branch, and has no Log button on a closed case", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    serve({
      "GET /absences": listed([
        absence({
          status: "CLOSED",
          closedReason: "RETURNED",
          closedAt: "2026-11-22T08:00:00.000Z",
        }),
      ]),
    });
    await renderScreen(<AbsencesScreen />);
    expect(await screen.findByTestId("absence-a1")).toHaveTextContent(/Came back/);
    expect(screen.queryByTestId("absence-log-a1")).toBeNull();

    await fireEvent.press(screen.getByTestId("absences-reason"));
    await fireEvent.press(await screen.findByTestId("absences-reason-option-SILENT"));
    await fireEvent.press(screen.getByTestId("absences-branch"));
    await fireEvent.press(await screen.findByTestId("absences-branch-option-b2"));
    await waitFor(() =>
      expect(
        calls("GET", "/absences").some(
          ([url]) => url.includes("reason=SILENT") && url.includes("branchId=b2"),
        ),
      ).toBe(true),
    );
    await screen.findByTestId("absence-a1");
  });
});
