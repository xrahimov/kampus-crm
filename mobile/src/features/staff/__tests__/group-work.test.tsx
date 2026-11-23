import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";

import type {
  GroupGradebook,
  GroupHomework,
  GroupHomeworkTask,
  GroupNote,
  HomeworkAnswerRow,
  StreamPost,
} from "@/api/types";
import { GroupGradebookScreen } from "@/features/staff/group-gradebook-screen";
import { GroupHomeworkScreen } from "@/features/staff/group-homework-screen";
import { GroupNotesScreen } from "@/features/staff/group-notes-screen";
import { GroupStreamScreen } from "@/features/staff/group-stream-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "g1" }),
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/session", () => ({
  useMe: () => ({ permissions: mockPermissions }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * The rest of a teacher's group in the app (A-217): homework set from the
 * phone and checked under its task, the class stream, the gradebook and the
 * notes. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const GROUP = { id: "g1", name: "GE-Morning A1", status: "ACTIVE" };

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockPermissions = ["groups.view", "groups.attendance.mark"];
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

function row(change: Partial<HomeworkAnswerRow>): HomeworkAnswerRow {
  return {
    membershipId: "ms1",
    studentId: "s1",
    fullName: "Demo Student One",
    status: null,
    note: null,
    attachmentUrl: null,
    submittedAt: null,
    teacherComment: null,
    teacherAudioUrl: null,
    checkedByName: null,
    rubricScores: null,
    score: null,
    ...change,
  };
}

function task(change: Partial<GroupHomeworkTask>): GroupHomeworkTask {
  return {
    id: "h1",
    lessonId: "l1",
    lessonDate: "2026-11-21",
    lessonTopic: "Present perfect",
    title: null,
    rubric: [],
    maxScore: null,
    text: "Exercise 4 on page 31",
    linkUrl: null,
    attachmentUrl: null,
    dueDate: null,
    speaking: false,
    createdByName: "Demo Teacher",
    createdAt: "2026-11-21T08:00:00.000Z",
    submissions: [row({}), row({ membershipId: "ms2", fullName: "Demo Student Two" })],
    ...change,
  };
}

function homework(items: GroupHomeworkTask[]): GroupHomework {
  return {
    items,
    lessons: [
      { id: "l2", date: "2026-11-23", topic: "Past simple", hasHomework: false },
      { id: "l1", date: "2026-11-21", topic: "Present perfect", hasHomework: true },
    ],
    today: "2026-11-23",
  };
}

describe("a group's homework on the teacher's side", () => {
  it("shows each task with who answered and what waits", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/homework": homework([
        task({
          dueDate: "2026-11-25",
          submissions: [
            row({ status: "SUBMITTED", note: "Done", submittedAt: "2026-11-22T10:00:00.000Z" }),
            row({ membershipId: "ms2", fullName: "Demo Student Two", status: "ACCEPTED" }),
            row({ membershipId: "ms3", fullName: "Demo Student Three" }),
          ],
        }),
      ]),
    });
    await renderScreen(<GroupHomeworkScreen />);
    expect(await screen.findByTestId("task-h1")).toBeTruthy();
    expect(screen.getByTestId("task-progress")).toHaveTextContent("2 of 3 answered, 1 accepted");
    expect(screen.getByTestId("task-waiting")).toHaveTextContent("1 to check");
    expect(screen.getByTestId("task-due")).toHaveTextContent("Due Nov 25");

    // The answers open under the task; the waiting one can be checked right there.
    await fireEvent.press(screen.getByTestId("task-answers"));
    expect(screen.getByTestId("task-row-ms3")).toHaveTextContent(/No answer/);
    expect(screen.getByTestId("answer-h1-ms1")).toBeTruthy();
  });

  it("sets homework for a lesson with a file from the phone and a due day", async () => {
    const saved = task({
      id: "h2",
      lessonId: "l2",
      lessonDate: "2026-11-23",
      text: "Write six sentences",
      attachmentUrl: "/api/v1/files/documents/sheet.pdf",
      dueDate: "2026-11-25",
    });
    const stored: GroupHomeworkTask[] = [];
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/homework": () => answer(200, homework(stored)),
      "POST /uploads/documents": () =>
        answer(201, { key: "documents/sheet.pdf", url: "/api/v1/files/documents/sheet.pdf" }),
      "PUT /lessons/l2/homework": () => {
        stored.push(saved);
        return answer(200, saved);
      },
    });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: "file:///docs/sheet.pdf", name: "sheet.pdf", mimeType: "application/pdf", size: 9 },
      ],
    });
    await renderScreen(<GroupHomeworkScreen />);
    await fireEvent.press(await screen.findByTestId("task-for-l2"));
    expect(screen.getByTestId("task-target")).toHaveTextContent("Lesson of Nov 23");

    // Nothing is sent without the words of the task.
    await fireEvent.press(screen.getByTestId("task-save"));
    expect(calls("PUT", "/lessons/l2/homework")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("task-text"), " Write six sentences ");
    await fireEvent.press(screen.getByTestId("task-file-choose-file"));
    expect(await screen.findByTestId("task-file-name")).toHaveTextContent("Attached: sheet.pdf");
    await fireEvent.press(screen.getByTestId("task-due-2026-11-25"));
    await fireEvent.press(screen.getByTestId("task-save"));

    await waitFor(() => expect(calls("PUT", "/lessons/l2/homework")).toHaveLength(1));
    expect(calls("POST", "/uploads/documents")).toHaveLength(1);
    expect(sentBody(calls("PUT", "/lessons/l2/homework")[0]![1])).toEqual({
      text: "Write six sentences",
      linkUrl: null,
      attachmentUrl: "/api/v1/files/documents/sheet.pdf",
      dueDate: "2026-11-25",
      speaking: false,
    });
    // The form closes and the task is on the list.
    expect(await screen.findByTestId("task-h2")).toBeTruthy();
    expect(screen.queryByTestId("task-form")).toBeNull();
  });

  it("starts an assignment with a name, and changes one without losing its rubric or file", async () => {
    const essay = task({
      id: "h3",
      lessonId: null,
      lessonDate: null,
      lessonTopic: null,
      title: "Essay: my town",
      rubric: [
        { name: "Grammar", max: 5 },
        { name: "Ideas", max: 5 },
      ],
      maxScore: 10,
      text: "250 words",
      attachmentUrl: "/api/v1/files/documents/plan.pdf",
      speaking: true,
    });
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/homework": homework([essay]),
      "POST /groups/g1/homework": task({ id: "h4", lessonId: null, title: "Project" }),
      "PUT /homework/h3": { ...essay, text: "300 words" },
    });
    await renderScreen(<GroupHomeworkScreen />);

    await fireEvent.press(await screen.findByTestId("task-for-assignment"));
    await fireEvent.changeText(screen.getByTestId("task-text"), "A poster");
    // An assignment needs its name.
    await fireEvent.press(screen.getByTestId("task-save"));
    expect(calls("POST", "/groups/g1/homework")).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId("task-title"), "Project");
    await fireEvent.press(screen.getByTestId("task-save"));
    await waitFor(() => expect(calls("POST", "/groups/g1/homework")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups/g1/homework")[0]![1])).toEqual({
      text: "A poster",
      linkUrl: null,
      attachmentUrl: null,
      dueDate: null,
      speaking: false,
      title: "Project",
      rubric: [],
    });
    await settle();

    await fireEvent.press(screen.getAllByTestId("task-edit").at(-1)!);
    expect(screen.getByTestId("task-title").props.value).toBe("Essay: my town");
    await fireEvent.changeText(screen.getByTestId("task-text"), "300 words");
    await fireEvent.press(screen.getByTestId("task-save"));
    await waitFor(() => expect(calls("PUT", "/homework/h3")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/homework/h3")[0]![1])).toEqual({
      text: "300 words",
      linkUrl: null,
      attachmentUrl: "/api/v1/files/documents/plan.pdf",
      dueDate: null,
      speaking: true,
      title: "Essay: my town",
      rubric: [
        { name: "Grammar", max: 5 },
        { name: "Ideas", max: 5 },
      ],
    });
  });

  it("deletes a task only after a second press", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/homework": homework([task({})]),
      "DELETE /homework/h1": undefined,
    });
    await renderScreen(<GroupHomeworkScreen />);
    await fireEvent.press(await screen.findByTestId("task-delete"));
    expect(calls("DELETE", "/homework/h1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("task-delete-yes"));
    await waitFor(() => expect(calls("DELETE", "/homework/h1")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("task-delete-confirm")).toBeNull());
  });

  it("gives the points of an assignment's rubric before accepting", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/homework": homework([
        task({
          id: "h3",
          lessonId: null,
          lessonDate: null,
          title: "Essay: my town",
          rubric: [
            { name: "Grammar", max: 2 },
            { name: "Ideas", max: 5 },
          ],
          maxScore: 7,
          submissions: [
            row({ status: "SUBMITTED", note: "Here", submittedAt: "2026-11-22T10:00:00.000Z" }),
          ],
        }),
      ]),
      "PATCH /homework/h3/submissions/ms1": undefined,
    });
    await renderScreen(<GroupHomeworkScreen />);
    await fireEvent.press(await screen.findByTestId("task-answers"));

    // The first press asks for the points; nothing is sent yet.
    await fireEvent.press(screen.getByTestId("accept"));
    expect(calls("PATCH", "/homework/h3/submissions/ms1")).toHaveLength(0);
    expect(screen.getByTestId("rubric-total")).toHaveTextContent("Score: 0 of 7");
    await fireEvent.press(screen.getByTestId("rubric-0-plus"));
    await fireEvent.press(screen.getByTestId("rubric-0-plus"));
    // A criterion never goes over what it is worth.
    await fireEvent.press(screen.getByTestId("rubric-0-plus"));
    await fireEvent.press(screen.getByTestId("rubric-1-plus"));
    expect(screen.getByTestId("rubric-total")).toHaveTextContent("Score: 3 of 7");
    // Presses faster than the screen redraws all count.
    const plus = screen.getByTestId("rubric-1-plus");
    await act(async () => {
      // The button's own handler, three times before React draws again.
      for (let press = 0; press < 3; press += 1) plus.props.onClick({});
    });
    expect(screen.getByTestId("rubric-total")).toHaveTextContent("Score: 6 of 7");
    await fireEvent.press(screen.getByTestId("rubric-1-minus"));
    await fireEvent.press(screen.getByTestId("rubric-1-minus"));
    await fireEvent.press(screen.getByTestId("rubric-1-minus"));
    expect(screen.getByTestId("rubric-total")).toHaveTextContent("Score: 3 of 7");

    await fireEvent.press(screen.getByTestId("accept"));
    await waitFor(() => expect(calls("PATCH", "/homework/h3/submissions/ms1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/homework/h3/submissions/ms1")[0]![1])).toEqual({
      status: "ACCEPTED",
      teacherComment: null,
      rubricScores: [2, 1],
    });
  });

  it("offers nothing to change to someone who may only look", async () => {
    mockPermissions = ["groups.view"];
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/homework": homework([task({})]) });
    await renderScreen(<GroupHomeworkScreen />);
    expect(await screen.findByTestId("task-h1")).toBeTruthy();
    expect(screen.queryByTestId("task-set")).toBeNull();
    expect(screen.queryByTestId("task-edit")).toBeNull();
  });
});

describe("a group's stream on the teacher's side", () => {
  const post = (change: Partial<StreamPost>): StreamPost => ({
    id: "p1",
    body: "Bring your workbooks on Monday",
    attachmentUrl: null,
    pinned: false,
    locked: false,
    author: "Demo Teacher",
    createdAt: "2026-11-22T09:00:00.000Z",
    comments: [
      {
        id: "c1",
        body: "OK!",
        author: "Demo Student One",
        byStaff: false,
        mine: false,
        createdAt: "2026-11-22T09:30:00.000Z",
      },
    ],
    ...change,
  });

  it("posts to the group, pinned, and puts the post on top", async () => {
    const stored = [post({})];
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/stream": () => answer(200, stored),
      "POST /groups/g1/stream": () => {
        stored.unshift(post({ id: "p2", body: "No lesson on Friday", pinned: true }));
        return answer(201, stored[0]);
      },
    });
    await renderScreen(<GroupStreamScreen />);
    expect(await screen.findByTestId("post-p1")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("post-new-body"), " No lesson on Friday ");
    await fireEvent.press(screen.getByTestId("post-new-pin"));
    await fireEvent.press(screen.getByTestId("post-new-send"));
    await waitFor(() => expect(calls("POST", "/groups/g1/stream")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups/g1/stream")[0]![1])).toEqual({
      body: "No lesson on Friday",
      attachmentUrl: null,
      pinned: true,
    });
    expect(await screen.findByTestId("post-p2")).toBeTruthy();
    expect(screen.getByTestId("post-new-body").props.value).toBe("");
  });

  it("pins, closes comments, answers and removes a comment", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/stream": [post({})],
      "PUT /stream/p1": (init?: RequestInit) => {
        const sent = sentBody(init) as { pinned?: boolean; locked?: boolean };
        return answer(200, post({ pinned: sent.pinned ?? false, locked: sent.locked ?? false }));
      },
      "POST /stream/p1/comments": post({
        comments: [
          ...post({}).comments,
          {
            id: "c2",
            body: "See you then",
            author: "Demo Teacher",
            byStaff: true,
            mine: false,
            createdAt: "2026-11-22T10:00:00.000Z",
          },
        ],
      }),
      "DELETE /stream/comments/c1": undefined,
    });
    await renderScreen(<GroupStreamScreen />);

    await fireEvent.changeText(await screen.findByTestId("post-comment-input"), "See you then");
    await fireEvent.press(screen.getByTestId("post-comment-send"));
    await waitFor(() => expect(calls("POST", "/stream/p1/comments")).toHaveLength(1));
    expect(sentBody(calls("POST", "/stream/p1/comments")[0]![1])).toEqual({ body: "See you then" });
    await waitFor(() => expect(screen.getAllByTestId("post-comment")).toHaveLength(2));

    // A teacher takes away any comment, also a student's.
    await fireEvent.press(screen.getAllByTestId("post-comment-delete")[0]!);
    await waitFor(() => expect(calls("DELETE", "/stream/comments/c1")).toHaveLength(1));
    await waitFor(() => expect(screen.getAllByTestId("post-comment")).toHaveLength(1));

    await fireEvent.press(screen.getByTestId("post-pin-p1"));
    await waitFor(() => expect(calls("PUT", "/stream/p1")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/stream/p1")[0]![1])).toEqual({
      body: "Bring your workbooks on Monday",
      pinned: true,
    });
    await fireEvent.press(await screen.findByTestId("post-lock-p1"));
    await waitFor(() => expect(calls("PUT", "/stream/p1")).toHaveLength(2));
    expect(sentBody(calls("PUT", "/stream/p1")[1]![1])).toEqual({
      body: "Bring your workbooks on Monday",
      locked: true,
    });
    expect(await screen.findByTestId("post-locked")).toBeTruthy();
  });

  it("deletes a post after asking, and shows no tools to someone who may only look", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/stream": [post({})],
      "DELETE /stream/p1": undefined,
    });
    await renderScreen(<GroupStreamScreen />);
    await fireEvent.press(await screen.findByTestId("post-delete-p1"));
    expect(calls("DELETE", "/stream/p1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("post-delete-yes"));
    await waitFor(() => expect(calls("DELETE", "/stream/p1")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("post-p1")).toBeNull());

    clearClients();
    mockPermissions = ["groups.view"];
    await renderScreen(<GroupStreamScreen />);
    await settle();
    expect(screen.queryByTestId("post-new")).toBeNull();
  });
});

describe("a group's gradebook and notes on the teacher's side", () => {
  it("shows each student's final grade, level and what it is made of", async () => {
    const book: GroupGradebook = {
      courseId: "c1",
      courseName: "General English",
      scaleName: "CEFR",
      students: [
        {
          membershipId: "ms1",
          studentId: "s1",
          fullName: "Demo Student One",
          status: "ACTIVE",
          final: 82,
          level: "B1",
          categories: [
            { key: "lessons", weight: 40, percent: 90, count: 6 },
            { key: "homework", weight: 30, percent: 70, count: 3 },
            { key: "exercises", weight: 0, percent: null, count: 0 },
            { key: "tests", weight: 30, percent: null, count: 0 },
            { key: "exams", weight: 0, percent: null, count: 0 },
          ],
        },
        {
          membershipId: "ms2",
          studentId: "s2",
          fullName: "Demo Student Two",
          status: "FROZEN",
          final: null,
          level: null,
          categories: [],
        },
      ],
    };
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/gradebook": book });
    await renderScreen(<GroupGradebookScreen />);
    const first = await screen.findByTestId("gradebook-ms1");
    expect(first).toHaveTextContent(/82%/);
    expect(first).toHaveTextContent(/B1/);
    expect(first).toHaveTextContent(/Homework/);
    // A category that weighs nothing is left out.
    expect(first).not.toHaveTextContent(/Exams/);
    expect(screen.getByTestId("gradebook-scale")).toHaveTextContent("Scale: CEFR.");
    expect(screen.getByTestId("gradebook-ms2")).toHaveTextContent(/–/);
  });

  it("adds a note when the person may change the group, and only lists them otherwise", async () => {
    const notes: GroupNote[] = [
      {
        id: "n1",
        text: "Moved to room 3",
        authorName: "Demo Admin",
        createdAt: "2026-11-20T08:00:00.000Z",
      },
    ];
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/notes": notes,
      "POST /groups/g1/notes": {
        id: "n2",
        text: "Two students join in December",
        authorName: "Demo Teacher",
        createdAt: "2026-11-23T08:00:00.000Z",
      },
    });
    await renderScreen(<GroupNotesScreen />);
    expect(await screen.findByTestId("note-n1")).toBeTruthy();
    expect(screen.queryByTestId("note-new")).toBeNull();

    clearClients();
    mockPermissions = ["groups.view", "groups.update"];
    await renderScreen(<GroupNotesScreen />);
    await fireEvent.changeText(
      await screen.findByTestId("note-text"),
      "Two students join in December",
    );
    await fireEvent.press(screen.getByTestId("note-add"));
    await waitFor(() => expect(calls("POST", "/groups/g1/notes")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups/g1/notes")[0]![1])).toEqual({
      text: "Two students join in December",
    });
    expect(await screen.findByTestId("note-n2")).toBeTruthy();
  });
});
