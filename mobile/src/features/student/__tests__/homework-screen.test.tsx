import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { PortalHomework } from "@/api/types";
import { HomeworkScreen, needsAnswer } from "@/features/student/homework-screen";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
const mockPush = jest.fn();
let mockParams: { token: string; focus?: string } = { token: "tok" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

/*
 * A student's homework in the app (A-212): what a task shows, and what goes to
 * the server when an answer is handed in.
 */

function homework(change: Partial<PortalHomework> = {}): PortalHomework {
  return {
    id: "h1",
    lessonDate: "2026-11-20",
    lessonTopic: "Present perfect",
    title: null,
    rubric: [],
    maxScore: null,
    text: "Exercise 4 on page 31.",
    linkUrl: null,
    attachmentUrl: null,
    dueDate: "2026-11-25",
    speaking: false,
    exercises: [],
    submission: null,
    ...change,
  };
}

const fetchMock = jest.fn();
const clients: QueryClient[] = [];
const realFetch = globalThis.fetch;
// The test runner's form turns an object into text; the phone's keeps it, so watch what goes in.
const appended = jest.spyOn(FormData.prototype, "append");

beforeEach(() => {
  fetchMock.mockReset();
  appended.mockClear();
  mockPush.mockReset();
  mockParams = { token: "tok" };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  globalThis.fetch = realFetch;
});

function answer(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

/** The server as these tests need it: the list, the group's page, and taking an answer. */
function serve(items: PortalHomework[], onSubmit: () => Response = () => answer(204)) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return onSubmit();
    if (url.endsWith("/homework")) return answer(200, items);
    return answer(200, { portal: { group: { name: "GE-Morning A1" } } });
  });
}

async function renderScreen() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <I18nProvider>
            <HomeworkScreen />
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** The file as the app put it into the form: the phone's own name-and-address object. */
function sentFile(): unknown {
  return appended.mock.calls.find(([name]) => name === "file")?.[1];
}

function posted(): { url: string; form: FormData } {
  const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
  if (!call) throw new Error("nothing was sent");
  return { url: call[0] as string, form: (call[1] as RequestInit).body as FormData };
}

describe("a student's homework in the app", () => {
  it("knows what still needs an answer", () => {
    expect(needsAnswer(homework())).toBe(true);
    const sent = { note: "x", attachmentUrl: null, submittedAt: "", teacherComment: null };
    const rest = { teacherAudioUrl: null, rubricScores: null, score: null };
    expect(needsAnswer(homework({ submission: { status: "SUBMITTED", ...sent, ...rest } }))).toBe(
      false,
    );
    expect(needsAnswer(homework({ submission: { status: "RETURNED", ...sent, ...rest } }))).toBe(
      true,
    );
    expect(needsAnswer(homework({ submission: { status: "ACCEPTED", ...sent, ...rest } }))).toBe(
      false,
    );
  });

  it("shows the task, its day, its state and how many are still to do", async () => {
    serve([homework(), homework({ id: "h2", lessonDate: "2026-11-18", text: "Read the text." })]);
    await renderScreen();
    const card = await screen.findByTestId("homework-h1");
    expect(card).toHaveTextContent(/Lesson of Nov 20/);
    expect(card).toHaveTextContent(/To do/);
    expect(card).toHaveTextContent(/Due Nov 25/);
    expect(card).toHaveTextContent(/Exercise 4 on page 31\./);
    expect(screen.getByText(/GE-Morning A1, 2 to do/)).toBeTruthy();
  });

  it("puts the task opened from the home screen first, with its form open", async () => {
    mockParams = { token: "tok", focus: "h2" };
    serve([homework(), homework({ id: "h2", text: "Read the text." })]);
    await renderScreen();
    await screen.findByTestId("homework-h2");
    const cards = screen.getAllByTestId(/^homework-h\d$/).map((card) => card.props.testID);
    expect(cards).toEqual(["homework-h2", "homework-h1"]);
    expect(screen.getAllByTestId("homework-form")).toHaveLength(1);
  });

  it("sends the written answer to the student's own address, without a session", async () => {
    serve([homework()]);
    await renderScreen();
    await fireEvent.press(await screen.findByTestId("homework-answer-open"));
    await fireEvent.changeText(screen.getByTestId("homework-note"), "  1b 2a 3c  ");
    await fireEvent.press(screen.getByTestId("homework-send"));
    expect(await screen.findByTestId("homework-sent")).toBeTruthy();
    const { url, form } = posted();
    expect(url).toMatch(/\/api\/v1\/public\/class\/tok\/homework\/h1$/);
    expect(form.get("note")).toBe("1b 2a 3c");
    const headers = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === "POST")![1]
      .headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    // The form is put away.
    expect(screen.queryByTestId("homework-form")).toBeNull();
  });

  it("does not send an empty answer", async () => {
    serve([homework()]);
    await renderScreen();
    await fireEvent.press(await screen.findByTestId("homework-answer-open"));
    await fireEvent.press(screen.getByTestId("homework-send"));
    expect(await screen.findByTestId("homework-problem")).toHaveTextContent(
      /Write an answer or attach a file first/,
    );
    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === "POST")).toBe(false);
  });

  it("attaches a photo taken with the camera and sends it with the answer", async () => {
    serve([homework()]);
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///c/page.jpg", fileName: "page.jpg", mimeType: "image/jpeg" }],
    });
    await renderScreen();
    await fireEvent.press(await screen.findByTestId("homework-answer-open"));
    await fireEvent.press(screen.getByTestId("homework-take-photo"));
    expect(await screen.findByTestId("homework-attached")).toHaveTextContent(/page\.jpg/);
    await fireEvent.press(screen.getByTestId("homework-send"));
    await screen.findByTestId("homework-sent");
    expect(sentFile()).toMatchObject({
      uri: "file:///c/page.jpg",
      name: "page.jpg",
      type: "image/jpeg",
    });
  });

  it("says why a file cannot be sent", async () => {
    serve([homework()]);
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///c/live.heic", fileName: "live.heic", mimeType: "image/heic" }],
    });
    await renderScreen();
    await fireEvent.press(await screen.findByTestId("homework-answer-open"));
    await fireEvent.press(screen.getByTestId("homework-choose-photo"));
    expect(await screen.findByTestId("homework-problem")).toHaveTextContent(
      /This kind of file cannot be sent/,
    );
    expect(screen.queryByTestId("homework-attached")).toBeNull();
  });

  it("records a spoken answer and sends the recording", async () => {
    serve([homework({ speaking: true })]);
    await renderScreen();
    await fireEvent.press(await screen.findByTestId("homework-answer-open"));
    await fireEvent.press(screen.getByTestId("recorder-start"));
    await screen.findByTestId("recorder-recording");
    await fireEvent.press(screen.getByTestId("recorder-stop"));
    await screen.findByTestId("recorder-clip");
    await fireEvent.press(screen.getByTestId("homework-send"));
    await screen.findByTestId("homework-sent");
    expect(sentFile()).toMatchObject({
      uri: "file:///recordings/answer.m4a",
      name: "answer.m4a",
      type: "audio/mp4",
    });
  });

  it("shows the server's reason when the answer is refused, and keeps the form", async () => {
    serve([homework()], () =>
      answer(422, {
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { file: ["validation.attachmentSize"] },
        },
      }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByTestId("homework-answer-open"));
    await fireEvent.changeText(screen.getByTestId("homework-note"), "My answer");
    await fireEvent.press(screen.getByTestId("homework-send"));
    await waitFor(() => expect(screen.getByTestId("homework-problem")).toBeTruthy());
    expect(screen.getByTestId("homework-form")).toBeTruthy();
    expect(screen.queryByTestId("homework-sent")).toBeNull();
  });

  it("shows the answer, the teacher's reply and the score, and opens files inside the app", async () => {
    serve([
      homework({
        attachmentUrl: "/api/v1/public/class/tok/files/homework/task.pdf",
        rubric: [
          { name: "Grammar", max: 5 },
          { name: "Ideas", max: 5 },
        ],
        maxScore: 10,
        submission: {
          status: "ACCEPTED",
          note: "Here is my essay.",
          attachmentUrl: "/api/v1/public/class/tok/files/homework/essay.pdf",
          submittedAt: "2026-11-21T10:00:00.000Z",
          teacherComment: "Good work.",
          teacherAudioUrl: "/api/v1/public/class/tok/files/homework/reply.m4a",
          rubricScores: [4, 5],
          score: 9,
        },
      }),
    ]);
    await renderScreen();
    const card = await screen.findByTestId("homework-h1");
    expect(card).toHaveTextContent(/Accepted/);
    expect(screen.getByTestId("homework-score")).toHaveTextContent("Your score: 9 of 10");
    expect(screen.getByTestId("homework-teacher-comment")).toHaveTextContent(
      /Teacher:\s+Good work\./,
    );
    expect(screen.getByTestId("homework-teacher-audio")).toBeTruthy();
    // An accepted answer is final.
    expect(screen.queryByTestId("homework-answer-open")).toBeNull();

    await fireEvent.press(screen.getByTestId("homework-file"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/file",
      params: expect.objectContaining({ url: "/api/v1/public/class/tok/files/homework/task.pdf" }),
    });
    await fireEvent.press(screen.getByTestId("homework-own-file"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/file",
      params: expect.objectContaining({ url: "/api/v1/public/class/tok/files/homework/essay.pdf" }),
    });
  });

  it("offers to answer again when the teacher sent the work back", async () => {
    serve([
      homework({
        submission: {
          status: "RETURNED",
          note: "First try",
          attachmentUrl: null,
          submittedAt: "2026-11-21T10:00:00.000Z",
          teacherComment: "Please redo task 2.",
          teacherAudioUrl: null,
          rubricScores: null,
          score: null,
        },
      }),
    ]);
    await renderScreen();
    await fireEvent.press(await screen.findByTestId("homework-answer-open"));
    // The earlier answer is in the field, ready to be corrected.
    expect(screen.getByTestId("homework-note").props.value).toBe("First try");
  });
});
