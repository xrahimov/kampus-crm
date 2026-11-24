import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import type { AssistantInfo, Briefing } from "@/api/office-assistant";
import { AssistantScreen } from "@/features/assistant/assistant-screen";
import { forgetAssistantChat } from "@/features/assistant/assistant-store";
import { HeaderActions } from "@/features/office/header-actions";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { centreToday } from "@/lib/days";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
let mockParams: { tab?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
const mockOpenOnSite = jest.fn<Promise<void>, [string]>(async () => undefined);
jest.mock("@/lib/web", () => ({ openOnSite: (path: string) => mockOpenOnSite(path) }));
let mockPermissions = ["dashboard.view", "groups.view"];
let mockUserId = "u1";
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: mockUserId },
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] }, permission: string) => me.permissions.includes(permission),
}));

/*
 * The assistant in the app (A-253): the conversation and the summary of the
 * site's assistant in one screen, and the button on Home that opens it. Each
 * test here plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const scrollToEnd = (ScrollView as unknown as { prototype: { scrollToEnd: jest.Mock } }).prototype
  .scrollToEnd;

beforeEach(async () => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockOpenOnSite.mockClear();
  scrollToEnd.mockClear();
  mockParams = {};
  mockPermissions = ["dashboard.view", "groups.view"];
  mockUserId = "u1";
  forgetAssistantChat();
  await AsyncStorage.clear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

const OFFICE: AssistantInfo = {
  audience: "office",
  mode: "fake",
  model: "kampus-test",
  canConfigure: true,
};
const TEACHER: AssistantInfo = {
  audience: "teacher",
  mode: "anthropic",
  model: "claude-opus-5-5",
  canConfigure: false,
};

function briefing(change: Partial<Briefing> = {}): Briefing {
  return {
    view: "management",
    views: ["management"],
    period: "yesterday",
    from: "2026-11-23",
    to: "2026-11-23",
    scope: { kind: "branch", name: "Chilonzor" },
    stats: [
      {
        key: "payments",
        value: 1500000,
        unit: "money",
        tone: "good",
        href: "/reports/student-payments",
        details: [],
      },
      {
        key: "debtors",
        value: 2,
        unit: "count",
        tone: "bad",
        href: "/debts",
        details: [
          { label: "", value: 900000, unit: "money" },
          { label: "Aziz Karimov", value: 600000, unit: "money", href: "/students/s1" },
        ],
        more: 1,
      },
      {
        key: "unmarked",
        value: 3,
        unit: "count",
        tone: "bad",
        href: "/today?date=2026-11-23",
        details: [{ label: "GE-Morning A1", value: 3, href: "/groups/g1" }],
      },
      {
        key: "stoppedComing",
        value: 1,
        unit: "count",
        tone: "warn",
        details: [{ label: "Malika Saidova", value: 3, note: "GE-Morning A1" }],
      },
    ],
    branches: [],
    conclusion: [
      { rule: "payments", values: { amount: 1500000 } },
      { rule: "unmarked", values: { students: 3, groups: 1 } },
    ],
    mode: "fake",
    model: "kampus-test",
    aiFailed: false,
    pending: false,
    ...change,
  };
}

const NOT_FOUND = () => answer(404, { error: { code: "NOT_FOUND", message: "errors.notFound" } });
const FAILED = () => answer(500, { error: { code: "INTERNAL", message: "assistant.error" } });

/** Plays the server: who is asking, the answers to questions in turn, the summaries in turn. */
function serve({
  info = OFFICE,
  answers = [],
  briefings = [],
}: {
  info?: AssistantInfo;
  answers?: Array<Response | { answer: string; tools?: string[]; mode?: "fake" | "anthropic" }>;
  briefings?: Array<Briefing | Response>;
}) {
  const nextAnswers = [...answers];
  const nextBriefings = [...briefings];
  fetchMock.mockImplementation(async (url, init) => {
    const path = url.split("?")[0]!;
    const method = init?.method ?? "GET";
    if (path.endsWith("/assistant/briefing") && method === "POST") {
      const next = nextBriefings.length > 1 ? nextBriefings.shift()! : nextBriefings[0];
      if (!next) return NOT_FOUND();
      return "ok" in next ? next : answer(200, next);
    }
    if (path.endsWith("/assistant") && method === "GET") return answer(200, info);
    if (path.endsWith("/assistant") && method === "POST") {
      const next = nextAnswers.shift();
      if (!next) return NOT_FOUND();
      if ("ok" in next) return next;
      return answer(200, { tools: [], mode: info.mode, model: info.model, ...next });
    }
    return NOT_FOUND();
  });
}
const posted = (tail: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => url.split("?")[0]!.endsWith(tail) && init?.method === "POST")
    .map(([, init]) => sentBody(init));

describe("asking the assistant", () => {
  it("opens on the conversation with the office's first questions and the test-mode note", async () => {
    serve({});
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-hint")).toBeTruthy());
    expect(screen.getByTestId("assistant-hint")).toHaveTextContent(/^Ask about your centre/);
    expect(screen.getByTestId("assistant-mode-test")).toHaveTextContent(/^Test mode/);
    expect(screen.queryByTestId("assistant-mode-live")).toBeNull();
    for (const key of ["debtors", "students", "payments", "today", "sms"]) {
      expect(screen.getByTestId(`assistant-suggestion-${key}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("assistant-suggestion-myDay")).toBeNull();
    // Nothing was asked yet: opening the page costs no answer.
    expect(posted("/assistant")).toHaveLength(0);
    // Whoever may enter the key is shown the way to it, inside the app.
    await fireEvent.press(screen.getByTestId("assistant-settings"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/settings/integrations");
  });

  it("shows a teacher their own questions and who answers", async () => {
    mockPermissions = ["groups.view"];
    serve({ info: TEACHER });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-hint")).toBeTruthy());
    expect(screen.getByTestId("assistant-hint")).toHaveTextContent(/^Ask about your own work/);
    expect(screen.getByTestId("assistant-mode-live")).toHaveTextContent(
      "Answers by claude-opus-5-5",
    );
    expect(screen.queryByTestId("assistant-mode-test")).toBeNull();
    expect(screen.queryByTestId("assistant-settings")).toBeNull();
    expect(screen.getByTestId("assistant-suggestion-lessonPlan")).toBeTruthy();
    expect(screen.queryByTestId("assistant-suggestion-debtors")).toBeNull();
  });

  it("asks an offered question, shows the answer with what it looked at and follows it down", async () => {
    serve({ answers: [{ answer: "Two students owe 900 000.", tools: ["debtors", "payments"] }] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-suggestion-debtors")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("assistant-suggestion-debtors"));
    await waitFor(() => expect(screen.getByTestId("assistant-message-assistant")).toBeTruthy());
    expect(posted("/assistant")).toEqual([
      { messages: [{ role: "user", content: "Who owes money right now?" }], locale: "en" },
    ]);
    expect(screen.getByTestId("assistant-message-user")).toHaveTextContent(
      "Who owes money right now?",
    );
    expect(screen.getByTestId("assistant-message-assistant")).toHaveTextContent(
      /Two students owe 900 000\./,
    );
    expect(screen.getByTestId("assistant-tools")).toHaveTextContent("Looked at: debtors, payments");
    // The hint and the offered questions make room for the conversation.
    expect(screen.queryByTestId("assistant-hint")).toBeNull();
    expect(screen.queryByTestId("assistant-suggestion-debtors")).toBeNull();
    await waitFor(() => expect(scrollToEnd).toHaveBeenCalled());
  });

  it("sends the whole conversation with each question and starts anew on request", async () => {
    serve({ answers: [{ answer: "Three lessons." }, { answer: "At nine." }] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-input")).toBeTruthy());
    // Nothing typed, nothing to send; no way to start anew while nothing was said.
    expect(screen.getByTestId("assistant-send").props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByTestId("assistant-clear")).toBeNull();

    await fireEvent.changeText(screen.getByTestId("assistant-input"), "  What is on today?  ");
    await fireEvent.press(screen.getByTestId("assistant-send"));
    await waitFor(() => expect(screen.getByText("Three lessons.")).toBeTruthy());
    expect(screen.getByTestId("assistant-input").props.value).toBe("");
    await fireEvent.changeText(screen.getByTestId("assistant-input"), "When is the first?");
    await fireEvent.press(screen.getByTestId("assistant-send"));
    await waitFor(() => expect(screen.getByText("At nine.")).toBeTruthy());
    expect(posted("/assistant")[1]).toEqual({
      messages: [
        { role: "user", content: "What is on today?" },
        { role: "assistant", content: "Three lessons." },
        { role: "user", content: "When is the first?" },
      ],
      locale: "en",
    });

    await fireEvent.press(screen.getByTestId("assistant-clear"));
    expect(screen.queryByTestId("assistant-message-user")).toBeNull();
    expect(screen.getByTestId("assistant-suggestion-debtors")).toBeTruthy();
    expect(screen.queryByTestId("assistant-clear")).toBeNull();
  });

  it("keeps the question when no answer came, and asks it again with the next one", async () => {
    serve({ answers: [FAILED(), { answer: "Now it works." }] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-input")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("assistant-input"), "Who was absent?");
    await fireEvent.press(screen.getByTestId("assistant-send"));
    await waitFor(() => expect(screen.getByTestId("assistant-problem")).toBeTruthy());
    expect(screen.getByTestId("assistant-problem")).toHaveTextContent(
      "The assistant could not answer. Try again.",
    );
    expect(screen.getByTestId("assistant-message-user")).toHaveTextContent("Who was absent?");
    expect(screen.queryByTestId("assistant-message-assistant")).toBeNull();

    await fireEvent.changeText(screen.getByTestId("assistant-input"), "Yesterday, I mean.");
    await fireEvent.press(screen.getByTestId("assistant-send"));
    await waitFor(() => expect(screen.getByText("Now it works.")).toBeTruthy());
    expect(screen.queryByTestId("assistant-problem")).toBeNull();
    expect(posted("/assistant")[1]).toEqual({
      messages: [
        { role: "user", content: "Who was absent?" },
        { role: "user", content: "Yesterday, I mean." },
      ],
      locale: "en",
    });
  });

  it("says who answered once a real answer came, whatever the page was told before", async () => {
    serve({ answers: [{ answer: "Hello.", mode: "anthropic" }] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-mode-test")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("assistant-suggestion-today"));
    await waitFor(() => expect(screen.getByText("Hello.")).toBeTruthy());
    expect(screen.queryByTestId("assistant-mode-test")).toBeNull();
    expect(screen.getByTestId("assistant-mode-live")).toBeTruthy();
  });
});

describe("a conversation between visits to the page", () => {
  async function talk() {
    serve({ answers: [{ answer: "Kept." }] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-suggestion-today")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("assistant-suggestion-today"));
    await waitFor(() => expect(screen.getByText("Kept.")).toBeTruthy());
    await screen.unmount();
  }

  it("is still there for the same person", async () => {
    await talk();
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByText("Kept.")).toBeTruthy());
  });

  it("is not shown to the next person who signs in on this phone", async () => {
    await talk();
    mockUserId = "u2";
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-suggestion-today")).toBeTruthy());
    expect(screen.queryByText("Kept.")).toBeNull();
  });
});

describe("the summary", () => {
  beforeEach(() => {
    mockParams = { tab: "summary" };
  });

  it("asks for yesterday's figures and shows them with the plain conclusion", async () => {
    serve({ briefings: [briefing()] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-stats")).toBeTruthy());
    // The figures are asked for without waiting for a model, in the app's language.
    expect(posted("/assistant/briefing")).toEqual([
      { period: "yesterday", locale: "en", refresh: false, write: false },
    ]);
    expect(screen.getByTestId("briefing-scope")).toHaveTextContent("Branch Chilonzor, Nov 23");
    const lines = screen.getAllByTestId("briefing-line");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent(/^💰 Payments received: UZS 1,500,000\.$/);
    expect(lines[1]).toHaveTextContent(
      "⚠️ 3 students were not marked in 1 group. Mark them on Today.",
    );
    expect(screen.getByTestId("briefing-note")).toHaveTextContent(/./);
    // Plain lines are not written by a model: nothing to write again.
    expect(screen.queryByTestId("briefing-refresh")).toBeNull();
    expect(screen.queryByTestId("briefing-writing")).toBeNull();
    expect(screen.getByTestId("briefing-value-payments")).toHaveTextContent("UZS 1,500,000");
    expect(screen.getByTestId("briefing-value-debtors")).toHaveTextContent("2");
    // One person, one view: no choice of view; one branch: no table of branches.
    expect(screen.queryByTestId("briefing-view-management")).toBeNull();
    expect(screen.queryByTestId("briefing-branches")).toBeNull();
    // The ask box belongs to the other tab.
    expect(screen.queryByTestId("assistant-input")).toBeNull();
  });

  it("spells a figure's lines: the total owed, a student, how many lessons were missed", async () => {
    serve({ briefings: [briefing()] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-stats")).toBeTruthy());
    const details = screen.getAllByTestId("briefing-detail");
    expect(details).toHaveLength(4);
    expect(details[0]).toHaveTextContent("Owed in totalUZS 900,000");
    expect(details[1]).toHaveTextContent("Aziz KarimovUZS 600,000");
    expect(details[2]).toHaveTextContent("GE-Morning A13");
    expect(details[3]).toHaveTextContent(/^Malika Saidova\s+GE-Morning A1\s*3 missed$/);
    expect(screen.getByTestId("briefing-stat-debtors")).toHaveTextContent(/and 1 more/);
  });

  it("opens what a figure counts, inside the app where the app has the page", async () => {
    serve({ briefings: [briefing()] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-stats")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("briefing-stat-open-debtors"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/debts");
    await fireEvent.press(screen.getByTestId("briefing-stat-open-payments"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/reports/student-payments");
    await fireEvent.press(screen.getAllByTestId("briefing-detail")[1]!);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });
    // "Not marked" opens Today on the day that was counted.
    await fireEvent.press(screen.getByTestId("briefing-stat-open-unmarked"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff",
      params: { date: "2026-11-23" },
    });
    // A figure with nowhere to go is not a button.
    mockPush.mockClear();
    await fireEvent.press(screen.getByTestId("briefing-stat-open-stoppedComing"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpenOnSite).not.toHaveBeenCalled();
  });

  it("shows the figures at once and the model's conclusion when it is written", async () => {
    let write: (value: Response) => void = () => undefined;
    const written = new Promise<Response>((resolve) => {
      write = resolve;
    });
    const first = briefing({ mode: "anthropic", model: "claude-opus-5-5", pending: true });
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method !== "POST") return answer(200, OFFICE);
      const body = sentBody(init) as { write: boolean };
      return body.write ? written : answer(200, first);
    });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-writing")).toBeTruthy());
    expect(screen.getByTestId("briefing-value-debtors")).toHaveTextContent("2");
    expect(screen.getByTestId("briefing-writing")).toHaveTextContent("Writing the conclusion…");
    expect(screen.queryByTestId("briefing-line")).toBeNull();
    expect(screen.queryByTestId("briefing-refresh")).toBeNull();
    await waitFor(() => expect(posted("/assistant/briefing")).toHaveLength(2));
    expect(posted("/assistant/briefing")[1]).toEqual({
      period: "yesterday",
      locale: "en",
      refresh: false,
      write: true,
    });

    await act(async () => {
      write(
        answer(200, {
          ...first,
          pending: false,
          conclusion: [{ text: "💰 A good day: 1.5 million came in." }],
        }),
      );
    });
    await waitFor(() => expect(screen.getByTestId("briefing-line")).toBeTruthy());
    expect(screen.getByTestId("briefing-line")).toHaveTextContent(
      "💰 A good day: 1.5 million came in.",
    );
    expect(screen.queryByTestId("briefing-writing")).toBeNull();
    expect(screen.getByTestId("briefing-note")).toHaveTextContent(/claude-opus-5-5/);

    // What a model wrote can be written again.
    await fireEvent.press(screen.getByTestId("briefing-refresh"));
    await waitFor(() => expect(posted("/assistant/briefing")).toHaveLength(3));
    expect(posted("/assistant/briefing")[2]).toEqual({
      period: "yesterday",
      locale: "en",
      refresh: true,
      write: true,
    });
  });

  it("keeps the figures with the plain lines when the model cannot be reached", async () => {
    serve({
      briefings: [
        briefing({ mode: "anthropic", model: "claude-opus-5-5", pending: true }),
        FAILED(),
      ],
    });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getAllByTestId("briefing-line")).toHaveLength(2));
    expect(screen.getByTestId("briefing-value-debtors")).toHaveTextContent("2");
    expect(screen.queryByTestId("briefing-problem")).toBeNull();
    expect(screen.queryByTestId("briefing-writing")).toBeNull();
    expect(screen.queryByTestId("briefing-refresh")).toBeNull();
    expect(screen.getByTestId("briefing-note")).not.toHaveTextContent(/claude-opus-5-5/);
  });

  it("says so when the summary did not come, and asks again on request", async () => {
    serve({ briefings: [FAILED(), briefing()] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-problem")).toBeTruthy());
    expect(screen.queryByTestId("briefing-stats")).toBeNull();
    await fireEvent.press(screen.getByTestId("briefing-retry"));
    await waitFor(() => expect(screen.getByTestId("briefing-stats")).toBeTruthy());
    expect(screen.queryByTestId("briefing-problem")).toBeNull();
  });

  it("asks again for another period, and for the other view of someone who has two", async () => {
    serve({
      briefings: [
        briefing({ views: ["management", "teaching"] }),
        briefing({
          views: ["management", "teaching"],
          period: "week",
          from: "2026-11-17",
          to: "2026-11-23",
        }),
        briefing({
          views: ["management", "teaching"],
          view: "teaching",
          period: "week",
          from: "2026-11-17",
          to: "2026-11-23",
          scope: { kind: "groups", name: "" },
        }),
      ],
    });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-view-teaching")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("briefing-period-week"));
    await waitFor(() =>
      expect(screen.getByTestId("briefing-scope")).toHaveTextContent(
        "Branch Chilonzor, Nov 17 to Nov 23",
      ),
    );
    expect(posted("/assistant/briefing")[1]).toEqual({
      period: "week",
      locale: "en",
      refresh: false,
      write: false,
    });
    await fireEvent.press(screen.getByTestId("briefing-view-teaching"));
    await waitFor(() =>
      expect(screen.getByTestId("briefing-scope")).toHaveTextContent(/^Your groups, Nov 17/),
    );
    expect(posted("/assistant/briefing")[2]).toEqual({
      view: "teaching",
      period: "week",
      locale: "en",
      refresh: false,
      write: false,
    });
  });

  it("lists the branches for someone who looks at several, without money for one who may not see it", async () => {
    serve({
      briefings: [
        briefing({
          scope: { kind: "centre", name: "Kampus" },
          branches: [
            { name: "Chilonzor", payments: 1200000, lessons: 8, absent: 2, unmarked: 0 },
            { name: "Yunusobod", payments: null, lessons: 5, absent: 1, unmarked: 4 },
          ],
        }),
      ],
    });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-branches")).toBeTruthy());
    expect(screen.getByTestId("briefing-branch-0")).toHaveTextContent(
      "ChilonzorPaymentsUZS 1,200,000Lessons8Absent2Not marked0",
    );
    expect(screen.getByTestId("briefing-branch-1")).toHaveTextContent(
      "YunusobodLessons5Absent1Not marked4",
    );
  });

  it("moves to the conversation and back with the tabs", async () => {
    serve({ briefings: [briefing()] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-stats")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("assistant-tab-chat"));
    expect(screen.getByTestId("assistant-input")).toBeTruthy();
    expect(screen.queryByTestId("briefing")).toBeNull();
    await fireEvent.press(screen.getByTestId("assistant-tab-summary"));
    await waitFor(() => expect(screen.getByTestId("briefing-stats")).toBeTruthy());
  });
});

describe("the assistant's button on Home", () => {
  const home = () => {
    fetchMock.mockImplementation(async () => answer(200, { items: [], total: 0, unread: 0 }));
    return renderScreen(<HeaderActions />);
  };

  it("carries a dot until today's summary was looked at, and opens on the summary", async () => {
    await home();
    await waitFor(() => expect(screen.getByTestId("summary-unseen")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("open-assistant"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/assistant",
      params: { tab: "summary" },
    });
  });

  it("has no dot once the summary was shown today", async () => {
    await AsyncStorage.setItem("kampus.summary.seen.u1", centreToday());
    await home();
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.getByTestId("open-assistant")).toBeTruthy();
    expect(screen.queryByTestId("summary-unseen")).toBeNull();
  });

  it("shows the dot again the day after, and to another person on the same phone", async () => {
    await AsyncStorage.setItem("kampus.summary.seen.u1", "2026-01-01");
    await AsyncStorage.setItem("kampus.summary.seen.u9", centreToday());
    await home();
    await waitFor(() => expect(screen.getByTestId("summary-unseen")).toBeTruthy());
  });

  it("is not there for someone the assistant is not for", async () => {
    mockPermissions = ["students.view"];
    await home();
    expect(screen.getByTestId("open-search")).toBeTruthy();
    expect(screen.queryByTestId("open-assistant")).toBeNull();
  });
});

describe("looking at the summary", () => {
  it("is noted for today once the figures are on the screen", async () => {
    mockParams = { tab: "summary" };
    serve({ briefings: [briefing()] });
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("briefing-stats")).toBeTruthy());
    await waitFor(async () =>
      expect(await AsyncStorage.getItem("kampus.summary.seen.u1")).toBe(centreToday()),
    );
  });

  it("is not noted by opening the conversation", async () => {
    serve({});
    await renderScreen(<AssistantScreen />);
    await waitFor(() => expect(screen.getByTestId("assistant-hint")).toBeTruthy());
    expect(await AsyncStorage.getItem("kampus.summary.seen.u1")).toBeNull();
  });
});
