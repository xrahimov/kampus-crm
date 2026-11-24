import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import type {
  CoinReason,
  GroupCoinRow,
  GroupPlan,
  GroupPlanTopic,
  GroupProgress,
  GroupTest,
  TestDetail,
} from "@/api/types";
import { GroupCoinsScreen } from "@/features/staff/group-coins-screen";
import { GroupPlanScreen } from "@/features/staff/group-plan-screen";
import { GroupTestsScreen } from "@/features/staff/group-tests-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({ id: "g1" }),
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/session", () => ({
  useMe: () => ({ permissions: mockPermissions }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * A teacher's group in the app, the last three pages (A-218): the course
 * plan with when students get each topic, coins given from the phone, and
 * the results of the group's tests. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const GROUP = { id: "g1", name: "GE-Morning A1", status: "ACTIVE" };

beforeEach(() => {
  fetchMock.mockReset();
  mockPermissions = ["groups.view", "groups.attendance.mark", "coins.give", "tests.view"];
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

/** Answers by "<VERB> <end of the path>"; a function is given the request. */
type Routes = Record<string, unknown | ((init?: RequestInit) => Response)>;
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
    if (typeof route === "function") return (route as (init?: RequestInit) => Response)(init);
    return answer(route === undefined ? 204 : 200, route);
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function topic(change: Partial<GroupPlanTopic>): GroupPlanTopic {
  return {
    id: "t1",
    sortOrder: 1,
    title: "Greetings",
    note: null,
    status: "planned",
    lessonId: null,
    lessonDate: null,
    blocks: 0,
    release: { mode: "lesson", date: null },
    open: false,
    ...change,
  };
}

function plan(topics: GroupPlanTopic[]): GroupPlan {
  return {
    courseId: "c1",
    courseName: "General English A1",
    total: topics.length,
    done: topics.filter((t) => t.status === "done").length,
    topics,
  };
}

const PROGRESS: GroupProgress = {
  courseName: "General English A1",
  students: [
    {
      membershipId: "ms1",
      studentId: "s1",
      fullName: "Demo Student One",
      status: "ACTIVE",
      percent: 40,
      topicsComplete: 2,
      topicsTotal: 5,
      exercisesDone: 6,
      exercisesTotal: 10,
      scorePercent: 80,
      attendancePercent: 90,
      homeworkDone: 3,
      homeworkSet: 4,
    },
    {
      membershipId: "ms2",
      studentId: "s2",
      fullName: "Demo Student Two",
      status: "FROZEN",
      percent: null,
      topicsComplete: 0,
      topicsTotal: 5,
      exercisesDone: 0,
      exercisesTotal: 10,
      scorePercent: null,
      attendancePercent: null,
      homeworkDone: 0,
      homeworkSet: 4,
    },
  ],
};

describe("a group's course plan on the teacher's side", () => {
  it("shows the topics, what was covered and how far each student is", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/syllabus": plan([
        topic({ status: "done", lessonId: "l1", lessonDate: "2026-11-21", blocks: 3, open: true }),
        topic({ id: "t2", sortOrder: 2, title: "Numbers", status: "next", note: "Bring cards" }),
        topic({ id: "t3", sortOrder: 3, title: "Family" }),
      ]),
      "GET /groups/g1/progress": PROGRESS,
    });
    await renderScreen(<GroupPlanScreen />);
    expect(await screen.findByTestId("plan-progress")).toHaveTextContent(/1/);
    expect(screen.getByTestId("topic-t1")).toHaveTextContent(/1\. Greetings/);
    expect(screen.getByTestId("topic-covered")).toHaveTextContent(/Nov 21/);
    expect(screen.getByTestId("topic-open")).toBeTruthy();
    expect(screen.getByTestId("topic-t2")).toHaveTextContent(/Bring cards/);
    // A topic without content has nothing to open, so it offers no choice.
    expect(screen.getAllByTestId("topic-release-now")).toHaveLength(1);

    expect(await screen.findByTestId("plan-student-ms1")).toHaveTextContent(/40%/);
    expect(screen.getByTestId("plan-student-ms1")).toHaveTextContent(/3\/4/);
    expect(screen.getByTestId("plan-student-ms2")).toHaveTextContent(/–/);
  });

  it("opens a topic's content now, and on a chosen day", async () => {
    let stored = topic({ blocks: 2 });
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/syllabus": () => answer(200, plan([stored])),
      "GET /groups/g1/progress": { courseName: "General English A1", students: [] },
      "PUT /groups/g1/syllabus/t1/release": (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as GroupPlanTopic["release"];
        stored = { ...stored, release: body, open: body.mode === "now" };
        return answer(200, body);
      },
    });
    await renderScreen(<GroupPlanScreen />);
    await screen.findByTestId("topic-t1");
    expect(screen.queryByTestId("topic-open")).toBeNull();

    await fireEvent.press(screen.getByTestId("topic-release-now"));
    await waitFor(() => expect(calls("PUT", "/syllabus/t1/release")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/syllabus/t1/release")[0]![1])).toEqual({
      mode: "now",
      date: null,
    });
    expect(await screen.findByTestId("topic-open")).toBeTruthy();

    // "On a day" first shows the days; the day itself is what gets saved.
    await fireEvent.press(screen.getByTestId("topic-release-date"));
    expect(calls("PUT", "/syllabus/t1/release")).toHaveLength(1);
    const days = screen.getAllByTestId(/^topic-date-/);
    expect(days).toHaveLength(14);
    await fireEvent.press(days[2]!);
    await waitFor(() => expect(calls("PUT", "/syllabus/t1/release")).toHaveLength(2));
    const sent = sentBody(calls("PUT", "/syllabus/t1/release")[1]![1]) as GroupPlanTopic["release"];
    expect(sent.mode).toBe("date");
    expect(sent.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(screen.queryByTestId("topic-open")).toBeNull());
  });

  it("only tells someone who may not mark lessons when the content opens", async () => {
    mockPermissions = ["groups.view"];
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/syllabus": plan([
        topic({ blocks: 1, release: { mode: "date", date: "2026-11-25" } }),
      ]),
      "GET /groups/g1/progress": { courseName: "General English A1", students: [] },
    });
    await renderScreen(<GroupPlanScreen />);
    expect(await screen.findByTestId("topic-release")).toHaveTextContent(/Nov 25/);
    expect(screen.queryByTestId("topic-release-now")).toBeNull();
  });

  it("says what went wrong when the day cannot be saved", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/syllabus": plan([topic({ blocks: 1 })]),
      "GET /groups/g1/progress": { courseName: "General English A1", students: [] },
      "PUT /groups/g1/syllabus/t1/release": () =>
        answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    });
    await renderScreen(<GroupPlanScreen />);
    await fireEvent.press(await screen.findByTestId("topic-release-now"));
    await settle();
    expect(screen.queryByTestId("topic-open")).toBeNull();
    expect(screen.getByTestId("topic-t1")).toHaveTextContent(/not allowed|permission|access/i);
  });
});

const COINS: GroupCoinRow[] = [
  {
    rank: 1,
    studentId: "s1",
    membershipId: "ms1",
    fullName: "Demo Student One",
    balance: 45,
    groupCoins: 30,
    lastComment: "Great homework",
  },
  {
    rank: 2,
    studentId: "s2",
    membershipId: "ms2",
    fullName: "Demo Student Two",
    balance: 10,
    groupCoins: 10,
    lastComment: null,
  },
];
const REASONS: CoinReason[] = [
  { id: "r1", name: "Homework", maxCoins: 5, isActive: true },
  { id: "r2", name: "Active in class", maxCoins: 3, isActive: true },
];

describe("a group's coins on the teacher's side", () => {
  it("gives coins to one student for one of the centre's reasons", async () => {
    let rows = COINS;
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/coins": () => answer(200, rows),
      "GET /coin-reasons": REASONS,
      "POST /coins/give": () => {
        rows = [COINS[0]!, { ...COINS[1]!, balance: 13, groupCoins: 13 }];
        return answer(201, { id: "tx1" });
      },
    });
    await renderScreen(<GroupCoinsScreen />);
    expect(await screen.findByTestId("coins-ms1")).toHaveTextContent(/Demo Student One/);
    expect(screen.getByTestId("coins-ms1")).toHaveTextContent(/Great homework/);
    expect(screen.getAllByTestId("coins-balance")[0]).toHaveTextContent("45");

    await fireEvent.press(screen.getByTestId("coins-give-ms2"));
    expect(screen.getByTestId("coins-form")).toHaveTextContent(/Demo Student Two/);
    // Nothing can be sent before a reason is chosen.
    expect(screen.getByTestId("coins-send")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("coins-reason-r2"));
    // The amount starts at the most the reason allows.
    expect(screen.getByTestId("coins-amount").props.value).toBe("3");
    await fireEvent.changeText(screen.getByTestId("coins-comment"), " Spoke a lot today ");
    await fireEvent.press(screen.getByTestId("coins-send"));

    await waitFor(() => expect(calls("POST", "/coins/give")).toHaveLength(1));
    expect(sentBody(calls("POST", "/coins/give")[0]![1])).toEqual({
      studentId: "s2",
      groupId: "g1",
      reasonId: "r2",
      amount: 3,
      comment: "Spoke a lot today",
    });
    expect(await screen.findByTestId("coins-given")).toHaveTextContent(/Demo Student Two/);
    expect(screen.queryByTestId("coins-form")).toBeNull();
    await waitFor(() => expect(screen.getAllByTestId("coins-balance")[1]).toHaveTextContent("13"));
  });

  it("keeps the form and says why when the centre refuses the gift", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/coins": COINS,
      "GET /coin-reasons": REASONS,
      "POST /coins/give": () =>
        answer(422, { error: { code: "VALIDATION", message: "errors.validation" } }),
    });
    await renderScreen(<GroupCoinsScreen />);
    await fireEvent.press(await screen.findByTestId("coins-give-ms1"));
    await fireEvent.press(screen.getByTestId("coins-reason-r1"));
    await fireEvent.changeText(screen.getByTestId("coins-amount"), "9x");
    expect(screen.getByTestId("coins-amount").props.value).toBe("9");
    await fireEvent.press(screen.getByTestId("coins-send"));
    expect(await screen.findByTestId("coins-problem")).toBeTruthy();
    expect(screen.getByTestId("coins-form")).toBeTruthy();
  });

  it("offers no giving to someone without the right, or in a finished group", async () => {
    mockPermissions = ["groups.view"];
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/coins": COINS });
    await renderScreen(<GroupCoinsScreen />);
    await screen.findByTestId("coins-ms1");
    expect(screen.queryByTestId("coins-give-ms1")).toBeNull();
    expect(calls("GET", "/coin-reasons")).toHaveLength(0);
  });

  it("says so when the centre has no reasons yet", async () => {
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/coins": COINS, "GET /coin-reasons": [] });
    await renderScreen(<GroupCoinsScreen />);
    await fireEvent.press(await screen.findByTestId("coins-give-ms1"));
    expect(await screen.findByTestId("coins-no-reasons")).toBeTruthy();
    expect(screen.getByTestId("coins-send")).toBeDisabled();
  });
});

function test(change: Partial<GroupTest>): GroupTest {
  return {
    id: "q1",
    name: "Unit 3 test",
    subject: "English",
    timeLimitMinutes: 20,
    passPercent: 60,
    deadline: "2026-11-28",
    status: "ACTIVE",
    questionCount: 10,
    totalPoints: 20,
    attemptCount: 2,
    accuracy: 75,
    ...change,
  };
}

describe("a group's tests on the teacher's side", () => {
  it("lists the tests and opens the results of this group's students", async () => {
    const detail: TestDetail = {
      ...test({}),
      candidates: [],
      attempts: [
        {
          id: "a1",
          studentId: "s1",
          studentName: "Demo Student One",
          groupName: "GE-Morning A1",
          score: 18,
          maxScore: 20,
          percent: 90,
          passed: true,
          submittedAt: "2026-11-22T10:00:00.000Z",
          durationSeconds: 540,
        },
        {
          id: "a2",
          studentId: "s9",
          studentName: "Someone Else",
          groupName: "GE-Evening B1",
          score: 8,
          maxScore: 20,
          percent: 40,
          passed: false,
          submittedAt: "2026-11-22T11:00:00.000Z",
          durationSeconds: null,
        },
      ] as TestDetail["attempts"],
    };
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/tests": [test({}), test({ id: "q2", name: "Draft", status: "DRAFT" })],
      "GET /tests/q1": detail,
    });
    await renderScreen(<GroupTestsScreen />);
    expect(await screen.findByTestId("test-q1")).toHaveTextContent(/Unit 3 test/);
    expect(screen.getAllByTestId("test-summary")[0]).toHaveTextContent(/75%/);
    expect(screen.getAllByTestId("test-summary")[0]).toHaveTextContent(/Nov 28/);
    // The results are asked for only when someone opens them.
    expect(calls("GET", "/tests/q1")).toHaveLength(0);

    await fireEvent.press(screen.getAllByTestId("test-results")[0]!);
    expect(await screen.findByTestId("attempt-a1")).toHaveTextContent(/90%/);
    expect(screen.getByTestId("attempt-a1")).toHaveTextContent(/18\/20/);
    // The other group's student stays out of this group's page.
    expect(screen.queryByTestId("attempt-a2")).toBeNull();
  });

  it("says a test has no results yet, and where tests are written", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/tests": [test({ attemptCount: 0, accuracy: null, deadline: null })],
      "GET /tests/q1": { ...test({}), attempts: [], candidates: [] },
    });
    await renderScreen(<GroupTestsScreen />);
    await fireEvent.press(await screen.findByTestId("test-results"));
    expect(await screen.findByTestId("test-no-attempts")).toBeTruthy();

    clearClients();
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/tests": [] });
    await renderScreen(<GroupTestsScreen />);
    expect(await screen.findByText(/under Settings, Tests/)).toBeTruthy();
  });
});
