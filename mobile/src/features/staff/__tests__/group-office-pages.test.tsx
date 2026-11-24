import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type {
  ExamResults,
  GroupExam,
  GroupHistoryRow,
  GroupKnowledge,
  MonthGrid,
  Page,
  StudentComment,
} from "@/api/types";
import { GroupCommentsScreen } from "@/features/staff/group-comments-screen";
import { GroupExamsScreen } from "@/features/staff/group-exams-screen";
import { GroupHistoryScreen } from "@/features/staff/group-history-screen";
import { GroupKnowledgeScreen } from "@/features/staff/group-knowledge-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

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
  useLocalSearchParams: () => ({ id: "g1" }),
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/session", () => ({
  useMe: () => ({ permissions: mockPermissions, branches: [{ id: "b1", name: "Chilonzor" }] }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * The last pages of a teacher's group in the app (A-219): exams with their
 * scores, knowledge by topic, comments on students and the group's history.
 * Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const GROUP = { id: "g1", name: "GE-Morning A1", status: "ACTIVE" };

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockPermissions = ["groups.view", "students.view", "exams.view", "tests.view"];
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

function exam(change: Partial<GroupExam>): GroupExam {
  return {
    id: "x1",
    type: "GROUP",
    name: "Unit 1 to 4 exam",
    isRetake: false,
    date: "2026-11-28",
    startTime: "10:00",
    endTime: "11:30",
    examinerName: "Demo Teacher",
    roomName: "Room 2",
    passScore: 60,
    maxScore: 100,
    status: "FINISHED",
    studentCount: 3,
    gradedCount: 2,
    ...change,
  };
}

describe("a group's exams on the teacher's side", () => {
  it("lists the exams and opens the scores of the group's students", async () => {
    const results: ExamResults = {
      exam: exam({}),
      rows: [
        {
          studentId: "s1",
          fullName: "Demo Student One",
          groupName: "GE-Morning A1",
          score: 82,
          isPresent: true,
          comment: "Strong writing",
          level: "B",
          passed: true,
        },
        {
          studentId: "s2",
          fullName: "Demo Student Two",
          groupName: "GE-Morning A1",
          score: 41,
          isPresent: true,
          comment: null,
          level: null,
          passed: false,
        },
        {
          studentId: "s3",
          fullName: "Demo Student Three",
          groupName: "GE-Morning A1",
          score: null,
          isPresent: false,
          comment: null,
          level: null,
          passed: null,
        },
      ],
    };
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/exams": {
        items: [
          exam({}),
          exam({ id: "x2", name: "Mock IELTS", type: "MOCK", status: "NOT_STARTED" }),
        ],
        counts: { GROUP: 1, MOCK: 1 },
      },
      "GET /exams/x1/results": results,
    });
    await renderScreen(<GroupExamsScreen />);
    expect(await screen.findByTestId("exam-x1")).toHaveTextContent(/Unit 1 to 4 exam/);
    expect(screen.getAllByTestId("exam-when")[0]).toHaveTextContent(
      /Nov 28.*10:00 – 11:30.*Room 2/,
    );
    expect(screen.getAllByTestId("exam-facts")[0]).toHaveTextContent(/Pass score: 60/);
    expect(screen.getAllByTestId("exam-status")[1]).toHaveTextContent("Not started");
    expect(screen.getAllByTestId("exam-facts")[1]).toHaveTextContent(/Mock/);
    // The scores are asked for only when someone opens them.
    expect(calls("GET", "/exams/x1/results")).toHaveLength(0);

    await fireEvent.press(screen.getAllByTestId("exam-results")[0]!);
    expect(await screen.findByTestId("exam-row-s1")).toHaveTextContent(/82\/100/);
    expect(screen.getByTestId("exam-row-s1")).toHaveTextContent(/B, Strong writing/);
    expect(screen.getByTestId("exam-row-s1")).toHaveTextContent(/Passed/);
    expect(screen.getByTestId("exam-row-s2")).toHaveTextContent(/Failed/);
    expect(screen.getByTestId("exam-row-s3")).toHaveTextContent(/Absent/);

    // An exam opens its own page, where it is graded (A-235).
    await fireEvent.press(screen.getAllByTestId("exam-open")[0]!);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/exam/[id]", params: { id: "x1" } });
    // Adding an exam is for whoever may.
    expect(screen.queryByTestId("group-exam-add")).toBeNull();
  });

  it("shows only this group's students of a mock exam", async () => {
    const mock = exam({ id: "x2", name: "Mock IELTS", type: "MOCK" });
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/exams": { items: [mock], counts: { GROUP: 0, MOCK: 1 } },
      "GET /exams/x2/results": {
        exam: mock,
        rows: [
          {
            studentId: "s1",
            fullName: "Demo Student One",
            groupName: "GE-Morning A1",
            score: null,
            isPresent: true,
            comment: null,
            level: null,
            passed: null,
          },
          {
            studentId: "s9",
            fullName: "Someone Else",
            groupName: "GE-Evening B1",
            score: 70,
            isPresent: true,
            comment: null,
            level: null,
            passed: true,
          },
        ],
      },
    });
    await renderScreen(<GroupExamsScreen />);
    await fireEvent.press(await screen.findByTestId("exam-results"));
    expect(await screen.findByTestId("exam-row-s1")).toHaveTextContent(/Not graded/);
    expect(screen.queryByTestId("exam-row-s9")).toBeNull();
  });

  it("says so when the centre hides the exam schedule from teachers", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/exams": () =>
        answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    });
    await renderScreen(<GroupExamsScreen />);
    expect(await screen.findByTestId("exams-hidden")).toHaveTextContent(/hidden for teachers/);
    expect(screen.queryByTestId("retry")).toBeNull();
  });

  it("adds an exam for this group when the group has none", async () => {
    mockPermissions = ["groups.view", "exams.view", "exams.create"];
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/exams": { items: [], counts: {} },
      "GET /exams/options": {
        groups: [],
        courses: [],
        rooms: [],
        gradingSystems: [],
        examiners: [],
      },
      "POST /exams": exam({ id: "x9" }),
    });
    await renderScreen(<GroupExamsScreen />);
    expect(await screen.findByText("Nothing found.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("group-exam-add"));
    await fireEvent.changeText(await screen.findByTestId("exam-name"), "Midterm");
    // The group is this one and the kind is a group exam: neither is asked.
    expect(screen.queryByTestId("exam-group")).toBeNull();
    expect(screen.queryByTestId("exam-type")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("exam-pass"), "60");
    await fireEvent.changeText(screen.getByTestId("exam-max"), "100");
    await fireEvent.press(screen.getByTestId("exam-save"));
    await waitFor(() => expect(calls("POST", "/exams")).toHaveLength(1));
    expect(sentBody(calls("POST", "/exams")[0]![1])).toMatchObject({
      type: "GROUP",
      groupId: "g1",
      name: "Midterm",
    });
  });
});

const KNOWLEDGE: GroupKnowledge = {
  topics: [
    {
      subject: "English",
      topic: "Articles",
      questions: 4,
      answered: 20,
      correct: 18,
      accuracy: 90,
    },
    {
      subject: "English",
      topic: "Past simple",
      questions: 5,
      answered: 20,
      correct: 8,
      accuracy: 40,
    },
    { subject: "Maths", topic: "Fractions", questions: 3, answered: 0, correct: 0, accuracy: null },
  ],
  tests: [
    { id: "q1", name: "Unit 1 check", subject: "English" },
    { id: "q2", name: "Unit 2 check", subject: "English" },
    { id: "q3", name: "Numbers", subject: "Maths" },
  ],
  subjects: ["English", "Maths"],
  attempts: 7,
  students: 4,
};

describe("what a group knows, topic by topic", () => {
  it("shows each topic's share of right answers and narrows by subject and test", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/knowledge": (url: string) => {
        const query = new URL(url, "http://kampus.test").searchParams;
        if (query.get("testId") === "q2") {
          return answer(200, { ...KNOWLEDGE, topics: [KNOWLEDGE.topics[1]], attempts: 3 });
        }
        if (query.get("subject") === "English") {
          return answer(200, { ...KNOWLEDGE, topics: KNOWLEDGE.topics.slice(0, 2), attempts: 6 });
        }
        return answer(200, KNOWLEDGE);
      },
    });
    await renderScreen(<GroupKnowledgeScreen />);
    expect(await screen.findByTestId("knowledge-summary")).toHaveTextContent(
      "7 submissions from 4 students",
    );
    expect(screen.getByTestId("knowledge-topic-Articles")).toHaveTextContent(/90%/);
    expect(screen.getByTestId("knowledge-topic-Articles")).toHaveTextContent(/Answered: 20/);
    expect(screen.getByTestId("knowledge-topic-Fractions")).toHaveTextContent(/–/);

    await fireEvent.press(screen.getByTestId("knowledge-subject-English"));
    await waitFor(() => expect(screen.queryByTestId("knowledge-topic-Fractions")).toBeNull());
    expect(screen.getByTestId("knowledge-summary")).toHaveTextContent(/6 submissions/);
    // Only the chosen subject's tests are offered.
    expect(screen.queryByTestId("knowledge-test-q3")).toBeNull();

    await fireEvent.press(screen.getByTestId("knowledge-test-q2"));
    await waitFor(() => expect(screen.queryByTestId("knowledge-topic-Articles")).toBeNull());
    expect(screen.getByTestId("knowledge-topic-Past simple")).toHaveTextContent(/40%/);
    const last = fetchMock.mock.calls.at(-1)![0];
    expect(last).toMatch(/subject=English/);
    expect(last).toMatch(/testId=q2/);
  });

  it("says so when no test was handed in yet", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/knowledge": { topics: [], tests: [], subjects: [], attempts: 0, students: 0 },
    });
    await renderScreen(<GroupKnowledgeScreen />);
    expect(await screen.findByText("No submitted tests for this selection.")).toBeTruthy();
    expect(screen.queryByTestId("knowledge-subject-all")).toBeNull();
  });
});

function comment(change: Partial<StudentComment>): StudentComment {
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

const GRID: MonthGrid = {
  month: "2026-11",
  lessons: [],
  members: [
    {
      membershipId: "ms1",
      studentId: "s1",
      fullName: "Demo Student One",
      status: "ACTIVE",
      average: null,
    },
    {
      membershipId: "ms2",
      studentId: "s2",
      fullName: "Demo Student Two",
      status: "ACTIVE",
      average: null,
    },
    {
      membershipId: "ms4",
      studentId: "s4",
      fullName: "Demo Student Four",
      status: "GRADUATED",
      average: null,
    },
  ],
};

describe("comments on a group's students", () => {
  it("lists them, narrows to one student and adds one from the phone", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/lessons": GRID,
      "GET /groups/g1/student-comments": [
        comment({}),
        comment({ id: "c2", studentId: "s2", studentName: "Demo Student Two", text: "Was ill" }),
      ],
      "POST /groups/g1/student-comments": () =>
        answer(
          201,
          comment({
            id: "c3",
            studentId: "s2",
            studentName: "Demo Student Two",
            text: "Back and well",
          }),
        ),
    });
    await renderScreen(<GroupCommentsScreen />);
    expect(await screen.findByTestId("comment-c1")).toHaveTextContent(/Needs more speaking/);
    expect(screen.getByTestId("comment-c1")).toHaveTextContent(/Demo Teacher/);

    await fireEvent.press(screen.getByTestId("comment-only-s2"));
    expect(screen.queryByTestId("comment-c1")).toBeNull();
    expect(screen.getByTestId("comment-c2")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("comment-only-all"));

    // A comment is about one student: the app asks who before it sends anything.
    await screen.findByTestId("comment-new");
    // Someone who left the group is not offered: the server would refuse a teacher.
    expect(screen.queryByTestId("comment-student-s4")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("comment-text"), " Back and well ");
    await fireEvent.press(screen.getByTestId("comment-add"));
    expect(screen.getByTestId("comment-problem")).toHaveTextContent("Choose a student.");
    expect(calls("POST", "/student-comments")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("comment-student-s2"));
    await fireEvent.press(screen.getByTestId("comment-add"));
    await waitFor(() => expect(calls("POST", "/student-comments")).toHaveLength(1));
    expect(sentBody(calls("POST", "/student-comments")[0]![1])).toEqual({
      studentId: "s2",
      text: "Back and well",
    });
    expect(await screen.findByTestId("comment-c3")).toHaveTextContent(/Back and well/);
    expect(screen.getByTestId("comment-text").props.value).toBe("");
  });

  it("only reads for someone who may not see students", async () => {
    mockPermissions = ["groups.view"];
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/student-comments": [comment({})] });
    await renderScreen(<GroupCommentsScreen />);
    await screen.findByTestId("comment-c1");
    expect(screen.queryByTestId("comment-new")).toBeNull();
    expect(calls("GET", "/groups/g1/lessons")).toHaveLength(0);
  });
});

function change(row: Partial<GroupHistoryRow>): GroupHistoryRow {
  return {
    id: "h1",
    action: "group.update",
    field: "name",
    before: "GE-Morning",
    after: "GE-Morning A1",
    actorName: "Demo Admin",
    at: "2026-11-20T09:00:00.000Z",
    ...row,
  };
}

describe("a group's history", () => {
  it("tells each change in words", async () => {
    const page: Page<GroupHistoryRow> = {
      items: [
        change({}),
        change({ id: "h2", field: "status", before: "ACTIVE", after: "ARCHIVED" }),
        change({
          id: "h3",
          field: "slots",
          before: [{ weekday: 1, startTime: "09:00", endTime: "10:30", roomName: "Room 2" }],
          after: [
            { weekday: 1, startTime: "09:00", endTime: "10:30", roomName: "Room 2" },
            { weekday: 3, startTime: "09:00", endTime: "10:30", roomName: null },
          ],
        }),
        change({
          id: "h4",
          field: "teachers",
          before: [],
          after: [{ fullName: "Demo Teacher", shareValue: 40, shareType: "PERCENT" }],
        }),
        change({ id: "h5", action: "group.finish", field: "", before: null, after: null }),
        change({ id: "h6", action: "stream.update", field: "", before: null, after: null }),
        change({ id: "h7", action: "topic.release", field: "", before: null, after: null }),
        change({ id: "h8", action: "lesson.studentMove", field: "", before: null, after: null }),
      ],
      page: 1,
      pageSize: 100,
      total: 8,
    };
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/history": page });
    await renderScreen(<GroupHistoryScreen />);
    expect(await screen.findByTestId("history-h1")).toHaveTextContent(/Name/);
    expect(screen.getByTestId("history-h1")).toHaveTextContent(/Before: GE-Morning/);
    expect(screen.getByTestId("history-h1")).toHaveTextContent(/After: GE-Morning A1/);
    expect(screen.getByTestId("history-h1")).toHaveTextContent(/Demo Admin/);
    expect(screen.getByTestId("history-h2")).toHaveTextContent(/After: Archived/);
    expect(screen.getByTestId("history-h3")).toHaveTextContent(
      /After: Mon 09:00–10:30 \(Room 2\); Wed 09:00–10:30/,
    );
    expect(screen.getByTestId("history-h4")).toHaveTextContent(/Before: –/);
    expect(screen.getByTestId("history-h4")).toHaveTextContent(/After: Demo Teacher 40%/);
    expect(screen.getByTestId("history-h5")).toHaveTextContent(/Finished/);
    // The stream, the topics and the bookings are told apart from the group being edited.
    expect(screen.getByTestId("history-h6")).toHaveTextContent(/Stream post changed/);
    expect(screen.getByTestId("history-h7")).toHaveTextContent(/When students get a topic/);
    expect(screen.getByTestId("history-h8")).toHaveTextContent(/A student moved a lesson/);
    expect(screen.queryByTestId("history-latest")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/history?pageSize=100"))).toBe(true);
  });

  it("says that only the latest changes are shown when there are more", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/history": { items: [change({})], page: 1, pageSize: 100, total: 240 },
    });
    await renderScreen(<GroupHistoryScreen />);
    expect(await screen.findByTestId("history-latest")).toHaveTextContent(/latest 100 changes/);
  });

  it("says so when nothing was changed yet", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/history": { items: [], page: 1, pageSize: 100, total: 0 },
    });
    await renderScreen(<GroupHistoryScreen />);
    expect(await screen.findByText("No changes recorded yet.")).toBeTruthy();
  });
});
