import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { keys, useToday } from "@/api/hooks";
import type { Today, TodayLesson } from "@/api/types";
import { LessonPanel } from "@/features/staff/lesson-panel";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const lesson: TodayLesson = {
  id: "lesson-1",
  groupId: "group-1",
  groupName: "GE-Morning A1",
  courseName: "General English",
  color: null,
  date: "2026-11-23",
  startTime: "09:00",
  endTime: "10:30",
  roomName: "Room 101",
  topic: null,
  suggestedTopic: null,
  isExtra: false,
  teacherNames: ["Demo Teacher"],
  members: [
    {
      membershipId: "m-1",
      studentId: "s-1",
      fullName: "Aziza Karimova",
      status: "ACTIVE",
      attendance: "NOT_MARKED",
      comment: null,
      balance: null,
    },
    {
      membershipId: "m-2",
      studentId: "s-2",
      fullName: "Bobur Aliyev",
      status: "ACTIVE",
      attendance: "NOT_MARKED",
      comment: null,
      balance: null,
    },
  ],
  present: 0,
  marked: 0,
  homework: null,
};

const day: Today = {
  date: "2026-11-23",
  today: "2026-11-23",
  lessons: [lesson],
  next: null,
  debtors: [],
  debtorCount: 0,
  debtTotal: 0,
  canMark: true,
  canSeeBalances: false,
};

const fetchMock = jest.fn();
const clients: QueryClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

function answer(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

/** The panel as a screen shows it: fed from the cached day, so a tap is seen at once. */
function Harness() {
  const query = useToday(null);
  const current = query.data?.lessons[0];
  return current ? <LessonPanel lesson={current} canMark canSeeBalances={false} /> : null;
}

async function renderPanel() {
  const client = new QueryClient({
    // No timers left behind: nothing goes stale or is collected while a test runs.
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  client.setQueryData(keys.today(null), day);
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
            <Harness />
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return client;
}

beforeEach(() => {
  fetchMock.mockReset();
  // Everything the panel reads besides the day itself: no video, an empty month.
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") return answer(204);
    if (url.includes("/video"))
      return answer(200, { enabled: false, room: null, todayLesson: null });
    return answer(200, { month: "2026-11", lessons: [], members: [] });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const puts = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT");

describe("marking a lesson", () => {
  it("marks one student with one tap, shown at once and sent to the server", async () => {
    await renderPanel();
    expect(await screen.findByText("0 of 2 marked · 0 present")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("mark-PRESENT-m-1"));

    expect(await screen.findByText("1 of 2 marked · 1 present")).toBeTruthy();
    await waitFor(() => expect(puts()).toHaveLength(1));
    const [url, init] = puts()[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/lessons\/lesson-1\/attendance$/);
    expect(JSON.parse(String(init.body))).toEqual({
      marks: [{ membershipId: "m-1", status: "PRESENT" }],
    });
  });

  it("clears a mark when the chosen one is tapped again", async () => {
    await renderPanel();
    await fireEvent.press(await screen.findByTestId("mark-ABSENT-m-2"));
    expect(await screen.findByText("1 of 2 marked · 0 present")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("mark-ABSENT-m-2"));
    expect(await screen.findByText("0 of 2 marked · 0 present")).toBeTruthy();
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(JSON.parse(String((puts()[1] as [string, RequestInit])[1].body))).toEqual({
      marks: [{ membershipId: "m-2", status: "NOT_MARKED" }],
    });
  });

  it("marks everyone still unmarked as present, and leaves the others as they are", async () => {
    await renderPanel();
    await fireEvent.press(await screen.findByTestId("mark-EXCUSED-m-1"));
    await fireEvent.press(screen.getByTestId("all-present"));
    expect(await screen.findByText("2 of 2 marked · 1 present")).toBeTruthy();
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(JSON.parse(String((puts()[1] as [string, RequestInit])[1].body))).toEqual({
      marks: [{ membershipId: "m-2", status: "PRESENT" }],
    });
    // Nobody is left to mark, so the button goes away.
    expect(screen.queryByTestId("all-present")).toBeNull();
  });

  it("goes back to what the server has and says so when the mark is refused", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } });
      }
      if (url.includes("/video"))
        return answer(200, { enabled: false, room: null, todayLesson: null });
      return answer(200, { month: "2026-11", lessons: [], members: [] });
    });
    await renderPanel();
    await fireEvent.press(await screen.findByTestId("mark-PRESENT-m-1"));
    expect(await screen.findByTestId("lesson-error")).toBeTruthy();
    expect(await screen.findByText("0 of 2 marked · 0 present")).toBeTruthy();
  });
});
