import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { OfficeTest, OfficeTestDetail, Question, TestOptions } from "@/api/office-tests";
import { nativeRoute } from "@/features/office/site-paths";
import { TestScreen } from "@/features/settings/test-screen";
import { TestsSettingsScreen } from "@/features/settings/tests-settings-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "t1" }),
}));
const ALL_RIGHTS = ["tests.view", "tests.create", "tests.update", "tests.delete", "students.view"];
let mockPermissions = ALL_RIGHTS;
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
 * Tests and the question bank in the app (A-250): the site's Settings → Tests
 * and a test's own page. Each test here plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  mockPermissions = ALL_RIGHTS;
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
/** The query of the last GET to an address. */
function asked(tail: string): URLSearchParams {
  const last = calls("GET", tail).at(-1);
  return new URLSearchParams(last?.[0].split("?")[1] ?? "");
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

const refusal = (fields: Record<string, string[]>) =>
  answer(400, { error: { code: "VALIDATION", message: "errors.validation", fields } });
const conflict = (message: string) => answer(409, { error: { code: "CONFLICT", message } });

function test(change: Partial<OfficeTest> = {}): OfficeTest {
  return {
    id: "t1",
    name: "Unit 1 grammar check",
    subject: "English",
    timeLimitMinutes: 20,
    passPercent: 60,
    deadline: "2026-12-01",
    status: "ACTIVE",
    groups: [{ id: "g1", name: "GE-Morning A1" }],
    questionCount: 2,
    totalPoints: 3,
    attemptCount: 1,
    accuracy: 67,
    createdAt: "2026-11-01T08:00:00.000Z",
    ...change,
  };
}

function detail(change: Partial<OfficeTestDetail> = {}): OfficeTestDetail {
  return {
    ...test(),
    questions: [
      {
        questionId: "q1",
        subject: "English",
        topic: "To be",
        text: "She ___ a teacher.",
        options: ["am", "is", "are"],
        correctIndex: 1,
        points: 1,
      },
      {
        questionId: "q2",
        subject: "English",
        topic: "Articles",
        text: "___ apple a day.",
        options: ["A", "An"],
        correctIndex: 1,
        points: 2,
      },
    ],
    attempts: [
      {
        id: "a1",
        studentId: "s1",
        studentName: "Sardor Karimov",
        groupName: "GE-Morning A1",
        score: 2,
        maxScore: 3,
        percent: 67,
        passed: true,
        durationSeconds: 540,
        submittedAt: "2026-11-20T09:30:00.000Z",
      },
    ],
    candidates: [
      { studentId: "s1", fullName: "Sardor Karimov", groupId: "g1", groupName: "GE-Morning A1" },
      { studentId: "s2", fullName: "Malika Yusupova", groupId: "g1", groupName: "GE-Morning A1" },
    ],
    ...change,
  };
}

const OPTIONS: TestOptions = {
  groups: [
    { id: "g1", name: "GE-Morning A1", branchId: "b1" },
    { id: "g2", name: "IELTS Evening", branchId: "b1" },
  ],
  questions: [
    { id: "q1", subject: "English", topic: "To be", text: "She ___ a teacher." },
    { id: "q2", subject: "English", topic: "Articles", text: "___ apple a day." },
    { id: "q3", subject: "Math", topic: "Sums", text: "2 + 2 = ?" },
  ],
  subjects: ["English", "Math"],
};

function question(change: Partial<Question> = {}): Question {
  return {
    id: "q1",
    subject: "English",
    topic: "To be",
    text: "She ___ a teacher.",
    options: ["am", "is", "are"],
    correctIndex: 1,
    usedInTests: 1,
    createdAt: "2026-11-01T08:00:00.000Z",
    ...change,
  };
}

const LIST = {
  items: [
    test(),
    test({ id: "t2", name: "Draft quiz", status: "DRAFT", groups: [], accuracy: null }),
  ],
  kpis: { total: 2, active: 1, attempts: 1, accuracy: 67 },
};
const BANK_OPTIONS = {
  subjects: ["English", "Math"],
  topics: [
    { subject: "English", topic: "To be" },
    { subject: "English", topic: "Articles" },
    { subject: "Math", topic: "Sums" },
  ],
};
const bankPage = (items: Question[], total = items.length, page = 1) => ({
  items,
  page,
  pageSize: 20,
  total,
});

const selected = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.selected === true;
const disabled = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled === true;

describe("where the pages live", () => {
  it("opens Tests and one test's page in the app", () => {
    expect(nativeRoute("/settings/tests")).toBe("/staff/settings/tests");
    expect(nativeRoute("/settings/tests/t9")).toEqual({
      pathname: "/staff/settings/tests/[id]",
      params: { id: "t9" },
    });
    expect(nativeRoute("/settings/tests/t9/more")).toBeNull();
  });
});

describe("the tests", () => {
  it("lists the tests with the key figures and opens one", async () => {
    serve({ "GET /tests": LIST, "GET /tests/options": OPTIONS });
    await renderScreen(<TestsSettingsScreen />);
    expect(await screen.findByTestId("kpi-total")).toHaveTextContent(/Total tests2/);
    expect(screen.getByTestId("kpi-accuracy")).toHaveTextContent(/67%/);
    expect(screen.getByTestId("test-t1")).toHaveTextContent(/Unit 1 grammar check/);
    expect(screen.getByTestId("test-t1")).toHaveTextContent(/GE-Morning A1/);
    expect(screen.getByTestId("test-t1")).toHaveTextContent(/3 points/);
    expect(screen.getByTestId("test-t2")).toHaveTextContent(/Not given to any group/);
    await fireEvent.press(screen.getByTestId("test-t1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/settings/tests/[id]",
      params: { id: "t1" },
    });
  });

  it("asks the server for a status, a subject and the newest first", async () => {
    serve({ "GET /tests": LIST, "GET /tests/options": OPTIONS });
    await renderScreen(<TestsSettingsScreen />);
    await screen.findByTestId("tests-list");
    expect([...asked("/tests").keys()]).toEqual([]);
    await fireEvent.press(screen.getByTestId("tests-status"));
    await fireEvent.press(await screen.findByTestId("tests-status-option-DRAFT"));
    await waitFor(() => expect(asked("/tests").get("status")).toBe("DRAFT"));
    await fireEvent.press(screen.getByTestId("tests-subject"));
    await fireEvent.press(await screen.findByTestId("tests-subject-option-Math"));
    await waitFor(() => expect(asked("/tests").get("subject")).toBe("Math"));
    await fireEvent.press(screen.getByTestId("tests-recent"));
    await waitFor(() => expect(asked("/tests").get("recent")).toBe("1"));
    expect(selected("tests-recent")).toBe(true);
  });

  it("creates a test with a group and questions picked from the bank", async () => {
    serve({
      "GET /tests": LIST,
      "GET /tests/options": OPTIONS,
      "POST /tests": test({ id: "t9", name: "New test" }),
    });
    await renderScreen(<TestsSettingsScreen />);
    await fireEvent.press(await screen.findByTestId("tests-add"));
    // Nothing typed: the form asks for a name and a subject.
    await fireEvent.press(await screen.findByTestId("test-save"));
    expect(await screen.findAllByText("Required.")).toHaveLength(2);
    await fireEvent.changeText(screen.getByTestId("test-name"), "New test");
    await fireEvent.press(await screen.findByTestId("test-subject-English"));
    // Only the subject's questions are offered.
    expect(screen.getByTestId("test-question-q1")).toBeOnTheScreen();
    expect(screen.queryByTestId("test-question-q3")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("test-question-search"), "apple");
    expect(screen.queryByTestId("test-question-q1")).toBeNull();
    await fireEvent.press(screen.getByTestId("test-pick-q2"));
    await fireEvent.changeText(screen.getByTestId("test-points-q2"), "5");
    // A picked question stays in sight whatever is searched for.
    await fireEvent.changeText(screen.getByTestId("test-question-search"), "teacher");
    expect(screen.getByTestId("test-question-q2")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("test-pick-q1"));
    expect(screen.getByTestId("test-picked-count")).toHaveTextContent("Questions (2)");
    await fireEvent.press(screen.getByTestId("test-group-g2"));
    await fireEvent.changeText(screen.getByTestId("test-minutes"), "15 min");
    await fireEvent.changeText(screen.getByTestId("test-deadline"), "05.12.2026");
    await fireEvent.press(screen.getByTestId("test-status"));
    await fireEvent.press(await screen.findByTestId("test-status-option-ACTIVE"));
    await fireEvent.press(screen.getByTestId("test-save"));
    await waitFor(() => expect(calls("POST", "/tests")).toHaveLength(1));
    expect(sentBody(calls("POST", "/tests")[0]![1])).toEqual({
      name: "New test",
      subject: "English",
      timeLimitMinutes: 15,
      passPercent: 60,
      deadline: "2026-12-05",
      status: "ACTIVE",
      groupIds: ["g2"],
      questions: [
        { questionId: "q2", points: 5 },
        { questionId: "q1", points: 1 },
      ],
    });
  });

  it("says under the questions why an active test without any is refused", async () => {
    serve({
      "GET /tests": LIST,
      "GET /tests/options": OPTIONS,
      "POST /tests": refusal({ questions: ["validation.noQuestions"] }),
    });
    await renderScreen(<TestsSettingsScreen />);
    await fireEvent.press(await screen.findByTestId("tests-add"));
    await fireEvent.changeText(await screen.findByTestId("test-name"), "Empty");
    await fireEvent.changeText(screen.getByTestId("test-subject"), "History");
    // A subject with no questions yet says where they come from.
    expect(await screen.findByTestId("test-no-questions")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("test-save"));
    expect(await screen.findByTestId("test-questions-problem")).toHaveTextContent(
      "An active test needs at least one question.",
    );
    expect(screen.queryByTestId("test-problem")).toBeNull();
  });

  it("only shows the tests to someone who may not write them", async () => {
    mockPermissions = ["tests.view"];
    serve({ "GET /tests": LIST, "GET /tests/options": OPTIONS });
    await renderScreen(<TestsSettingsScreen />);
    await screen.findByTestId("tests-list");
    expect(screen.queryByTestId("tests-add")).toBeNull();
  });
});

describe("the question bank", () => {
  it("lists the questions and narrows them by words, subject and topic", async () => {
    serve({
      "GET /tests": LIST,
      "GET /tests/options": OPTIONS,
      "GET /question-bank/options": BANK_OPTIONS,
      "GET /question-bank": (url: string) =>
        new URLSearchParams(url.split("?")[1]).get("page") === "2"
          ? bankPage([question({ id: "q2", text: "___ apple a day." })], 21, 2)
          : bankPage([question()], 21),
    });
    await renderScreen(<TestsSettingsScreen />);
    await fireEvent.press(await screen.findByTestId("tests-tabs-bank"));
    expect(await screen.findByTestId("question-q1")).toHaveTextContent(/She ___ a teacher\./);
    expect(screen.getByTestId("question-q1")).toHaveTextContent(/✓ is/);
    expect(screen.getByTestId("question-q1")).toHaveTextContent(/Used in tests: 1/);
    // The button over the tab now adds a question.
    expect(screen.getByTestId("tests-add")).toHaveTextContent("Add question");
    await fireEvent.press(screen.getByTestId("bank-more"));
    expect(await screen.findByTestId("question-q2")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("bank-subject"));
    await fireEvent.press(await screen.findByTestId("bank-subject-option-English"));
    await waitFor(() => expect(asked("/question-bank").get("subject")).toBe("English"));
    await fireEvent.press(screen.getByTestId("bank-topic"));
    // Only the subject's topics are offered.
    expect(await screen.findByTestId("bank-topic-option-Articles")).toBeOnTheScreen();
    expect(screen.queryByTestId("bank-topic-option-Sums")).toBeNull();
    await fireEvent.press(screen.getByTestId("bank-topic-option-Articles"));
    await waitFor(() => expect(asked("/question-bank").get("topic")).toBe("Articles"));
    // Another subject takes the topic away.
    await fireEvent.press(screen.getByTestId("bank-subject"));
    await fireEvent.press(await screen.findByTestId("bank-subject-option-Math"));
    await waitFor(() => expect(asked("/question-bank").get("subject")).toBe("Math"));
    expect(asked("/question-bank").get("topic")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("bank-search"), "sum");
    await waitFor(() => expect(asked("/question-bank").get("q")).toBe("sum"));
  });

  it("adds a question with its answers and the right one", async () => {
    serve({
      "GET /tests": LIST,
      "GET /tests/options": OPTIONS,
      "GET /question-bank/options": BANK_OPTIONS,
      "GET /question-bank": bankPage([]),
      "POST /question-bank": question({ id: "q9" }),
    });
    await renderScreen(<TestsSettingsScreen />);
    await fireEvent.press(await screen.findByTestId("tests-tabs-bank"));
    await screen.findByTestId("bank-empty");
    await fireEvent.press(screen.getByTestId("tests-add"));
    await fireEvent.press(await screen.findByTestId("question-subject-Math"));
    await fireEvent.changeText(screen.getByTestId("question-topic"), "Sums");
    await fireEvent.changeText(screen.getByTestId("question-text"), "2 + 2 = ?");
    // Two answers to start with, and neither can go.
    expect(disabled("question-option-remove-0")).toBe(true);
    await fireEvent.changeText(screen.getByTestId("question-option-0"), "3");
    // An answer left empty stops the save.
    await fireEvent.press(screen.getByTestId("question-save"));
    expect(await screen.findByTestId("question-options-problem")).toHaveTextContent("Required.");
    await fireEvent.changeText(screen.getByTestId("question-option-1"), "5");
    await fireEvent.press(screen.getByTestId("question-option-add"));
    await fireEvent.changeText(screen.getByTestId("question-option-2"), "4");
    await fireEvent.press(screen.getByTestId("question-correct-2"));
    // The right answer keeps its mark when an answer above it is removed.
    await fireEvent.press(screen.getByTestId("question-option-remove-1"));
    expect(selected("question-correct-1")).toBe(true);
    await fireEvent.press(screen.getByTestId("question-save"));
    await waitFor(() => expect(calls("POST", "/question-bank")).toHaveLength(1));
    expect(sentBody(calls("POST", "/question-bank")[0]![1])).toEqual({
      subject: "Math",
      topic: "Sums",
      text: "2 + 2 = ?",
      options: ["3", "4"],
      correctIndex: 1,
    });
  });

  it("offers no more than six answers", async () => {
    serve({
      "GET /tests": LIST,
      "GET /tests/options": OPTIONS,
      "GET /question-bank/options": BANK_OPTIONS,
      "GET /question-bank": bankPage([question({ options: ["a", "b", "c", "d", "e", "f"] })]),
    });
    await renderScreen(<TestsSettingsScreen />);
    await fireEvent.press(await screen.findByTestId("tests-tabs-bank"));
    await fireEvent.press(await screen.findByTestId("question-q1"));
    expect(await screen.findByTestId("question-option-5")).toHaveProp("value", "f");
    expect(disabled("question-option-add")).toBe(true);
  });

  it("changes a question, and says why one in use cannot be deleted", async () => {
    serve({
      "GET /tests": LIST,
      "GET /tests/options": OPTIONS,
      "GET /question-bank/options": BANK_OPTIONS,
      "GET /question-bank": bankPage([question()]),
      "PATCH /question-bank/q1": question({ topic: "Verb to be" }),
      "DELETE /question-bank/q1": conflict("errors.questionInUse"),
    });
    await renderScreen(<TestsSettingsScreen />);
    await fireEvent.press(await screen.findByTestId("tests-tabs-bank"));
    await fireEvent.press(await screen.findByTestId("question-q1"));
    expect(await screen.findByTestId("question-text")).toHaveProp("value", "She ___ a teacher.");
    expect(selected("question-correct-1")).toBe(true);
    await fireEvent.press(screen.getByTestId("question-delete"));
    await fireEvent.press(await screen.findByTestId("question-delete-confirm-confirm"));
    expect(
      await screen.findByText("The question is used in a test and cannot be deleted."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("question-delete-confirm-cancel"));
    await fireEvent.changeText(await screen.findByTestId("question-topic"), "Verb to be");
    await fireEvent.press(screen.getByTestId("question-save"));
    await waitFor(() => expect(calls("PATCH", "/question-bank/q1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/question-bank/q1")[0]![1])).toEqual({
      subject: "English",
      topic: "Verb to be",
      text: "She ___ a teacher.",
      options: ["am", "is", "are"],
      correctIndex: 1,
    });
  });

  it("does not open a question for someone who may only look", async () => {
    mockPermissions = ["tests.view"];
    serve({
      "GET /tests": LIST,
      "GET /tests/options": OPTIONS,
      "GET /question-bank/options": BANK_OPTIONS,
      "GET /question-bank": bankPage([question()]),
    });
    await renderScreen(<TestsSettingsScreen />);
    await fireEvent.press(await screen.findByTestId("tests-tabs-bank"));
    await fireEvent.press(await screen.findByTestId("question-q1"));
    expect(screen.queryByTestId("question-text")).toBeNull();
  });
});

describe("one test's page", () => {
  it("shows what the test is, its questions with the right answers, and the results", async () => {
    serve({ "GET /tests/t1": detail(), "GET /tests/options": OPTIONS });
    await renderScreen(<TestScreen />);
    expect(await screen.findByTestId("test-title")).toHaveTextContent("Unit 1 grammar check");
    expect(screen.getByTestId("test-status-badge")).toHaveTextContent("Active");
    expect(screen.getByTestId("test-facts")).toHaveTextContent(
      /English · 20 min · Pass mark \(%\): 60%/,
    );
    expect(screen.getByTestId("test-groups-line")).toHaveTextContent("Groups: GE-Morning A1");
    expect(screen.getByTestId("detail-question-q1")).toHaveTextContent(/1\. She ___ a teacher\./);
    expect(screen.getByTestId("detail-question-q1")).toHaveTextContent(/✓ is/);
    expect(screen.getByTestId("detail-question-q2")).toHaveTextContent(/Articles · 2 pt/);
    expect(screen.getByTestId("attempt-a1")).toHaveTextContent(/Sardor Karimov/);
    expect(screen.getByTestId("attempt-a1")).toHaveTextContent(/67%2\/3Passed/);
    expect(screen.getByTestId("attempt-a1")).toHaveTextContent(/9 min/);
    await fireEvent.press(screen.getByTestId("attempt-student-a1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });
  });

  it("offers what fits the test's status, and closes an active test", async () => {
    let now = detail();
    serve({
      "GET /tests/t1": () => now,
      "GET /tests/options": OPTIONS,
      "POST /tests/t1/status": () => {
        now = detail({ status: "CLOSED" });
        return test({ status: "CLOSED" });
      },
    });
    await renderScreen(<TestScreen />);
    await screen.findByTestId("test-record");
    expect(screen.queryByTestId("test-activate")).toBeNull();
    expect(screen.queryByTestId("test-reopen")).toBeNull();
    await fireEvent.press(screen.getByTestId("test-close"));
    expect(await screen.findByTestId("test-reopen")).toBeOnTheScreen();
    expect(sentBody(calls("POST", "/tests/t1/status")[0]![1])).toEqual({ status: "CLOSED" });
    expect(screen.queryByTestId("test-record")).toBeNull();
    expect(screen.getByTestId("test-status-badge")).toHaveTextContent("Closed");
  });

  it("says why a draft without questions cannot be activated", async () => {
    serve({
      "GET /tests/t1": detail({ status: "DRAFT", questions: [], questionCount: 0, attempts: [] }),
      "GET /tests/options": OPTIONS,
      "POST /tests/t1/status": refusal({ questions: ["validation.noQuestions"] }),
    });
    await renderScreen(<TestScreen />);
    await fireEvent.press(await screen.findByTestId("test-activate"));
    expect(await screen.findByTestId("test-status-problem")).toBeOnTheScreen();
    expect(screen.getByTestId("test-no-attempts")).toBeOnTheScreen();
  });

  it("changes a test from its page and sends its questions back with it", async () => {
    serve({
      "GET /tests/t1": detail({ attempts: [], attemptCount: 0, accuracy: null }),
      "GET /tests/options": OPTIONS,
      "PATCH /tests/t1": test({ name: "Unit 1 check" }),
    });
    await renderScreen(<TestScreen />);
    await fireEvent.press(await screen.findByTestId("test-edit"));
    expect(await screen.findByTestId("test-name")).toHaveProp("value", "Unit 1 grammar check");
    expect(screen.getByTestId("test-picked-count")).toHaveTextContent("Questions (2)");
    expect(screen.getByTestId("test-points-q2")).toHaveProp("value", "2");
    await fireEvent.changeText(screen.getByTestId("test-name"), "Unit 1 check");
    await fireEvent.press(screen.getByTestId("test-save"));
    await waitFor(() => expect(calls("PATCH", "/tests/t1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/tests/t1")[0]![1])).toEqual({
      name: "Unit 1 check",
      subject: "English",
      timeLimitMinutes: 20,
      passPercent: 60,
      deadline: "2026-12-01",
      status: "ACTIVE",
      groupIds: ["g1"],
      questions: [
        { questionId: "q1", points: 1 },
        { questionId: "q2", points: 2 },
      ],
    });
  });

  it("locks the questions once results are in", async () => {
    serve({ "GET /tests/t1": detail(), "GET /tests/options": OPTIONS });
    await renderScreen(<TestScreen />);
    await fireEvent.press(await screen.findByTestId("test-edit"));
    expect(await screen.findByTestId("test-locked")).toBeOnTheScreen();
    expect(screen.queryByTestId("test-question-search")).toBeNull();
    expect(disabled("test-pick-q1")).toBe(true);
    expect(screen.getByTestId("test-points-q1")).toHaveProp("editable", false);
  });

  it("enters a student's answers", async () => {
    serve({
      "GET /tests/t1": detail(),
      "GET /tests/options": OPTIONS,
      "POST /tests/t1/attempts": { id: "a2" },
    });
    await renderScreen(<TestScreen />);
    await fireEvent.press(await screen.findByTestId("test-record"));
    // Nobody chosen: the form asks for the student.
    await fireEvent.press(await screen.findByTestId("attempt-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("attempt-student"));
    await fireEvent.press(await screen.findByTestId("attempt-student-option-s2:g1"));
    await fireEvent.changeText(screen.getByTestId("attempt-minutes"), "12");
    await fireEvent.press(screen.getByTestId("attempt-answer-q1-0"));
    await fireEvent.press(screen.getByTestId("attempt-answer-q1-1"));
    expect(selected("attempt-answer-q1-1")).toBe(true);
    expect(selected("attempt-answer-q1-0")).toBe(false);
    await fireEvent.press(screen.getByTestId("attempt-save"));
    await waitFor(() => expect(calls("POST", "/tests/t1/attempts")).toHaveLength(1));
    // A question left without an answer is not sent: it counts as unanswered.
    expect(sentBody(calls("POST", "/tests/t1/attempts")[0]![1])).toEqual({
      studentId: "s2",
      groupId: "g1",
      answers: { q1: 1 },
      durationSeconds: 720,
    });
  });

  it("deletes a test after a question, or says why it cannot", async () => {
    let reply: unknown = conflict("errors.testHasAttempts");
    serve({
      "GET /tests/t1": detail(),
      "GET /tests/options": OPTIONS,
      "DELETE /tests/t1": () => reply,
    });
    await renderScreen(<TestScreen />);
    await fireEvent.press(await screen.findByTestId("test-delete"));
    await fireEvent.press(await screen.findByTestId("test-delete-confirm-confirm"));
    expect(await screen.findByText(/Results have been submitted for this test/)).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
    reply = undefined;
    await fireEvent.press(screen.getByTestId("test-delete-confirm-confirm"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("leaves someone who may only look with nothing to press", async () => {
    mockPermissions = ["tests.view"];
    serve({ "GET /tests/t1": detail(), "GET /tests/options": OPTIONS });
    await renderScreen(<TestScreen />);
    await screen.findByTestId("test-title");
    for (const id of ["test-edit", "test-record", "test-close", "test-delete"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    // Without the right to students, a name is not a link.
    expect(disabled("attempt-student-a1")).toBe(true);
  });
});
