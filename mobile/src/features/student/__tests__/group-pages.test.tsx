import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import type {
  ChatMessage,
  PortalExercise,
  PortalMaterial,
  PortalTest,
  PortalTestRun,
} from "@/api/types";
import { ChatScreen, CHAT_POLL_MS } from "@/features/student/chat-screen";
import { ExerciseScreen } from "@/features/student/exercise-screen";
import { MaterialsScreen } from "@/features/student/materials-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { TestsScreen } from "@/features/student/tests-screen";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { token: "tok" };
jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      canGoBack: () => true,
      replace: jest.fn(),
    }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});

/*
 * The pages of a group on the student's side (A-213): materials, the chat,
 * tests and an exercise. Each test plays the server and reads what the app
 * shows and what it sends back.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const PORTAL = { portal: { group: { name: "GE-Morning A1" } } };

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  mockParams = { token: "tok" };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
  clearClients();
  globalThis.fetch = realFetch;
});

/** Lets what the cache was just told reach the screen before a test ends. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Requests the app made with this method to an address ending in `tail`. */
function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

function material(change: Partial<PortalMaterial>): PortalMaterial {
  return {
    id: "m1",
    lessonId: "l1",
    lessonDate: "2026-11-21",
    lessonTopic: "Present perfect",
    kind: "FILE",
    title: "Unit 3.pdf",
    url: "/api/v1/public/class/tok/files/documents/unit-3.pdf",
    size: 1000,
    durationSec: null,
    hlsUrl: null,
    resumeSec: null,
    ...change,
  };
}

describe("a group's materials in the app", () => {
  const items = [
    material({}),
    material({
      id: "m2",
      kind: "RECORDING",
      title: "Lesson recording",
      url: "/api/v1/public/class/tok/files/recordings/a.webm",
      hlsUrl: "/api/v1/public/class/tok/files/hls/a.m3u8",
      durationSec: 1800,
      resumeSec: 754,
    }),
    material({
      id: "m3",
      lessonId: null,
      lessonDate: null,
      lessonTopic: null,
      kind: "LINK",
      title: "Grammar site",
      url: "https://example.org/grammar",
    }),
  ];
  beforeEach(() => {
    fetchMock.mockImplementation(async (url) =>
      url.endsWith("/materials") ? answer(200, items) : answer(200, PORTAL),
    );
  });

  it("sorts them under their lessons and says where a recording continues", async () => {
    await renderScreen(<MaterialsScreen />);
    await screen.findByTestId("material-m1");
    expect(screen.getAllByTestId("materials-group")).toHaveLength(2);
    expect(screen.getByText("Lesson of Nov 21")).toBeTruthy();
    expect(screen.getByText("For the whole group")).toBeTruthy();
    expect(screen.getByText("30 min, Continue from 12:34")).toBeTruthy();
  });

  it("opens a file and a recording inside the app, and a link where links open", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderScreen(<MaterialsScreen />);
    await fireEvent.press(await screen.findByTestId("material-m1"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/file",
      params: { url: items[0]!.url, title: "Unit 3.pdf" },
    });
    await fireEvent.press(screen.getByTestId("material-m2"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/file",
      params: {
        url: items[1]!.url,
        title: "Lesson recording",
        token: "tok",
        material: "m2",
        stream: items[1]!.hlsUrl,
        resume: "754",
      },
    });
    await fireEvent.press(screen.getByTestId("material-m3"));
    expect(openURL).toHaveBeenCalledWith("https://example.org/grammar");
    expect(mockPush).toHaveBeenCalledTimes(2);
    openURL.mockRestore();
  });
});

describe("the group chat in the app", () => {
  const first: ChatMessage = {
    id: "c1",
    text: "Hello class",
    at: "2026-11-23T04:00:00.000Z",
    source: "WEB",
    author: { kind: "STAFF", name: "Demo Teacher" },
    mine: false,
  };
  function serve(newer: ChatMessage[] = []) {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith("/chat/read")) return answer(200, { unread: 0 });
      if (url.endsWith("/chat") && init?.method === "POST") {
        const text = (sentBody(init) as { text: string }).text;
        return answer(201, { ...first, id: "c9", text, mine: true, author: { kind: "STUDENT" } });
      }
      if (url.includes("/chat?after=")) return answer(200, { messages: newer, unread: 0 });
      if (url.endsWith("/chat")) {
        return answer(200, { messages: [first], unread: 1, teachers: ["Demo Teacher"] });
      }
      return answer(200, PORTAL);
    });
  }

  it("shows the thread, reads it on opening and sends a message", async () => {
    serve();
    await renderScreen(<ChatScreen />);
    await screen.findByText("Hello class");
    expect(screen.getByTestId("chat-teachers").props.children).toBe("Teachers: Demo Teacher");
    await waitFor(() => expect(calls("POST", "/chat/read")).toHaveLength(1));

    await fireEvent.changeText(screen.getByTestId("chat-input"), "  Thank you!  ");
    await fireEvent.press(screen.getByTestId("chat-send"));
    await screen.findByText("Thank you!");
    expect(sentBody(calls("POST", "/chat")[0]![1])).toEqual({ text: "Thank you!" });
    expect(screen.getByTestId("chat-message-mine")).toBeTruthy();
    expect(screen.getByTestId("chat-input").props.value).toBe("");
    await settle();
  });

  it("does not send an empty message", async () => {
    serve();
    await renderScreen(<ChatScreen />);
    await screen.findByText("Hello class");
    await fireEvent.changeText(screen.getByTestId("chat-input"), "   ");
    await fireEvent.press(screen.getByTestId("chat-send"));
    expect(calls("POST", "/chat")).toHaveLength(0);
    await settle();
  });

  it("asks for newer messages while it is open and reads them", async () => {
    serve([{ ...first, id: "c2", text: "See you on Thursday" }]);
    await renderScreen(<ChatScreen />);
    await screen.findByText("Hello class");
    await waitFor(() => expect(calls("POST", "/chat/read")).toHaveLength(1));
    await settle();
    jest.useFakeTimers();
    // The timer was set with real time; a fresh screen sets it again under the test's clock.
    await screen.rerender(<></>);
    serve([{ ...first, id: "c2", text: "See you on Thursday" }]);
    await renderScreen(<ChatScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CHAT_POLL_MS + 50);
    });
    expect(screen.getByText("See you on Thursday")).toBeTruthy();
    expect(calls("GET", "/chat").some(([url]) => url.endsWith("/chat?after=c1"))).toBe(true);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
  });
});

describe("a group's tests in the app", () => {
  const open: PortalTest = {
    id: "t1",
    name: "Unit 2 quick check",
    subject: "English",
    questionCount: 2,
    totalPoints: 2,
    timeLimitMinutes: 5,
    passPercent: 60,
    deadline: null,
    available: true,
    startedAt: null,
    secondsLeft: null,
    attempt: null,
  };
  const taken: PortalTest = {
    ...open,
    id: "t0",
    name: "Unit 1 grammar check",
    attempt: {
      score: 5,
      maxScore: 5,
      percent: 100,
      passed: true,
      submittedAt: "2026-11-20T10:00:00.000Z",
    },
  };
  const run: PortalTestRun = {
    id: "t1",
    name: "Unit 2 quick check",
    subject: "English",
    timeLimitMinutes: 5,
    passPercent: 60,
    startedAt: "2026-11-23T04:00:00.000Z",
    secondsLeft: 300,
    questions: [
      { id: "q1", text: "She ___ to school.", options: ["go", "goes"], points: 1 },
      { id: "q2", text: "They ___ football.", options: ["plays", "play"], points: 1 },
    ],
  };
  function serve(change: Partial<PortalTestRun> = {}) {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith("/tests")) return answer(200, [open, taken]);
      if (url.endsWith("/tests/t1") && init?.method === "POST") {
        return answer(201, { score: 1, maxScore: 2, percent: 50, passed: false, coins: 3 });
      }
      if (url.endsWith("/tests/t1")) return answer(200, { ...run, ...change });
      return answer(200, PORTAL);
    });
  }

  it("lists them with what was scored and warns before a timed start", async () => {
    serve();
    await renderScreen(<TestsScreen />);
    await screen.findByTestId("test-t1");
    expect(screen.getByTestId("test-start-hint")).toBeTruthy();
    expect(screen.getAllByTestId("test-start")).toHaveLength(1);
    expect(screen.getByText("5 / 5 points · 100%")).toBeTruthy();
    expect(screen.getByText("Passed")).toBeTruthy();
  });

  it("runs a test: answers, a confirmation that names what is missing, the result", async () => {
    serve();
    await renderScreen(<TestsScreen />);
    await fireEvent.press(await screen.findByTestId("test-start"));
    await screen.findByTestId("test-clock");
    expect(screen.getByText("English, 0 of 2 answered")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("test-option-0-1"));
    expect(screen.getByText("English, 1 of 2 answered")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("test-hand-in"));
    expect(screen.getByText("One question has no answer. Hand in anyway?")).toBeTruthy();
    expect(calls("POST", "/tests/t1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("test-confirm-cancel"));
    await fireEvent.press(screen.getByTestId("test-option-1-1"));
    await fireEvent.press(screen.getByTestId("test-hand-in"));
    await fireEvent.press(screen.getByTestId("test-confirm-hand-in"));

    await screen.findByTestId("test-result");
    expect(sentBody(calls("POST", "/tests/t1")[0]![1])).toEqual({ answers: { q1: 1, q2: 1 } });
    expect(screen.getByTestId("test-result-score").props.children).toBe("1 of 2 points");
    expect(screen.getByText("Not passed")).toBeTruthy();
    expect(screen.getByTestId("test-result-coins")).toBeTruthy();
    expect(screen.queryByTestId("test-result-auto")).toBeNull();
  });

  it("hands the answers in by itself when the time runs out", async () => {
    serve({ secondsLeft: 2 });
    await renderScreen(<TestsScreen />);
    await screen.findByTestId("test-start");
    jest.useFakeTimers();
    await fireEvent.press(screen.getByTestId("test-start"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await fireEvent.press(screen.getByTestId("test-option-0-0"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(sentBody(calls("POST", "/tests/t1")[0]![1])).toEqual({ answers: { q1: 0 } });
    expect(screen.getByTestId("test-result-auto")).toBeTruthy();
  });
});

describe("a self-check exercise in the app", () => {
  const exercise: PortalExercise = {
    id: "e1",
    title: "Present perfect",
    itemCount: 7,
    attempts: 0,
    best: null,
    items: [
      { kind: "CHOICE", prompt: "Which is right?", options: ["went", "gone"], multiple: false },
      { kind: "CHOICE", prompt: "Tick both.", options: ["seen", "saw", "written"], multiple: true },
      { kind: "TRUE_FALSE", prompt: "Since goes with a point in time." },
      { kind: "GAP", prompt: "She ___ lived here ___ 2019.", gaps: 2 },
      { kind: "MATCH", prompt: "Match.", lefts: ["go", "eat"], rights: ["eaten", "gone"] },
      { kind: "ORDER", prompt: "Order.", pieces: ["have", "I", "been"] },
      { kind: "SHORT", prompt: "Participle of be?" },
    ],
  };
  const outcome = {
    score: 7,
    maxScore: 8,
    percent: 88,
    items: [
      { correct: true, points: 1, max: 1, key: ["gone"] },
      { correct: true, points: 1, max: 1, key: ["seen", "written"] },
      { correct: true, points: 1, max: 1, key: ["True"] },
      { correct: false, points: 1, max: 2, key: ["has", "since"] },
      { correct: true, points: 1, max: 1, key: [] },
      { correct: true, points: 1, max: 1, key: [] },
      { correct: true, points: 1, max: 1, key: ["been"] },
    ],
    best: { score: 7, maxScore: 8, percent: 88 },
    attempts: 1,
  };
  beforeEach(() => {
    mockParams = { token: "tok", exercise: "e1", title: "Present perfect" };
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith("/exercises/e1") && init?.method === "POST") return answer(201, outcome);
      if (url.endsWith("/exercises/e1")) return answer(200, exercise);
      return answer(200, []);
    });
  });

  it("sends each kind of answer the way the server reads it, then shows what went wrong", async () => {
    await renderScreen(<ExerciseScreen />);
    await fireEvent.press(await screen.findByTestId("exercise-option-0-1"));
    await fireEvent.press(screen.getByTestId("exercise-option-1-2"));
    await fireEvent.press(screen.getByTestId("exercise-option-1-0"));
    await fireEvent.press(screen.getByTestId("exercise-option-2-0"));
    await fireEvent.changeText(screen.getByTestId("exercise-gap-3-1"), "for");
    await fireEvent.changeText(screen.getByTestId("exercise-gap-3-0"), "has");
    await fireEvent.press(screen.getByTestId("exercise-match-4-0-1"));
    await fireEvent.press(screen.getByTestId("exercise-match-4-1-0"));
    // "have, I, been" becomes "I, have, been".
    await fireEvent.press(screen.getByTestId("exercise-up-5-1"));
    await fireEvent.changeText(screen.getByTestId("exercise-short-6"), "been");
    await fireEvent.press(screen.getByTestId("exercise-check"));

    await screen.findByTestId("exercise-result");
    expect(sentBody(calls("POST", "/exercises/e1")[0]![1])).toEqual({
      answers: {
        "0": [1],
        "1": [0, 2],
        "2": true,
        "3": ["has", "for"],
        "4": ["gone", "eaten"],
        "5": ["I", "have", "been"],
        "6": "been",
      },
    });
    expect(screen.getByTestId("exercise-score").props.children).toBe("7 of 8 (88 %)");
    expect(screen.getByTestId("exercise-wrong-3")).toBeTruthy();
    expect(screen.getByTestId("exercise-key-3")).toBeTruthy();
    expect(screen.getAllByTestId(/^exercise-right-/)).toHaveLength(6);
    expect(screen.queryByTestId("exercise-check")).toBeNull();
  });

  it("starts again with empty answers, and Done goes back", async () => {
    await renderScreen(<ExerciseScreen />);
    await fireEvent.changeText(await screen.findByTestId("exercise-short-6"), "been");
    await fireEvent.press(screen.getByTestId("exercise-check"));
    await fireEvent.press(await screen.findByTestId("exercise-again"));
    expect(screen.getByTestId("exercise-short-6").props.value).toBe("");
    await fireEvent.press(screen.getByTestId("exercise-check"));
    await fireEvent.press(await screen.findByTestId("exercise-done"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("picks a match off again when its chip is pressed twice", async () => {
    await renderScreen(<ExerciseScreen />);
    await fireEvent.press(await screen.findByTestId("exercise-match-4-0-1"));
    await fireEvent.press(screen.getByTestId("exercise-match-4-0-1"));
    await fireEvent.press(screen.getByTestId("exercise-check"));
    await screen.findByTestId("exercise-result");
    const sent = sentBody(calls("POST", "/exercises/e1")[0]![1]) as {
      answers: Record<string, unknown>;
    };
    expect(sent.answers["4"]).toEqual(["", ""]);
  });
});
