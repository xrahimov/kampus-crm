import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import type {
  CourseProgress,
  Portal,
  PortalAnnouncement,
  PortalBadge,
  PortalCourse,
  PortalGradebook,
  PortalLesson,
  PortalVocab,
  StreamPost,
} from "@/api/types";
import { ClassScreen } from "@/features/student/class-screen";
import { CourseScreen } from "@/features/student/course-screen";
import { NewsScreen } from "@/features/student/news-screen";
import { ResultsScreen } from "@/features/student/results-screen";
import { StreamScreen } from "@/features/student/stream-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
const mockPush = jest.fn();
jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      canGoBack: () => true,
      replace: jest.fn(),
    }),
    useLocalSearchParams: () => ({ token: "tok" }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});

/*
 * The rest of a group's pages on the student's side (A-215): news, the class
 * stream, the course with its flashcards, results, and rating a lesson. Each
 * test plays the server and reads what the app shows and what it sends back.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const BASE = "/public/class/tok";

function lesson(change: Partial<PortalLesson>): PortalLesson {
  return {
    id: "l1",
    date: "2026-11-21",
    startTime: "09:00",
    endTime: "10:30",
    topic: "Present perfect",
    attendance: "PRESENT",
    grade: 5,
    gradeComment: null,
    studentNote: null,
    rating: null,
    canRate: true,
    ...change,
  };
}

function portal(change: Partial<Portal> = {}): { portal: Portal } {
  return {
    portal: {
      student: { fullName: "Demo Student One", coins: 12 },
      group: {
        name: "GE-Morning A1",
        courseName: "General English",
        teachers: ["Demo Teacher"],
        endDate: "2027-03-01",
      },
      nextLesson: null,
      lessons: [],
      stats: { lessonsHeld: 3, attendancePercent: 100, gradeAverage: 4.5 },
      money: { monthlyPrice: 500000, balance: 0, nextPaymentDate: null, payments: [] },
      packages: null,
      exams: [],
      tests: [],
      ...change,
    },
  };
}

/** Plays the server: each address ending answers with what the test set for it. */
function serve(answers: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url, init) => {
    const path = url.split("?")[0]!;
    const method = init?.method ?? "GET";
    for (const [key, body] of Object.entries(answers)) {
      const [verb, tail] = key.includes(" ") ? key.split(" ") : ["GET", key];
      if (verb === method && path.endsWith(tail!)) {
        return answer(200, typeof body === "function" ? body(sentBody(init)) : body);
      }
    }
    return answer(404, { error: { code: "NOT_FOUND" } });
  });
}

/** Requests the app made with this method to an address ending in `tail`. */
function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

/** Lets what the cache was just told reach the screen before a test ends. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

describe("the centre's news in the app", () => {
  const news: PortalAnnouncement[] = [
    {
      id: "n1",
      title: "No lessons on Friday",
      body: "The centre is closed for the holiday.",
      from: "Demo centre",
      createdAt: "2026-11-22T08:00:00.000Z",
      read: false,
    },
    {
      id: "n2",
      title: "New timetable",
      body: "Lessons start at nine from December.",
      from: "GE-Morning A1",
      createdAt: "2026-11-20T08:00:00.000Z",
      read: true,
    },
  ];

  it("lists the notices, marks the new one and tells the server it was read", async () => {
    serve({ "/portal": portal(), "/announcements": news, "POST /announcements": { ok: true } });
    await renderScreen(<NewsScreen />);
    const fresh = await screen.findByTestId("news-n1");
    expect(within(fresh).getByText("No lessons on Friday")).toBeTruthy();
    expect(within(fresh).getByText("New")).toBeTruthy();
    expect(within(fresh).getByText(/From Demo centre/)).toBeTruthy();
    expect(within(screen.getByTestId("news-n2")).queryByText("New")).toBeNull();
    await waitFor(() => expect(calls("POST", "/announcements")).toHaveLength(1));
    expect(sentBody(calls("POST", "/announcements")[0]![1])).toEqual({ ids: ["n1"] });
  });

  it("sends nothing when every notice was read, and says so when there are none", async () => {
    serve({ "/portal": portal(), "/announcements": [] });
    await renderScreen(<NewsScreen />);
    expect(await screen.findByText("No news yet.")).toBeTruthy();
    await settle();
    expect(calls("POST", "/announcements")).toHaveLength(0);
  });
});

describe("the class stream in the app", () => {
  const post = (change: Partial<StreamPost>): StreamPost => ({
    id: "p1",
    body: "Bring your workbook on Monday.",
    attachmentUrl: null,
    pinned: false,
    locked: false,
    author: "Demo Teacher",
    createdAt: "2026-11-22T08:00:00.000Z",
    comments: [],
    ...change,
  });
  const mine = {
    id: "c2",
    body: "I will.",
    author: "Demo Student One",
    byStaff: false,
    mine: true,
    createdAt: "2026-11-22T09:00:00.000Z",
  };

  it("shows a post with its comments and adds the student's own", async () => {
    const first = post({
      pinned: true,
      attachmentUrl: `/api/v1${BASE}/files/documents/list.pdf`,
      comments: [{ ...mine, id: "c1", body: "Which pages?", author: "Aziza", mine: false }],
    });
    serve({
      "/portal": portal(),
      "/stream": [first],
      "POST /stream/p1/comments": { ...first, comments: [...first.comments, mine] },
    });
    await renderScreen(<StreamScreen />);
    const card = await screen.findByTestId("post-p1");
    expect(within(card).getByText("Bring your workbook on Monday.")).toBeTruthy();
    expect(within(card).getByTestId("post-pinned")).toBeTruthy();
    expect(within(card).getByText("Which pages?")).toBeTruthy();
    expect(within(card).queryByTestId("post-comment-delete")).toBeNull();

    await fireEvent.press(within(card).getByTestId("post-file"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/file",
      params: { url: `/api/v1${BASE}/files/documents/list.pdf`, title: "File" },
    });

    // An empty comment goes nowhere.
    await fireEvent.press(within(card).getByTestId("post-comment-send"));
    expect(calls("POST", "/stream/p1/comments")).toHaveLength(0);
    await fireEvent.changeText(within(card).getByTestId("post-comment-input"), "  I will.  ");
    await fireEvent.press(within(card).getByTestId("post-comment-send"));
    expect(await screen.findByText("I will.")).toBeTruthy();
    expect(sentBody(calls("POST", "/stream/p1/comments")[0]![1])).toEqual({ body: "I will." });
    expect(screen.getByTestId("post-comment-input").props.value).toBe("");
  });

  it("takes back the student's own comment and takes none on a closed post", async () => {
    const open = post({ comments: [mine] });
    const closed = post({ id: "p2", body: "Results are out.", locked: true });
    serve({
      "/portal": portal(),
      "/stream": [open, closed],
      "DELETE /stream/comments/c2": { ...open, comments: [] },
    });
    await renderScreen(<StreamScreen />);
    const shut = await screen.findByTestId("post-p2");
    expect(within(shut).getByTestId("post-locked")).toBeTruthy();
    expect(within(shut).queryByTestId("post-comment-input")).toBeNull();

    await fireEvent.press(screen.getByTestId("post-comment-delete"));
    await waitFor(() => expect(screen.queryByText("I will.")).toBeNull());
    expect(calls("DELETE", "/stream/comments/c2")).toHaveLength(1);
  });
});

describe("the course in the app", () => {
  const course: PortalCourse = {
    courseName: "General English",
    total: 3,
    open: 2,
    topics: [
      {
        id: "t1",
        sortOrder: 1,
        title: "Greetings",
        open: true,
        blocks: [
          { id: "b1", kind: "TEXT", title: "Read this", body: "Hello.\n\nGoodbye.", url: null },
          {
            id: "b2",
            kind: "FILE",
            title: "Word list",
            body: null,
            url: `/api/v1${BASE}/files/documents/words.pdf`,
          },
        ],
        coveredOn: "2026-11-17",
        opensOn: null,
        exercises: [{ id: "e1", title: "Greetings quiz", itemCount: 5, attempts: 0, best: null }],
      },
      {
        id: "t2",
        sortOrder: 2,
        title: "Numbers",
        open: true,
        blocks: [{ id: "b3", kind: "TEXT", title: "Count", body: "One, two.", url: null }],
        coveredOn: null,
        opensOn: null,
        exercises: [],
      },
      {
        id: "t3",
        sortOrder: 3,
        title: "Family",
        open: false,
        blocks: [],
        coveredOn: null,
        opensOn: "2026-12-01",
        exercises: [],
      },
    ],
  };
  const progress: CourseProgress = {
    percent: 33,
    topicsTotal: 3,
    topicsComplete: 1,
    exercisesTotal: 1,
    exercisesDone: 0,
    scorePercent: null,
    attendancePercent: 100,
    topics: [
      { topicId: "t1", exercisesTotal: 1, exercisesDone: 0, complete: false },
      { topicId: "t2", exercisesTotal: 0, exercisesDone: 0, complete: true },
    ],
  };
  const noWords: PortalVocab = { total: 0, learned: 0, due: 0, streak: 0, cards: [] };

  it("shows the progress and the topics, the first one unfolded", async () => {
    serve({ "/portal": portal(), "/course": course, "/progress": progress, "/vocab": noWords });
    await renderScreen(<CourseScreen />);
    expect(await screen.findByTestId("course-progress-percent")).toHaveTextContent(
      "33% of the course complete",
    );
    expect(screen.getByTestId("course-open-count")).toHaveTextContent(
      "General English: 2 of 3 topics open",
    );
    expect(screen.queryByTestId("vocab")).toBeNull();
    const first = screen.getByTestId("topic-content-t1");
    expect(within(first).getByText("Hello.")).toBeTruthy();
    expect(within(first).getByText("Goodbye.")).toBeTruthy();
    expect(screen.queryByTestId("topic-content-t2")).toBeNull();
    // A locked topic says when it opens and cannot be unfolded.
    expect(within(screen.getByTestId("topic-t3")).getByText(/Opens on/)).toBeTruthy();
    expect(screen.queryByTestId("topic-toggle-t3")).toBeNull();

    await fireEvent.press(screen.getByTestId("block-open-b2"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/file",
      params: { url: `/api/v1${BASE}/files/documents/words.pdf`, title: "Word list" },
    });
    await fireEvent.press(screen.getByTestId("topic-exercise-e1"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/student/exercise/[token]",
      params: { token: "tok", exercise: "e1", title: "Greetings quiz" },
    });

    await fireEvent.press(screen.getByTestId("topic-toggle-t2"));
    expect(screen.getByTestId("topic-content-t2")).toBeTruthy();
    expect(screen.queryByTestId("topic-content-t1")).toBeNull();
  });

  it("says so when the course has no topics", async () => {
    serve({
      "/portal": portal(),
      "/course": { ...course, total: 0, open: 0, topics: [] },
      "/progress": { ...progress, percent: null, topicsTotal: 0, topics: [] },
      "/vocab": noWords,
    });
    await renderScreen(<CourseScreen />);
    expect(await screen.findByText("The course has no topics yet.")).toBeTruthy();
    expect(screen.queryByTestId("course-progress")).toBeNull();
  });

  it("runs the flashcards: a missed word comes back, a known one is done", async () => {
    const words: PortalVocab = {
      total: 10,
      learned: 4,
      due: 2,
      streak: 3,
      cards: [
        { id: "w1", term: "der Hund", translation: "dog", example: null, topicTitle: "Animals" },
        {
          id: "w2",
          term: "die Katze",
          translation: "cat",
          example: "Die Katze schläft.",
          topicTitle: "Animals",
        },
      ],
    };
    let left = 2;
    serve({
      "/portal": portal(),
      "/course": course,
      "/progress": progress,
      "/vocab": words,
      "POST /vocab/w1": (body: { known: boolean }) => {
        if (body.known) left -= 1;
        return { ...words, due: left, learned: 4 + (2 - left), cards: [] };
      },
      "POST /vocab/w2": (body: { known: boolean }) => {
        if (body.known) left -= 1;
        return { ...words, due: left, learned: 4 + (2 - left), cards: [] };
      },
    });
    await renderScreen(<CourseScreen />);
    expect(await screen.findByTestId("vocab-learned")).toHaveTextContent("4 of 10 learned");
    expect(screen.getByTestId("vocab-due")).toHaveTextContent("2 to review");
    expect(screen.getByTestId("vocab-streak")).toHaveTextContent("3 days in a row");

    await fireEvent.press(screen.getByTestId("vocab-start"));
    expect(screen.getByTestId("vocab-term")).toHaveTextContent("der Hund");
    // The answer buttons wait for the card to be turned.
    expect(screen.queryByTestId("vocab-known")).toBeNull();
    await fireEvent.press(screen.getByTestId("vocab-flip"));
    expect(screen.getByTestId("vocab-translation")).toHaveTextContent(/dog/);

    await fireEvent.press(screen.getByTestId("vocab-again"));
    await waitFor(() => expect(screen.getByTestId("vocab-term")).toHaveTextContent("die Katze"));
    expect(sentBody(calls("POST", "/vocab/w1")[0]![1])).toEqual({ known: false });

    await fireEvent.press(screen.getByTestId("vocab-flip"));
    expect(screen.getByTestId("vocab-translation")).toHaveTextContent(/Die Katze schläft\./);
    await fireEvent.press(screen.getByTestId("vocab-known"));
    // The missed word is asked again before the run ends.
    await waitFor(() => expect(screen.getByTestId("vocab-term")).toHaveTextContent("der Hund"));
    await fireEvent.press(screen.getByTestId("vocab-flip"));
    await fireEvent.press(screen.getByTestId("vocab-known"));

    expect(await screen.findByTestId("vocab-done")).toHaveTextContent(/2 cards right this run/);
    expect(screen.getByTestId("vocab-learned")).toHaveTextContent("6 of 10 learned");
    expect(calls("POST", "/vocab/w1")).toHaveLength(2);
  });
});

describe("the student's results in the app", () => {
  const gradebook: PortalGradebook = {
    courseName: "General English",
    categories: [
      { key: "lessons", weight: 40, percent: 90 },
      { key: "homework", weight: 30, percent: null },
      { key: "exercises", weight: 0, percent: 70 },
      { key: "tests", weight: 30, percent: 80 },
      { key: "exams", weight: 0, percent: null },
    ],
    final: 86,
    level: "B",
  };
  const badges: PortalBadge[] = [
    { code: "firstHomework", earnedAt: "2026-11-10T08:00:00.000Z", groupName: "GE-Morning A1" },
    { code: "homework10", earnedAt: null, groupName: null },
    { code: "perfectMonth", earnedAt: null, groupName: null },
  ];

  it("shows the grade part by part, the badges, exams and tests taken", async () => {
    serve({
      "/portal": portal({
        exams: [
          {
            id: "x1",
            name: "Mid-course exam",
            date: "2026-11-14",
            score: 42,
            maxScore: 50,
            passed: true,
            level: "A2",
            isPresent: true,
          },
          {
            id: "x2",
            name: "Mock exam",
            date: "2026-11-07",
            score: null,
            maxScore: 50,
            passed: null,
            level: null,
            isPresent: false,
          },
        ],
        tests: [
          {
            id: "r1",
            testName: "Unit 2 test",
            subject: "Grammar",
            score: 8,
            maxScore: 10,
            percent: 80,
            submittedAt: "2026-11-18T08:00:00.000Z",
          },
        ],
      }),
      "/gradebook": gradebook,
      "/badges": badges,
    });
    await renderScreen(<ResultsScreen />);
    expect(await screen.findByTestId("gradebook-final")).toHaveTextContent("86%");
    expect(within(screen.getByTestId("gradebook")).getByText("B")).toBeTruthy();
    expect(screen.getByTestId("gradebook-lessons")).toHaveTextContent(/40% of the grade.*90%/);
    // A part without results shows a dash; a part that weighs nothing is left out.
    expect(screen.getByTestId("gradebook-homework")).toHaveTextContent(/—/);
    expect(screen.queryByTestId("gradebook-exercises")).toBeNull();

    expect(await screen.findByTestId("badges-count")).toHaveTextContent("1 of 3 earned");
    expect(screen.getByTestId("badge-earned-firstHomework")).toHaveTextContent(/Earned/);
    expect(screen.getByTestId("badge-locked-homework10")).toHaveTextContent(
      /Ten accepted homeworks/,
    );

    expect(screen.getByTestId("exam-x1")).toHaveTextContent(/42 \/ 50.*Passed/);
    expect(screen.getByTestId("exam-x2")).toHaveTextContent(/Missed/);
    expect(screen.getByTestId("test-result-r1")).toHaveTextContent(/Unit 2 test.*8 \/ 10/);
  });

  it("says so when there is nothing yet", async () => {
    serve({
      "/portal": portal(),
      "/gradebook": { ...gradebook, final: null, level: null },
      "/badges": [],
    });
    await renderScreen(<ResultsScreen />);
    expect(await screen.findByTestId("gradebook-final")).toHaveTextContent("No grades yet");
    expect(screen.getByText("No exams yet.")).toBeTruthy();
    expect(screen.getByText("No tests yet.")).toBeTruthy();
  });
});

describe("a group's page in the app", () => {
  const rated = lesson({ id: "l2", date: "2026-11-19", rating: { rating: 4, comment: "Fast" } });
  const absent = lesson({ id: "l3", date: "2026-11-17", attendance: "ABSENT", canRate: false });

  it("lists the pages: the course once it has topics, news with what is unread", async () => {
    serve({
      "/portal": portal(),
      "/chat": { messages: [], unread: 0 },
      "/announcements": [
        {
          id: "n1",
          title: "A",
          body: "B",
          from: "C",
          createdAt: "2026-11-22T08:00:00Z",
          read: false,
        },
      ],
      "/course": { courseName: "General English", total: 0, open: 0, topics: [] },
    });
    await renderScreen(<ClassScreen />);
    expect(await screen.findByTestId("unread-news")).toHaveTextContent("1");
    expect(screen.queryByTestId("open-course")).toBeNull();
    expect(screen.queryByTestId("unread-chat")).toBeNull();
    for (const [row, pathname] of [
      ["stream", "/student/stream/[token]"],
      ["news", "/student/news/[token]"],
      ["results", "/student/results/[token]"],
    ] as const) {
      await fireEvent.press(screen.getByTestId(`open-${row}`));
      expect(mockPush).toHaveBeenLastCalledWith({ pathname, params: { token: "tok" } });
    }
  });

  it("opens the course when it has topics", async () => {
    serve({
      "/portal": portal(),
      "/chat": { messages: [], unread: 2 },
      "/announcements": [],
      "/course": { courseName: "General English", total: 3, open: 1, topics: [] },
    });
    await renderScreen(<ClassScreen />);
    await fireEvent.press(await screen.findByTestId("open-course"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/student/course/[token]",
      params: { token: "tok" },
    });
    expect(screen.getByTestId("unread-chat")).toHaveTextContent("2");
    expect(screen.queryByTestId("unread-news")).toBeNull();
  });

  it("rates a lesson with a tap on a star, then takes a line about it", async () => {
    serve({
      "/portal": portal({ lessons: [lesson({}), rated, absent] }),
      "/chat": { messages: [], unread: 0 },
      "/announcements": [],
      "/course": { courseName: "General English", total: 0, open: 0, topics: [] },
      "POST /lessons/l1/rating": (body: { rating: number; comment: string | null }) => body,
    });
    await renderScreen(<ClassScreen />);
    // A missed lesson is not rated; a rated one shows the stars and the line.
    expect(await screen.findByTestId("rating-l1")).toBeTruthy();
    expect(screen.queryByTestId("rating-l3")).toBeNull();
    expect(screen.getByTestId("rate-comment-text-l2")).toHaveTextContent("Fast");
    expect(screen.getByTestId("rate-l2-4")).toBeChecked();

    await fireEvent.press(screen.getByTestId("rate-l1-5"));
    await waitFor(() => expect(screen.getByTestId("rate-l1-5")).toBeChecked());
    expect(sentBody(calls("POST", "/lessons/l1/rating")[0]![1])).toEqual({
      rating: 5,
      comment: null,
    });

    await fireEvent.changeText(screen.getByTestId("rate-comment-l1"), " Clear examples ");
    await fireEvent.press(screen.getByTestId("rate-send-l1"));
    expect(await screen.findByTestId("rate-comment-text-l1")).toHaveTextContent("Clear examples");
    expect(sentBody(calls("POST", "/lessons/l1/rating")[1]![1])).toEqual({
      rating: 5,
      comment: "Clear examples",
    });
    expect(screen.queryByTestId("rate-comment-l1")).toBeNull();
  });
});
