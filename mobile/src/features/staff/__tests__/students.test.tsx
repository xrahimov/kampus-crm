import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import type {
  Page,
  StudentComment,
  StudentDetail,
  StudentGroupCard,
  StudentProgress,
  StudentRow,
  StudentTests,
} from "@/api/types";
import { StudentScreen } from "@/features/staff/student-screen";
import { StudentsScreen } from "@/features/staff/students-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "s1" }),
}));
jest.mock("@/lib/session", () => ({
  // A teacher: the teaching view, no office rights.
  useMe: () => ({
    permissions: ["groups.view", "students.view"],
    view: { current: "TEACHING", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * Students on the teacher's side, in the app (A-220): the list with its
 * search, and one student's page. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
});

function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

/** Answers by "<VERB> <end of the path>"; a function is given the address and the request. */
type Routes = Record<string, unknown | ((url: string, init?: RequestInit) => Response)>;
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
    if (typeof route === "function") {
      return (route as (url: string, init?: RequestInit) => Response)(url, init);
    }
    return answer(route === undefined ? 204 : 200, route);
  });
}

/** Lets the search rest, so the list is asked for again. */
async function rest() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

function group(change: Partial<StudentGroupCard>): StudentGroupCard {
  return {
    membershipId: "ms1",
    groupId: "g1",
    groupName: "GE-Morning A1",
    courseName: "General English",
    status: "ACTIVE",
    groupStatus: "ACTIVE",
    teacherName: "Demo Teacher",
    time: "09:00–10:30",
    weekdays: [2, 4, 6],
    balance: 0,
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

function student(change: Partial<StudentRow>): StudentRow {
  return {
    id: "s1",
    fullName: "Demo Student One",
    phone: "+998901112233",
    note: null,
    isArchived: false,
    isBlacklisted: false,
    gradeAverage: 4.5,
    balance: 0,
    groups: [group({})],
    ...change,
  };
}

function page(items: StudentRow[], total = items.length, pageNo = 1): Page<StudentRow> {
  return { items, page: pageNo, pageSize: 30, total };
}

describe("the students a teacher may see", () => {
  it("lists them by name with their groups, grade and debt, and opens one", async () => {
    serve({
      "GET /students": page([
        student({}),
        student({
          id: "s2",
          fullName: "Demo Student Two",
          gradeAverage: null,
          balance: -150000,
          groups: [group({ status: "GRADUATED" })],
        }),
      ]),
    });
    await renderScreen(<StudentsScreen />);
    expect(await screen.findByTestId("student-s1")).toHaveTextContent(/Demo Student One/);
    expect(screen.getByTestId("student-s1")).toHaveTextContent(/GE-Morning A1/);
    expect(screen.getByTestId("student-s1")).toHaveTextContent(/4\.5/);
    expect(screen.getByTestId("students-count")).toHaveTextContent("2 students");
    // Someone who left every group has none to name; a debt is told.
    expect(screen.getByTestId("student-s2")).toHaveTextContent(/No groups/);
    expect(screen.getByTestId("student-owes")).toHaveTextContent(/Owes/);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/sort=fullName:asc/);

    await fireEvent.press(screen.getByTestId("student-s1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });
  });

  it("searches by name or phone once the typing rests", async () => {
    serve({
      "GET /students": (url: string) => {
        const q = new URL(url, "http://kampus.test").searchParams.get("q");
        if (q === "two")
          return answer(200, page([student({ id: "s2", fullName: "Demo Student Two" })]));
        if (q === "nobody") return answer(200, page([]));
        return answer(
          200,
          page([student({}), student({ id: "s2", fullName: "Demo Student Two" })]),
        );
      },
    });
    await renderScreen(<StudentsScreen />);
    await screen.findByTestId("student-s1");
    await fireEvent.changeText(screen.getByTestId("students-search"), " two ");
    await rest();
    await waitFor(() => expect(screen.queryByTestId("student-s1")).toBeNull());
    expect(screen.getByTestId("student-s2")).toBeTruthy();
    expect(screen.getByTestId("students-count")).toHaveTextContent("1 student");

    await fireEvent.changeText(screen.getByTestId("students-search"), "nobody");
    await rest();
    expect(await screen.findByText("No student matches.")).toBeTruthy();
  });

  it("brings the next students on Show more", async () => {
    serve({
      "GET /students": (url: string) => {
        const pageNo = Number(new URL(url, "http://kampus.test").searchParams.get("page"));
        return answer(
          200,
          pageNo === 2
            ? page([student({ id: "s31", fullName: "Zed Last" })], 31, 2)
            : page([student({})], 31, 1),
        );
      },
    });
    await renderScreen(<StudentsScreen />);
    await screen.findByTestId("student-s1");
    await fireEvent.press(screen.getByTestId("students-more"));
    expect(await screen.findByTestId("student-s31")).toBeTruthy();
    expect(screen.getByTestId("student-s1")).toBeTruthy();
    expect(screen.queryByTestId("students-more")).toBeNull();
  });
});

const DETAIL: StudentDetail = {
  ...student({ note: "Allergic to nuts", balance: -200000 }),
  groups: [group({})],
  birthDate: "2012-05-04",
  schoolName: "School 14",
  parents: [{ id: "p1", fullName: "Demo Parent", phone: "+998 90 444 55 66" }],
  customFields: [{ id: "f1", name: "T-shirt", value: "M" }],
};

const PROGRESS: StudentProgress = {
  gradeAverage: 4.5,
  attendancePercent: 88,
  examAverage: null,
  months: [{ month: "2026-11", gradeAverage: 4.6, attendancePercent: 90, lessons: 10 }],
  byGroup: [
    {
      groupId: "g1",
      groupName: "GE-Morning A1",
      courseName: "General English",
      status: "ACTIVE",
      gradeAverage: 4.5,
      attendancePercent: 88,
      lessons: 24,
    },
  ],
  exams: [
    {
      examId: "x1",
      name: "Placement check",
      date: "2026-11-09",
      groupName: "GE-Morning A1",
      score: 78,
      maxScore: 100,
      passed: true,
      level: "B2",
      isPresent: true,
    },
  ],
};

const TESTS: StudentTests = {
  kpis: { total: 2, average: 80, best: 100, worst: 60, averageSeconds: 600 },
  level: "HIGH",
  problemTopics: [
    { subject: "English", topic: "Articles", questions: 4, answered: 4, correct: 2, accuracy: 50 },
  ],
  strongTopics: [],
  attempts: [
    {
      id: "a1",
      testName: "Unit 1 grammar check",
      subject: "English",
      score: 5,
      maxScore: 5,
      percent: 100,
      passed: true,
      durationSeconds: 600,
      submittedAt: "2026-11-20T09:00:00.000Z",
    },
  ],
};

function note(change: Partial<StudentComment>): StudentComment {
  return {
    id: "c1",
    studentId: "s1",
    studentName: "Demo Student One",
    groupId: "g1",
    groupName: "GE-Morning A1",
    text: "Needs more speaking practice",
    authorName: "Demo Teacher",
    createdAt: "2026-11-20T09:00:00.000Z",
    ...change,
  };
}

describe("one student on the teacher's side", () => {
  it("shows who they are, calls the student or a parent, and opens a group", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    serve({ "GET /students/s1": DETAIL });
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("student-person")).toHaveTextContent(/Demo Student One/);
    expect(screen.getByTestId("student-person")).toHaveTextContent(/School 14/);
    expect(screen.getByTestId("student-person")).toHaveTextContent(/T-shirt: M/);
    expect(screen.getByTestId("student-person")).toHaveTextContent(/Allergic to nuts/);
    expect(screen.getByTestId("student-owes")).toHaveTextContent(/Owes/);
    expect(screen.getByTestId("student-grade")).toHaveTextContent("4.5");

    await fireEvent.press(screen.getByTestId("student-call"));
    expect(open).toHaveBeenLastCalledWith("tel:+998901112233");
    // A number is dialled without the spaces it is written with.
    await fireEvent.press(screen.getByTestId("parent-call-p1"));
    expect(open).toHaveBeenLastCalledWith("tel:+998904445566");

    expect(screen.getByTestId("student-group-g1")).toHaveTextContent(/Tue, Thu, Sat 09:00–10:30/);
    await fireEvent.press(screen.getByTestId("student-group-g1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/group/[id]", params: { id: "g1" } });
  });

  it("says so when the centre keeps the phone number from the teacher", async () => {
    serve({ "GET /students/s1": { ...DETAIL, phone: null, parents: [] } });
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("student-no-phone")).toBeTruthy();
    expect(screen.queryByTestId("student-call")).toBeNull();
    expect(screen.getByTestId("student-parents")).toHaveTextContent(/No parents recorded/);
  });

  it("shows the progress and the tests only when their part is opened", async () => {
    serve({
      "GET /students/s1": DETAIL,
      "GET /students/s1/progress": PROGRESS,
      "GET /students/s1/test-results": TESTS,
    });
    await renderScreen(<StudentScreen />);
    await screen.findByTestId("student-person");
    expect(calls("GET", "/students/s1/progress")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("student-tab-progress"));
    expect(await screen.findByTestId("progress-attendance")).toHaveTextContent("88%");
    expect(screen.getByTestId("progress-group-g1")).toHaveTextContent(/Lessons: 24/);
    expect(screen.getByTestId("progress-month-2026-11")).toHaveTextContent(/Nov 2026/);
    expect(screen.getByTestId("progress-exam-x1")).toHaveTextContent(/78\/100/);
    expect(screen.getByTestId("progress-exam-x1")).toHaveTextContent(/Passed/);

    await fireEvent.press(screen.getByTestId("student-tab-testResults"));
    expect(await screen.findByTestId("tests-average")).toHaveTextContent("80%");
    expect(screen.getByTestId("tests-level")).toHaveTextContent(/Strong/);
    expect(screen.getByTestId("student-tests")).toHaveTextContent(/Articles/);
    expect(screen.getByTestId("student-tests")).toHaveTextContent(/No strong topics yet/);
    expect(screen.getByTestId("tests-attempt-a1")).toHaveTextContent(/100%/);
  });

  it("reads the notes about the student and adds one", async () => {
    serve({
      "GET /students/s1": DETAIL,
      "GET /students/s1/comments": [note({})],
      "POST /students/s1/comments": () =>
        answer(201, note({ id: "c2", groupId: null, groupName: null, text: "Called the mother" })),
    });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-comments"));
    expect(await screen.findByTestId("student-comment-c1")).toHaveTextContent(/GE-Morning A1/);
    await fireEvent.changeText(screen.getByTestId("student-comment-text"), " Called the mother ");
    await fireEvent.press(screen.getByTestId("student-comment-add"));
    await waitFor(() => expect(calls("POST", "/students/s1/comments")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/s1/comments")[0]![1])).toEqual({
      text: "Called the mother",
    });
    expect(await screen.findByTestId("student-comment-c2")).toHaveTextContent(/Called the mother/);
  });

  it("says a student has no tests yet", async () => {
    serve({
      "GET /students/s1": DETAIL,
      "GET /students/s1/test-results": {
        ...TESTS,
        kpis: { total: 0, average: null, best: null, worst: null, averageSeconds: null },
        attempts: [],
      },
    });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-testResults"));
    expect(await screen.findByText("No submitted tests yet.")).toBeTruthy();
  });
});
