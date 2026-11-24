import { notifyManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type { Exam, ExamList, ExamOptions, SheetRow } from "@/api/office-exams";
import { ExamFormSheet, monthsStudied, typedScore } from "@/features/exams/exam-form";
import { ExamScreen } from "@/features/exams/exam-screen";
import { ExamsScreen } from "@/features/exams/exams-screen";
import { nativeRoute } from "@/features/office/site-paths";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { centreToday } from "@/lib/days";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "x1" }),
  useFocusEffect: () => undefined,
}));
let mockPermissions: string[] = [];
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    roles: [{ code: "ADMIN", name: "Admin" }],
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockBranches[0],
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * Exams in the app for the office (A-235): the list with its two kinds, the
 * exam form, and an exam's own page with its grading sheet and, for a mock
 * exam, its registrations. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

// An answer is told to the screen in the same breath it arrives in, not a timer later: a
// redraw then never falls between two steps of a test, where React would not expect it.
beforeAll(() => notifyManager.setScheduler((flush) => queueMicrotask(flush)));
afterAll(() => notifyManager.setScheduler((flush) => setTimeout(flush, 0)));

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockPermissions = ["exams.view", "exams.create", "exams.update", "exams.delete"];
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
    if (!key) return answer(404, { error: { code: "errors.notFound" } });
    const route = routes[key];
    const body = typeof route === "function" ? (route as (url: string) => unknown)(url) : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

function exam(change: Partial<Exam> = {}): Exam {
  return {
    id: "x1",
    branchId: "b1",
    branchName: "Chilonzor",
    type: "GROUP",
    name: "Unit 4 test",
    groupId: "g1",
    groupName: "GE-Morning A1",
    groups: [],
    isRetake: false,
    date: "2026-12-05",
    startTime: "09:00",
    endTime: "10:30",
    examinerId: "t1",
    examinerName: "Aziz Rahimov",
    roomId: "r1",
    roomName: "Room 101",
    gradingSystemId: null,
    gradingSystemName: null,
    passScore: 60,
    maxScore: 100,
    price: 0,
    capacity: null,
    status: "NOT_STARTED",
    studentCount: 12,
    gradedCount: 0,
    ...change,
  };
}

const MOCK = exam({
  id: "x2",
  type: "MOCK",
  name: "IELTS mock",
  groupId: null,
  groupName: null,
  groups: [
    { id: "g1", name: "GE-Morning A1" },
    { id: "g2", name: "IELTS 6.5" },
  ],
  examinerId: null,
  examinerName: null,
  roomId: null,
  roomName: null,
  price: 50000,
  capacity: 2,
  studentCount: 1,
});

const list = (items: Exam[], counts = { GROUP: 1, MOCK: 1 }): ExamList => ({ items, counts });

/** A day `months` whole months before today, as a group's first day. */
function monthsAgo(months: number): string {
  const [y = 0, m = 0] = centreToday().split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 - months, 1));
  return date.toISOString().slice(0, 10);
}

const OPTIONS: ExamOptions = {
  groups: [
    {
      id: "g1",
      name: "GE-Morning A1",
      branchId: "b1",
      courseId: "c1",
      courseName: "General English",
      startDate: monthsAgo(5),
      status: "ACTIVE",
    },
    {
      id: "g2",
      name: "IELTS 6.5",
      branchId: "b2",
      courseId: "c2",
      courseName: "IELTS",
      startDate: monthsAgo(1),
      status: "ACTIVE",
    },
    {
      id: "g3",
      name: "GE-Evening B1",
      branchId: "b1",
      courseId: "c1",
      courseName: "General English",
      startDate: monthsAgo(8),
      status: "ACTIVE",
    },
  ],
  courses: [
    { id: "c1", name: "General English", branchId: "b1" },
    { id: "c2", name: "IELTS", branchId: "b2" },
  ],
  rooms: [
    { id: "r1", name: "Room 101", branchId: "b1" },
    { id: "r2", name: "Yunusobod hall", branchId: "b2" },
  ],
  gradingSystems: [{ id: "gs1", name: "Five points" }],
  examiners: [{ id: "t1", fullName: "Aziz Rahimov" }],
};

function row(change: Partial<SheetRow> = {}): SheetRow {
  return {
    studentId: "s1",
    fullName: "Ali Valiyev",
    phone: "+998901234567",
    groupName: "GE-Morning A1",
    score: null,
    isPresent: true,
    comment: null,
    level: null,
    passed: null,
    ...change,
  };
}

const ROWS = [row(), row({ studentId: "s2", fullName: "Bonu Saidova", phone: null })];

describe("the exams list", () => {
  it("has group and mock exams as two lists with the site's filters, and opens one", async () => {
    serve({
      "GET /exams": (url: string) => list(url.includes("type=MOCK") ? [MOCK] : [exam()]),
      "GET /exams/options": OPTIONS,
    });
    await show(<ExamsScreen />);
    expect(await screen.findByTestId("exam-x1")).toHaveTextContent(/Unit 4 test/);
    expect(screen.getByTestId("exam-x1")).toHaveTextContent(/09:00 – 10:30/);
    expect(screen.getByTestId("exam-x1")).toHaveTextContent(/Pass score: 60 \/ 100/);
    expect(screen.getByTestId("exam-x1-people")).toHaveTextContent("Students: 12");
    expect(screen.getByTestId("exams-type-GROUP")).toHaveTextContent("Group exams 1");
    // As on the site: what is still to come first.
    expect(calls("GET", "/exams")[0]![0]).toContain("type=GROUP&status=NOT_STARTED");

    await fireEvent.press(screen.getByTestId("exams-type-MOCK"));
    expect(await screen.findByTestId("exam-x2")).toHaveTextContent(/IELTS mock/);
    expect(screen.getByTestId("exam-x2-groups")).toHaveTextContent("GE-Morning A1, IELTS 6.5");
    expect(screen.getByTestId("exam-x2-people")).toHaveTextContent(/Registrations: 1 \/ 2/);

    await fireEvent.press(screen.getByTestId("exams-status"));
    await fireEvent.press(await screen.findByTestId("exams-status-option-ALL"));
    await waitFor(() => expect(calls("GET", "/exams").at(-1)![0]).not.toContain("status="));
    await fireEvent.press(screen.getByTestId("exams-group"));
    await fireEvent.press(await screen.findByTestId("exams-group-option-g2"));
    await waitFor(() => expect(calls("GET", "/exams").at(-1)![0]).toContain("groupId=g2"));
    await fireEvent.changeText(screen.getByTestId("exams-from"), "01122026");
    await waitFor(() => expect(calls("GET", "/exams").at(-1)![0]).toContain("from=2026-12-01"));

    await fireEvent.press(screen.getByTestId("exam-x2"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/exam/[id]", params: { id: "x2" } });
  });

  it("hides Add exam from someone who may not add one", async () => {
    mockPermissions = ["exams.view"];
    serve({ "GET /exams": list([exam()]), "GET /exams/options": OPTIONS });
    await show(<ExamsScreen />);
    expect(await screen.findByTestId("exam-x1")).toBeOnTheScreen();
    expect(screen.queryByTestId("exams-add")).toBeNull();
  });

  it("says so when the centre hides the exam schedule from teachers", async () => {
    serve({
      "GET /exams": () =>
        answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
      "GET /exams/options": OPTIONS,
    });
    await show(<ExamsScreen />);
    expect(await screen.findByTestId("exams-hidden")).toHaveTextContent(/hidden for teachers/);
    expect(screen.queryByTestId("retry")).toBeNull();
  });
});

describe("the exam form", () => {
  it("adds a group's exam with an examiner and a room of the group's branch", async () => {
    serve({ "GET /exams/options": OPTIONS, "POST /exams": exam({ id: "x7" }) });
    const onClose = jest.fn();
    await show(<ExamFormSheet open onClose={onClose} />);
    await fireEvent.changeText(await screen.findByTestId("exam-name"), " Unit 4 test ");
    await fireEvent.press(screen.getByTestId("exam-group"));
    await fireEvent.press(await screen.findByTestId("exam-group-option-g1"));
    await fireEvent.press(screen.getByTestId("exam-retake"));
    await fireEvent.changeText(screen.getByTestId("exam-date"), "05122026");
    await fireEvent.changeText(screen.getByTestId("exam-end"), "1030");
    await fireEvent.press(screen.getByTestId("exam-more"));
    await fireEvent.press(await screen.findByTestId("exam-examiner"));
    await fireEvent.press(await screen.findByTestId("exam-examiner-option-t1"));
    await fireEvent.press(screen.getByTestId("exam-room"));
    await screen.findByTestId("exam-room-option-r1");
    // The other branch's hall is not offered for this group.
    expect(screen.queryByTestId("exam-room-option-r2")).toBeNull();
    await fireEvent.press(screen.getByTestId("exam-room-option-r1"));
    await fireEvent.changeText(screen.getByTestId("exam-pass"), "7,5");
    await fireEvent.changeText(screen.getByTestId("exam-max"), "10");
    await fireEvent.press(screen.getByTestId("exam-save"));
    await waitFor(() => expect(calls("POST", "/exams")).toHaveLength(1));
    expect(sentBody(calls("POST", "/exams")[0]![1])).toEqual({
      type: "GROUP",
      name: "Unit 4 test",
      groupId: "g1",
      isRetake: true,
      groupIds: [],
      price: 0,
      capacity: null,
      date: "2026-12-05",
      startTime: "09:00",
      endTime: "10:30",
      examinerId: "t1",
      roomId: "r1",
      gradingSystemId: null,
      passScore: 7.5,
      maxScore: 10,
    });
    await settled();
    expect(onClose).toHaveBeenCalled();
  });

  it("says what is missing and sends nothing", async () => {
    serve({ "GET /exams/options": OPTIONS });
    await show(<ExamFormSheet open onClose={jest.fn()} />);
    await fireEvent.changeText(await screen.findByTestId("exam-pass"), "80");
    await fireEvent.changeText(screen.getByTestId("exam-max"), "50");
    await fireEvent.changeText(screen.getByTestId("exam-end"), "0800");
    await fireEvent.press(screen.getByTestId("exam-save"));
    expect(await screen.findAllByText("Required.")).toHaveLength(2);
    expect(screen.getByText("Pass score cannot exceed the maximum score.")).toBeOnTheScreen();
    expect(screen.getByText("Closing time must be after opening time.")).toBeOnTheScreen();
    expect(calls("POST", "/exams")).toHaveLength(0);
  });

  it("adds a mock exam for the groups a filter picks", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    serve({ "GET /exams/options": OPTIONS, "POST /exams": MOCK });
    await show(<ExamFormSheet open onClose={jest.fn()} defaultType="MOCK" />);
    await fireEvent.changeText(await screen.findByTestId("exam-name"), "IELTS mock");
    await fireEvent.changeText(screen.getByTestId("exam-pass"), "5");
    await fireEvent.changeText(screen.getByTestId("exam-max"), "9");
    await fireEvent.press(screen.getByTestId("exam-save"));
    expect(await screen.findByTestId("exam-groups-error")).toHaveTextContent(
      "Select at least one group.",
    );

    // Groups that have studied six months or more: only the evening one.
    await fireEvent.changeText(screen.getByTestId("exam-pick-months"), "6");
    expect(screen.queryByTestId("exam-group-g1")).toBeNull();
    await fireEvent.press(screen.getByTestId("exam-pick-all"));
    expect(screen.getByTestId("exam-picked")).toHaveTextContent(/1 selected/);
    // Then one more by hand, from the other branch.
    await fireEvent.changeText(screen.getByTestId("exam-pick-months"), "");
    await fireEvent.press(screen.getByTestId("exam-pick-all-branches"));
    await fireEvent.press(screen.getByTestId("exam-pick-branch-b2"));
    expect(screen.queryByTestId("exam-group-g1")).toBeNull();
    await fireEvent.press(screen.getByTestId("exam-group-g2"));
    await fireEvent.changeText(screen.getByTestId("exam-price"), "50 000");
    await fireEvent.changeText(screen.getByTestId("exam-capacity"), "30");
    await fireEvent.press(screen.getByTestId("exam-save"));
    await waitFor(() => expect(calls("POST", "/exams")).toHaveLength(1));
    expect(sentBody(calls("POST", "/exams")[0]![1])).toMatchObject({
      type: "MOCK",
      name: "IELTS mock",
      groupId: null,
      isRetake: false,
      groupIds: ["g3", "g2"],
      price: 50000,
      capacity: 30,
      passScore: 5,
      maxScore: 9,
    });
  });

  it("changes an exam without offering another kind", async () => {
    serve({ "GET /exams/options": OPTIONS, "PATCH /exams/x1": exam() });
    await show(<ExamFormSheet open onClose={jest.fn()} exam={exam()} />);
    const name = await screen.findByTestId("exam-name");
    expect(name.props.value).toBe("Unit 4 test");
    expect(screen.queryByTestId("exam-type")).toBeNull();
    // An exam with an examiner or a room opens with them in view.
    expect(screen.getByTestId("exam-examiner")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("exam-pass"), "70");
    await fireEvent.press(screen.getByTestId("exam-save"));
    await waitFor(() => expect(calls("PATCH", "/exams/x1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/exams/x1")[0]![1])).toMatchObject({
      type: "GROUP",
      groupId: "g1",
      examinerId: "t1",
      roomId: "r1",
      passScore: 70,
      maxScore: 100,
    });
  });

  it("is a group exam of the group it was opened from", async () => {
    serve({ "GET /exams/options": OPTIONS, "POST /exams": exam() });
    await show(<ExamFormSheet open onClose={jest.fn()} fixedGroupId="g3" />);
    await fireEvent.changeText(await screen.findByTestId("exam-name"), "Midterm");
    expect(screen.queryByTestId("exam-type")).toBeNull();
    expect(screen.queryByTestId("exam-group")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("exam-pass"), "60");
    await fireEvent.changeText(screen.getByTestId("exam-max"), "100");
    await fireEvent.press(screen.getByTestId("exam-save"));
    await waitFor(() => expect(calls("POST", "/exams")).toHaveLength(1));
    expect(sentBody(calls("POST", "/exams")[0]![1])).toMatchObject({
      type: "GROUP",
      groupId: "g3",
    });
  });

  it("shows the server's reason under the field it is about", async () => {
    serve({
      "GET /exams/options": OPTIONS,
      "PATCH /exams/x1": () =>
        answer(400, {
          error: {
            code: "VALIDATION",
            message: "errors.validation",
            fields: { roomId: ["validation.roomBranch"] },
          },
        }),
    });
    await show(<ExamFormSheet open onClose={jest.fn()} exam={exam()} />);
    await fireEvent.press(await screen.findByTestId("exam-save"));
    expect(await screen.findByText("The room belongs to another branch")).toBeOnTheScreen();
    expect(screen.queryByTestId("exam-problem")).toBeNull();
  });

  it("reads a typed score and counts the months a group has studied", () => {
    expect(typedScore("7,5")).toBe(7.5);
    expect(typedScore(" 60 ")).toBe(60);
    expect(typedScore("")).toBeNull();
    expect(typedScore("six")).toBeNull();
    expect(typedScore("10000")).toBeNull();
    expect(monthsStudied("2026-09-15", "2026-11-14")).toBe(1);
    expect(monthsStudied("2026-09-15", "2026-11-15")).toBe(2);
    expect(monthsStudied("2027-01-10", "2026-11-15")).toBe(0);
  });
});

describe("an exam's page", () => {
  it("says what the exam is and saves the scores of everyone together", async () => {
    const graded = [
      row({ score: 72.5, level: "B", passed: true, comment: "Good" }),
      row({ studentId: "s2", fullName: "Bonu Saidova", phone: null, isPresent: false }),
    ];
    serve({
      "GET /exams/x1/results": { exam: exam(), rows: ROWS },
      "PUT /exams/x1/results": graded,
    });
    await show(<ExamScreen />);
    const facts = await screen.findByTestId("exam-facts");
    expect(facts).toHaveTextContent(/Group exam/);
    expect(facts).toHaveTextContent(/GE-Morning A1/);
    expect(facts).toHaveTextContent(/Aziz Rahimov/);
    expect(facts).toHaveTextContent(/60 \/ 100/);
    expect(facts).toHaveTextContent(/Custom/);
    expect(screen.getByTestId("exam-row-s1")).toHaveTextContent(/Not graded/);
    // Nothing typed yet: nothing to save.
    expect(screen.getByTestId("exam-save-results")).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId("exam-score-s1"), "72,5");
    expect(screen.getByTestId("exam-result-s1")).toHaveTextContent("Passed");
    await fireEvent.changeText(screen.getByTestId("exam-comment-s1"), " Good ");
    await fireEvent.press(screen.getByTestId("exam-present-s2"));
    expect(screen.getByTestId("exam-row-s2")).toHaveTextContent(/Absent/);
    await fireEvent.press(screen.getByTestId("exam-save-results"));
    await waitFor(() => expect(calls("PUT", "/exams/x1/results")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/exams/x1/results")[0]![1])).toEqual({
      results: [
        { studentId: "s1", score: 72.5, isPresent: true, comment: "Good" },
        { studentId: "s2", score: null, isPresent: false, comment: null },
      ],
    });
    expect(await screen.findByTestId("exam-results-saved")).toHaveTextContent("Results saved.");
    expect(screen.getByTestId("exam-row-s1")).toHaveTextContent(/B/);
    await settled();
    expect(screen.getByTestId("exam-save-results")).toBeDisabled();
  });

  it("does not send a score above the maximum", async () => {
    serve({ "GET /exams/x1/results": { exam: exam(), rows: ROWS } });
    await show(<ExamScreen />);
    await fireEvent.changeText(await screen.findByTestId("exam-score-s1"), "120");
    await fireEvent.changeText(screen.getByTestId("exam-score-s2"), "40");
    expect(screen.getByTestId("exam-result-s2")).toHaveTextContent("Failed");
    await fireEvent.press(screen.getByTestId("exam-save-results"));
    expect(await screen.findByText("The score exceeds the maximum.")).toBeOnTheScreen();
    expect(calls("PUT", "/exams/x1/results")).toHaveLength(0);
  });

  it("finishes an exam and opens a finished one again", async () => {
    let finished = false;
    serve({
      "GET /exams/x1/results": () => ({
        exam: exam({ status: finished ? "FINISHED" : "NOT_STARTED" }),
        rows: ROWS,
      }),
      "POST /exams/x1/finish": () => {
        finished = true;
        return exam({ status: "FINISHED" });
      },
      "POST /exams/x1/reopen": () => {
        finished = false;
        return exam();
      },
    });
    await show(<ExamScreen />);
    await fireEvent.press(await screen.findByTestId("exam-finish"));
    await waitFor(() => expect(screen.getByTestId("exam-status")).toHaveTextContent("Finished"));
    await fireEvent.press(await screen.findByTestId("exam-reopen"));
    await waitFor(() => expect(screen.getByTestId("exam-status")).toHaveTextContent("Not started"));
    expect(calls("POST", "/exams/x1/finish")).toHaveLength(1);
    expect(calls("POST", "/exams/x1/reopen")).toHaveLength(1);
  });

  it("deletes an exam nobody is graded in after a question, and goes back", async () => {
    serve({
      "GET /exams/x1/results": { exam: exam(), rows: ROWS },
      "DELETE /exams/x1": undefined,
    });
    await show(<ExamScreen />);
    await fireEvent.press(await screen.findByTestId("exam-delete"));
    expect(await screen.findByText("Delete exam?")).toBeOnTheScreen();
    expect(calls("DELETE", "/exams/x1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("exam-delete-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/exams/x1")).toHaveLength(1));
    await settled();
    expect(mockBack).toHaveBeenCalled();
  });

  it("does not offer to delete an exam with scores", async () => {
    serve({
      "GET /exams/x1/results": {
        exam: exam({ gradedCount: 1 }),
        rows: [row({ score: 80, passed: true })],
      },
    });
    await show(<ExamScreen />);
    expect(await screen.findByTestId("exam-edit")).toBeOnTheScreen();
    expect(screen.queryByTestId("exam-delete")).toBeNull();
  });

  it("only shows the scores to someone who may not grade", async () => {
    mockPermissions = ["exams.view"];
    serve({
      "GET /exams/x1/results": {
        exam: exam({ gradedCount: 1 }),
        rows: [row({ score: 80, passed: true, comment: "Well done" }), ROWS[1]],
      },
    });
    await show(<ExamScreen />);
    const first = await screen.findByTestId("exam-row-s1");
    expect(first).toHaveTextContent(/80\/100/);
    expect(first).toHaveTextContent(/Passed/);
    expect(first).toHaveTextContent(/Well done/);
    expect(screen.queryByTestId("exam-score-s1")).toBeNull();
    expect(screen.queryByTestId("exam-edit")).toBeNull();
    expect(screen.queryByTestId("exam-save-results")).toBeNull();
  });
});

describe("a mock exam's registrations", () => {
  // The page is opened by the address the test's router gives: x1.
  const SAT: Exam = { ...MOCK, id: "x1" };
  const registered = [row({ groupName: "IELTS 6.5" })];

  it("finds a student by name and registers them", async () => {
    const both = [...registered, row({ studentId: "s5", fullName: "Jasur Olimov" })];
    serve({
      "GET /exams/x1/results": { exam: SAT, rows: registered },
      "GET /exams/x1/candidates": [
        { id: "s5", fullName: "Jasur Olimov", phone: "+998907654321", groupName: "IELTS 6.5" },
      ],
      "POST /exams/x1/registrations": both,
    });
    await show(<ExamScreen />);
    expect(await screen.findByTestId("exam-capacity-fact")).toHaveTextContent(/1 of 2/);
    await fireEvent.changeText(screen.getByTestId("exam-register-search"), "j");
    await fireEvent.changeText(screen.getByTestId("exam-register-search"), "jas");
    await fireEvent.press(await screen.findByTestId("exam-candidate-s5"));
    await waitFor(() => expect(calls("POST", "/exams/x1/registrations")).toHaveLength(1));
    expect(sentBody(calls("POST", "/exams/x1/registrations")[0]![1])).toEqual({ studentId: "s5" });
    // One letter is not searched for.
    expect(calls("GET", "/exams/x1/candidates")).toHaveLength(1);
    expect(calls("GET", "/exams/x1/candidates")[0]![0]).toContain("q=jas");
    expect(await screen.findByTestId("exam-row-s5")).toHaveTextContent(/Jasur Olimov/);
    // Both seats are taken now: no more searching.
    expect(await screen.findByTestId("exam-full")).toHaveTextContent("Capacity reached.");
    expect(screen.queryByTestId("exam-register-search")).toBeNull();
  });

  it("says why a registration was refused", async () => {
    serve({
      "GET /exams/x1/results": { exam: SAT, rows: registered },
      "GET /exams/x1/candidates": [
        { id: "s5", fullName: "Jasur Olimov", phone: null, groupName: "IELTS 6.5" },
      ],
      "POST /exams/x1/registrations": () =>
        answer(409, { error: { code: "CONFLICT", message: "errors.examFull" } }),
    });
    await show(<ExamScreen />);
    await fireEvent.changeText(await screen.findByTestId("exam-register-search"), "jas");
    await fireEvent.press(await screen.findByTestId("exam-candidate-s5"));
    expect(await screen.findByTestId("exam-register-problem")).toBeOnTheScreen();
  });

  it("takes a registration off after a question", async () => {
    serve({
      "GET /exams/x1/results": { exam: SAT, rows: registered },
      "DELETE /exams/x1/registrations": undefined,
    });
    await show(<ExamScreen />);
    await fireEvent.press(await screen.findByTestId("exam-leave-s1"));
    expect(calls("DELETE", "/exams/x1/registrations")).toHaveLength(0);
    await fireEvent.press(await screen.findByTestId("exam-unregister-confirm"));
    await waitFor(() => expect(calls("DELETE", "/exams/x1/registrations")).toHaveLength(1));
    expect(calls("DELETE", "/exams/x1/registrations")[0]![0]).toContain("studentId=s1");
  });

  it("has no registration for a group's exam", async () => {
    serve({ "GET /exams/x1/results": { exam: exam(), rows: ROWS } });
    await show(<ExamScreen />);
    expect(await screen.findByTestId("exam-sheet")).toBeOnTheScreen();
    expect(screen.queryByTestId("exam-register")).toBeNull();
    expect(screen.queryByTestId("exam-leave-s1")).toBeNull();
  });
});

describe("the site's exam addresses", () => {
  it("open in the app", () => {
    expect(nativeRoute("/exams")).toBe("/staff/exams");
    expect(nativeRoute("/exams/x1")).toEqual({
      pathname: "/staff/exam/[id]",
      params: { id: "x1" },
    });
    expect(nativeRoute("/exams?type=MOCK")).toBeNull();
  });
});
