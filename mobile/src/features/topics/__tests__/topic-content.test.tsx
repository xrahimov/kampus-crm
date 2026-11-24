import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";

import { GroupPlanScreen } from "@/features/staff/group-plan-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { ExerciseEditorScreen } from "@/features/topics/exercise-editor-screen";
import { HomeworkExercisesScreen } from "@/features/topics/homework-exercises-screen";
import { TopicContentScreen } from "@/features/topics/topic-content-screen";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = { id: "t1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    permissions: mockPermissions,
    branches: [{ id: "b1", name: "Chilonzor" }],
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
let mockWide = false;
jest.mock("@/lib/layout", () => ({
  useLayout: () => ({
    wide: mockWide,
    width: mockWide ? 1180 : 390,
    height: 820,
    columns: mockWide ? 2 : 1,
  }),
}));

/*
 * What a topic of a course plan carries for the students (A-263): the blocks
 * they read and watch, the self-check exercises (on a homework too) and the
 * words of the trainer, written in the app as on the site.
 */

const fetchMock = jest.fn<Promise<Response>, [url: string, init?: RequestInit]>();
const realFetch = globalThis.fetch;

type Routes = Record<string, unknown | ((url: string, init?: RequestInit) => unknown)>;
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
    const body =
      typeof route === "function"
        ? (route as (url: string, init?: RequestInit) => unknown)(url, init)
        : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}
function calls(method: string, tail: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}
const refused = () => answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } });
const disabled = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled === true;

const CONTENT = {
  topicId: "t1",
  title: "Greetings",
  courseId: "c1",
  courseName: "General English",
  canEdit: true,
  blocks: [
    {
      id: "b1",
      sortOrder: 1,
      kind: "TEXT",
      title: "Read this",
      body: "Hello and hi.",
      url: null,
      size: null,
    },
    {
      id: "b2",
      sortOrder: 2,
      kind: "LINK",
      title: "A song",
      body: null,
      url: "https://example.org/song",
      size: null,
    },
  ],
};
const NO_EXERCISES = { items: [], canEdit: true };
const NO_WORDS = { topicId: "t1", title: "Greetings", canEdit: true, words: [] };
const EXERCISE = {
  id: "e1",
  topicId: "t1",
  homeworkId: null,
  title: "Quick check",
  items: [
    { kind: "TRUE_FALSE", prompt: "Hi is a greeting.", correct: true },
    { kind: "SHORT", prompt: "Say hello in Uzbek.", answers: ["salom"] },
  ],
  maxScore: 2,
  attempted: 3,
  createdByName: "Dilnoza Karimova",
  updatedAt: "2026-11-20T10:00:00.000Z",
};

/** Everything the topic's page reads; a test changes what it is about. */
const PAGE: Routes = {
  "GET /topics/t1/content": CONTENT,
  "GET /exercises": NO_EXERCISES,
  "GET /topics/t1/words": NO_WORDS,
};

beforeEach(() => {
  mockPermissions = ["groups.view"];
  mockParams = { id: "t1" };
  mockWide = false;
  mockPush.mockReset();
  mockBack.mockReset();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

describe("a topic's content", () => {
  it("shows the blocks in order and saves the list after one moved and one left", async () => {
    serve({
      ...PAGE,
      "PUT /topics/t1/content": (_url: string, init?: RequestInit) => ({
        ...CONTENT,
        blocks: (sentBody(init) as { blocks: object[] }).blocks.map((block, index) => ({
          ...block,
          id: `n${index}`,
          sortOrder: index + 1,
          size: null,
        })),
      }),
    });
    await renderScreen(<TopicContentScreen />);
    expect(await screen.findByTestId("content-block-0")).toHaveTextContent(
      /1\. Text.*Read this.*Hello and hi\./,
    );
    expect(screen.getByTestId("content-block-1")).toHaveTextContent(/2\. Link.*A song/);
    expect(screen.getByText(/What students read, watch and download/)).toBeOnTheScreen();
    // Nothing to save yet, and the first cannot go further up.
    expect(screen.queryByTestId("content-save")).toBeNull();
    expect(disabled("content-up-0")).toBe(true);
    expect(disabled("content-down-1")).toBe(true);

    await fireEvent.press(screen.getByTestId("content-down-0"));
    expect(screen.getByTestId("content-block-0")).toHaveTextContent(/1\. Link.*A song/);
    expect(screen.getByTestId("content-unsaved")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("content-remove-1"));
    expect(screen.queryByTestId("content-block-1")).toBeNull();

    await fireEvent.press(screen.getByTestId("content-save"));
    expect(await screen.findByTestId("content-saved")).toBeOnTheScreen();
    expect(sentBody(calls("PUT", "/topics/t1/content")[0]![1])).toEqual({
      blocks: [{ kind: "LINK", title: "A song", body: null, url: "https://example.org/song" }],
    });
    expect(screen.queryByTestId("content-unsaved")).toBeNull();
  });

  it("adds a text block only with a heading and words, at the end of the list", async () => {
    serve({ ...PAGE, "GET /topics/t1/content": { ...CONTENT, blocks: [] } });
    await renderScreen(<TopicContentScreen />);
    expect(await screen.findByTestId("content-empty")).toHaveTextContent("No content yet.");
    await fireEvent.press(screen.getByTestId("content-add"));
    await fireEvent.press(screen.getByTestId("content-new-add"));
    expect(await screen.findAllByText("Required.")).toHaveLength(2);
    await fireEvent.changeText(screen.getByTestId("content-new-title"), " Read this ");
    await fireEvent.changeText(screen.getByTestId("content-new-text"), " Hello and hi. ");
    await fireEvent.press(screen.getByTestId("content-new-add"));
    expect(await screen.findByTestId("content-block-0")).toHaveTextContent(
      /Text.*Read this.*Hello and hi\./,
    );
    expect(screen.getByTestId("content-save")).toBeOnTheScreen();
    // Nothing reached the server before Save.
    expect(calls("PUT", "/topics/t1/content")).toHaveLength(0);
  });

  it("takes a link or a YouTube address only when it is one", async () => {
    serve({ ...PAGE, "GET /topics/t1/content": { ...CONTENT, blocks: [] } });
    await renderScreen(<TopicContentScreen />);
    await fireEvent.press(await screen.findByTestId("content-add"));
    await fireEvent.press(screen.getByTestId("content-new-kind"));
    await fireEvent.press(await screen.findByTestId("content-new-kind-option-LINK"));
    await fireEvent.changeText(screen.getByTestId("content-new-title"), "A song");
    await fireEvent.changeText(screen.getByTestId("content-new-url"), "example.org/song");
    await fireEvent.press(screen.getByTestId("content-new-add"));
    expect(await screen.findByText("Enter a valid link.")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("content-new-kind"));
    await fireEvent.press(await screen.findByTestId("content-new-kind-option-VIDEO"));
    await fireEvent.changeText(screen.getByTestId("content-new-url"), "https://example.org/film");
    await fireEvent.press(screen.getByTestId("content-new-add"));
    expect(
      await screen.findByText("Paste a YouTube link or upload a video file"),
    ).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByTestId("content-new-url"),
      "https://youtu.be/dQw4w9WgXcQ",
    );
    await fireEvent.press(screen.getByTestId("content-new-add"));
    expect(await screen.findByTestId("content-block-0")).toHaveTextContent(/Video.*A song/);
  });

  it("sends a chosen file to the server when the block joins the list", async () => {
    serve({
      ...PAGE,
      "GET /topics/t1/content": { ...CONTENT, blocks: [] },
      "POST /uploads/documents": () =>
        answer(201, { key: "documents/unit.pdf", url: "/api/v1/files/documents/unit.pdf" }),
      "PUT /topics/t1/content": { ...CONTENT, blocks: [] },
    });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: "file:///docs/unit.pdf", name: "unit.pdf", mimeType: "application/pdf", size: 9 },
      ],
    });
    await renderScreen(<TopicContentScreen />);
    await fireEvent.press(await screen.findByTestId("content-add"));
    await fireEvent.press(screen.getByTestId("content-new-kind"));
    await fireEvent.press(await screen.findByTestId("content-new-kind-option-FILE"));
    await fireEvent.changeText(screen.getByTestId("content-new-title"), "Unit 3");
    // No file yet: the block does not join the list.
    await fireEvent.press(screen.getByTestId("content-new-add"));
    expect(await screen.findByTestId("content-new-file-problem")).toHaveTextContent(
      "Choose a file.",
    );
    await fireEvent.press(screen.getByTestId("content-new-file-choose-file"));
    expect(await screen.findByTestId("content-new-file-name")).toHaveTextContent(
      "Attached: unit.pdf",
    );
    await fireEvent.press(screen.getByTestId("content-new-add"));
    expect(await screen.findByTestId("content-block-0")).toHaveTextContent(/File.*Unit 3/);
    expect(calls("POST", "/uploads/documents")).toHaveLength(1);
    await fireEvent.press(screen.getByTestId("content-save"));
    await waitFor(() => expect(calls("PUT", "/topics/t1/content")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/topics/t1/content")[0]![1])).toEqual({
      blocks: [
        { kind: "FILE", title: "Unit 3", body: null, url: "/api/v1/files/documents/unit.pdf" },
      ],
    });
  });

  it("says why the list was not saved and keeps it", async () => {
    serve({ ...PAGE, "PUT /topics/t1/content": refused });
    await renderScreen(<TopicContentScreen />);
    await fireEvent.press(await screen.findByTestId("content-remove-0"));
    await fireEvent.press(screen.getByTestId("content-save"));
    expect(await screen.findByTestId("content-problem")).toHaveTextContent(
      "You do not have permission to do this.",
    );
    expect(screen.getByTestId("content-save")).toBeOnTheScreen();
    expect(screen.queryByTestId("content-saved")).toBeNull();
  });

  it("is only read by someone who may not change it", async () => {
    serve({
      "GET /topics/t1/content": { ...CONTENT, canEdit: false },
      "GET /exercises": { items: [EXERCISE], canEdit: false },
      "GET /topics/t1/words": {
        ...NO_WORDS,
        canEdit: false,
        words: [{ id: "w1", term: "apple", translation: "olma", example: "I eat an apple." }],
      },
    });
    await renderScreen(<TopicContentScreen />);
    expect(await screen.findByTestId("content-block-0")).toHaveTextContent(/Read this/);
    expect(
      screen.getByText(/Teachers of the course and the office can change it/),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("content-add")).toBeNull();
    expect(screen.queryByTestId("content-remove-0")).toBeNull();
    // The exercise is listed, not opened or deleted; the words are read.
    expect(await screen.findByTestId("exercise-e1")).toHaveTextContent(
      /Quick check.*2 items · 3 tried/,
    );
    expect(screen.queryByTestId("exercise-new")).toBeNull();
    expect(screen.queryByTestId("exercise-delete-e1")).toBeNull();
    await fireEvent.press(screen.getByTestId("exercise-open-e1"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(await screen.findByTestId("word-w1")).toHaveTextContent(
      /apple — olma.*I eat an apple\./,
    );
    expect(screen.queryByTestId("words-text")).toBeNull();
  });

  it("opens from every topic of a group's plan, with or without content", async () => {
    mockParams = { id: "g1" };
    const topic = {
      id: "t1",
      sortOrder: 1,
      title: "Greetings",
      note: null,
      status: "next",
      lessonId: null,
      lessonDate: null,
      blocks: 0,
      release: { mode: "lesson", date: null },
      open: false,
    };
    serve({
      "GET /groups/g1": { id: "g1", name: "GE-Morning A1", status: "ACTIVE" },
      "GET /groups/g1/syllabus": {
        courseId: "c1",
        courseName: "General English",
        total: 2,
        done: 0,
        topics: [topic, { ...topic, id: "t2", sortOrder: 2, title: "Numbers", blocks: 3 }],
      },
      "GET /groups/g1/progress": { courseName: "General English", students: [] },
    });
    await renderScreen(<GroupPlanScreen />);
    expect(await screen.findByTestId("topic-content-t1")).toHaveTextContent("Content (0)");
    expect(screen.getByTestId("topic-content-t2")).toHaveTextContent("Content (3)");
    await fireEvent.press(screen.getByTestId("topic-content-t1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/topic/[id]", params: { id: "t1" } });
  });
});

describe("a topic's exercises", () => {
  it("are listed with their size, opened to change and deleted after a question", async () => {
    let items = [EXERCISE];
    serve({
      ...PAGE,
      "GET /exercises": (url: string) => {
        expect(url).toContain("topicId=t1");
        return { items, canEdit: true };
      },
      "DELETE /exercises/e1": () => {
        items = [];
        return undefined;
      },
    });
    await renderScreen(<TopicContentScreen />);
    expect(await screen.findByTestId("exercise-e1")).toHaveTextContent(
      /Quick check.*2 items · 3 tried/,
    );
    await fireEvent.press(screen.getByTestId("exercise-new"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/exercise/[id]",
      params: { id: "new", topic: "t1" },
    });
    await fireEvent.press(screen.getByTestId("exercise-open-e1"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/exercise/[id]",
      params: { id: "e1", topic: "t1" },
    });
    await fireEvent.press(screen.getByTestId("exercise-delete-e1"));
    expect(screen.getByText("Students' attempts at it are removed too.")).toBeOnTheScreen();
    expect(calls("DELETE", "/exercises/e1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("exercise-delete-confirm"));
    expect(await screen.findByTestId("exercises-empty")).toHaveTextContent("No exercises yet.");
  });

  it("belong to a homework too, on a page of their own", async () => {
    mockParams = { id: "h1", name: "Lesson of Nov 23" };
    serve({
      "GET /exercises": (url: string) => {
        expect(url).toContain("homeworkId=h1");
        return { items: [{ ...EXERCISE, topicId: null, homeworkId: "h1" }], canEdit: true };
      },
    });
    await renderScreen(<HomeworkExercisesScreen />);
    expect(await screen.findByTestId("exercise-e1")).toHaveTextContent(/Quick check/);
    expect(screen.getByText("Lesson of Nov 23")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("exercise-new"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/exercise/[id]",
      params: { id: "new", homework: "h1" },
    });
  });
});

describe("writing an exercise", () => {
  const addItem = async () => fireEvent.press(screen.getByTestId("exercise-item-add"));
  const kind = async (name: string) => {
    await fireEvent.press(screen.getByTestId("exercise-item-kind"));
    await fireEvent.press(await screen.findByTestId(`exercise-item-kind-option-${name}`));
  };

  it("adds items of several kinds by the site's rules and saves them on the topic", async () => {
    mockParams = { id: "new", topic: "t1" };
    serve({ "POST /exercises": () => answer(201, { ...EXERCISE, id: "e9" }) });
    await renderScreen(<ExerciseEditorScreen />);
    expect(await screen.findByText("New exercise")).toBeOnTheScreen();
    // Nothing to save without a title and an item.
    expect(disabled("exercise-save")).toBe(true);
    await fireEvent.changeText(screen.getByTestId("exercise-title"), " Quick check ");

    await fireEvent.press(screen.getByTestId("exercise-add-item"));
    await fireEvent.changeText(screen.getByTestId("exercise-item-prompt"), "Which is a greeting?");
    await fireEvent.changeText(screen.getByTestId("exercise-item-options"), "Hello");
    await addItem();
    expect(await screen.findByTestId("exercise-item-problem")).toHaveTextContent(
      "At least two options are required.",
    );
    await fireEvent.changeText(screen.getByTestId("exercise-item-options"), "Hello\nTable\n\nHi");
    await addItem();
    // Two options and more, but none ticked as right.
    expect(screen.getByTestId("exercise-item-problem")).toHaveTextContent("Required.");
    await fireEvent.press(screen.getByTestId("exercise-item-correct-2"));
    await fireEvent.press(screen.getByTestId("exercise-item-correct-0"));
    await addItem();
    expect(await screen.findByTestId("exercise-item-0")).toHaveTextContent(
      /1\..*Multiple choice.*Which is a greeting\?.*✓ Hello · Table · ✓ Hi/,
    );

    await fireEvent.press(screen.getByTestId("exercise-add-item"));
    await kind("TRUE_FALSE");
    await fireEvent.changeText(screen.getByTestId("exercise-item-prompt"), "Table is a greeting.");
    await fireEvent.press(screen.getByText("False"));
    await addItem();
    expect(await screen.findByTestId("exercise-item-1")).toHaveTextContent(
      /True or false.*✓ False/,
    );

    // The second goes first.
    await fireEvent.press(screen.getByTestId("exercise-item-up-1"));
    expect(screen.getByTestId("exercise-item-0")).toHaveTextContent(/True or false/);

    await fireEvent.press(screen.getByTestId("exercise-save"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(sentBody(calls("POST", "/exercises")[0]![1])).toEqual({
      title: "Quick check",
      topicId: "t1",
      items: [
        { kind: "TRUE_FALSE", prompt: "Table is a greeting.", correct: false },
        {
          kind: "CHOICE",
          prompt: "Which is a greeting?",
          options: ["Hello", "Table", "Hi"],
          correct: [0, 2],
        },
      ],
    });
  });

  it("reads gaps, pairs, an order and short answers from their lines", async () => {
    mockParams = { id: "new", homework: "h1" };
    serve({ "POST /exercises": () => answer(201, { ...EXERCISE, id: "e9" }) });
    await renderScreen(<ExerciseEditorScreen />);
    await fireEvent.changeText(await screen.findByTestId("exercise-title"), "Unit 1");

    await fireEvent.press(screen.getByTestId("exercise-add-item"));
    await kind("GAP");
    expect(screen.getByTestId("exercise-item-hint")).toHaveTextContent(
      /Write ___ where a gap goes/,
    );
    await fireEvent.changeText(
      screen.getByTestId("exercise-item-prompt"),
      "I ___ a student and you ___ a teacher.",
    );
    await fireEvent.changeText(screen.getByTestId("exercise-item-key"), "am | 'm");
    await addItem();
    expect(await screen.findByTestId("exercise-item-problem")).toHaveTextContent(
      "One answer line per gap (___) in the sentence",
    );
    await fireEvent.changeText(screen.getByTestId("exercise-item-key"), "am | 'm\nare");
    await addItem();
    expect(await screen.findByTestId("exercise-item-0")).toHaveTextContent(/am \| 'm · are/);

    await fireEvent.press(screen.getByTestId("exercise-add-item"));
    await kind("MATCH");
    await fireEvent.changeText(screen.getByTestId("exercise-item-prompt"), "Match the words.");
    await fireEvent.changeText(
      screen.getByTestId("exercise-item-key"),
      "apple = olma\nbook = kitob",
    );
    await addItem();
    await fireEvent.press(screen.getByTestId("exercise-add-item"));
    await kind("ORDER");
    await fireEvent.changeText(screen.getByTestId("exercise-item-prompt"), "Make a sentence.");
    await fireEvent.changeText(screen.getByTestId("exercise-item-key"), "I\nam\nhere");
    await addItem();
    await fireEvent.press(screen.getByTestId("exercise-add-item"));
    await kind("SHORT");
    await fireEvent.changeText(screen.getByTestId("exercise-item-prompt"), "Say hello in Uzbek.");
    await fireEvent.changeText(screen.getByTestId("exercise-item-key"), "salom\nassalomu alaykum");
    await addItem();
    expect(await screen.findByTestId("exercise-item-3")).toHaveTextContent(
      /salom \| assalomu alaykum/,
    );

    await fireEvent.press(screen.getByTestId("exercise-save"));
    await waitFor(() => expect(calls("POST", "/exercises")).toHaveLength(1));
    expect(sentBody(calls("POST", "/exercises")[0]![1])).toEqual({
      title: "Unit 1",
      homeworkId: "h1",
      items: [
        {
          kind: "GAP",
          prompt: "I ___ a student and you ___ a teacher.",
          answers: [["am", "'m"], ["are"]],
        },
        {
          kind: "MATCH",
          prompt: "Match the words.",
          pairs: [
            { left: "apple", right: "olma" },
            { left: "book", right: "kitob" },
          ],
        },
        { kind: "ORDER", prompt: "Make a sentence.", items: ["I", "am", "here"] },
        { kind: "SHORT", prompt: "Say hello in Uzbek.", answers: ["salom", "assalomu alaykum"] },
      ],
    });
  });

  it("opens an exercise there is with how the students did, and saves a change", async () => {
    mockParams = { id: "e1", topic: "t1" };
    mockWide = true;
    serve({
      "GET /exercises/e1": EXERCISE,
      "GET /exercises/e1/results": [
        {
          studentId: "s1",
          fullName: "Sardor Karimov",
          groupName: "GE-Morning A1",
          attempts: 2,
          bestScore: 2,
          maxScore: 2,
          bestPercent: 100,
          lastAt: "2026-11-21T09:00:00.000Z",
        },
      ],
      "PUT /exercises/e1": EXERCISE,
    });
    await renderScreen(<ExerciseEditorScreen />);
    expect((await screen.findByTestId("exercise-title")).props.value).toBe("Quick check");
    expect(screen.getByTestId("exercise-item-1")).toHaveTextContent(/Short answer.*salom/);
    expect(await screen.findByTestId("exercise-result-s1")).toHaveTextContent(
      /Sardor Karimov.*GE-Morning A1.*2\/2 \(100 %\) · 2 go\(s\)/,
    );
    await fireEvent.press(screen.getByTestId("exercise-item-remove-0"));
    await fireEvent.changeText(screen.getByTestId("exercise-title"), "Quick check 2");
    await fireEvent.press(screen.getByTestId("exercise-save"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(sentBody(calls("PUT", "/exercises/e1")[0]![1])).toEqual({
      title: "Quick check 2",
      items: [{ kind: "SHORT", prompt: "Say hello in Uzbek.", answers: ["salom"] }],
    });
  });

  it("says nobody tried it yet, and why a save was refused", async () => {
    mockParams = { id: "e1", topic: "t1" };
    serve({
      "GET /exercises/e1": EXERCISE,
      "GET /exercises/e1/results": [],
      "PUT /exercises/e1": refused,
    });
    await renderScreen(<ExerciseEditorScreen />);
    expect(await screen.findByTestId("exercise-results")).toHaveTextContent(
      /Nobody has tried it yet\./,
    );
    await fireEvent.press(screen.getByTestId("exercise-save"));
    expect(await screen.findByTestId("exercise-problem")).toHaveTextContent(
      "You do not have permission to do this.",
    );
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe("a topic's words for the trainer", () => {
  const WORDS = {
    ...NO_WORDS,
    words: [{ id: "w1", term: "apple", translation: "olma", example: "I eat an apple." }],
  };

  it("are written one to a line and saved as the site reads them", async () => {
    serve({
      ...PAGE,
      "GET /topics/t1/words": WORDS,
      "PUT /topics/t1/words": (_url: string, init?: RequestInit) => ({
        ...WORDS,
        words: (sentBody(init) as { words: object[] }).words.map((word, index) => ({
          id: `n${index}`,
          ...word,
        })),
      }),
    });
    await renderScreen(<TopicContentScreen />);
    const field = await screen.findByTestId("words-text");
    expect(field.props.value).toBe("apple — olma — I eat an apple.");
    expect(screen.getByTestId("words-count")).toHaveTextContent("1 word");
    await fireEvent.changeText(field, "apple - olma - I eat an apple.\n\nbook; kitob\npen");
    // A line without its translation holds the save back.
    expect(screen.getByTestId("words-parsed")).toHaveTextContent("1 line has no translation.");
    expect(disabled("words-save")).toBe(true);
    await fireEvent.changeText(
      screen.getByTestId("words-text"),
      "apple - olma - I eat an apple.\n\nbook; kitob",
    );
    expect(screen.getByTestId("words-parsed")).toHaveTextContent("2 of 200 words");
    await fireEvent.press(screen.getByTestId("words-save"));
    expect(await screen.findByTestId("words-saved")).toBeOnTheScreen();
    expect(sentBody(calls("PUT", "/topics/t1/words")[0]![1])).toEqual({
      words: [
        { term: "apple", translation: "olma", example: "I eat an apple." },
        { term: "book", translation: "kitob", example: null },
      ],
    });
    expect(screen.getByTestId("words-text").props.value).toBe(
      "apple — olma — I eat an apple.\nbook — kitob",
    );
    expect(screen.getByTestId("words-count")).toHaveTextContent("2 words");
  });

  it("say why they were not saved", async () => {
    serve({ ...PAGE, "PUT /topics/t1/words": refused });
    await renderScreen(<TopicContentScreen />);
    await fireEvent.changeText(await screen.findByTestId("words-text"), "apple - olma");
    await fireEvent.press(screen.getByTestId("words-save"));
    expect(await screen.findByTestId("words-problem")).toHaveTextContent(
      "You do not have permission to do this.",
    );
    expect(screen.queryByTestId("words-saved")).toBeNull();
  });
});
