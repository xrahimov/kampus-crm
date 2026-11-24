import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { BoardView, Lead, LeadOptions } from "@/api/leads";
import { LeadsScreen } from "@/features/leads/leads-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
let mockPermissions: string[] = [];
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
jest.mock("@/lib/save-file", () => ({ saveFile: async () => "opened" }));
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockBranches[0],
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
let mockWide = false;
jest.mock("@/lib/layout", () => ({
  useLayout: () => ({ wide: mockWide, width: mockWide ? 1180 : 390 }),
}));

/*
 * Several leads ticked on the board and one thing done to all of them, and an
 * SMS to a whole column (A-259), as the site's Leads page has them. Each test
 * plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockWide = false;
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockPermissions = ["leads.view", "leads.update", "groups.update", "sms.send"];
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

/** A refusal the server gives: its status and its code. */
const refusal = (status: number, code: string, fields?: Record<string, string[]>) =>
  answer(status, { error: { code, message: code, fields } });

type Routes = Record<string, unknown | ((url: string) => unknown)>;
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
    if (body && typeof body === "object" && "ok" in body && "status" in body) {
      return body as Response;
    }
    return answer(body === undefined ? 204 : 200, body);
  });
}

function lead(change: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    branchId: "b1",
    boardId: "bd1",
    columnId: "c1",
    fullName: "Madina Yusupova",
    phones: ["+998901112233"],
    birthDate: null,
    age: 17,
    sourceId: "s1",
    sourceName: "Instagram",
    teacherId: null,
    teacherName: null,
    referrerId: null,
    referrerName: null,
    days: "ODD",
    lessonTime: "09:00",
    status: "NEW",
    temperature: "HOT",
    comment: "Wants IELTS",
    ownerId: "u1",
    ownerName: "Dilnoza Karimova",
    nextContactAt: "2026-11-20",
    lastContactAt: null,
    lastOutcome: null,
    trial: null,
    sortOrder: 0,
    isArchived: false,
    studentId: null,
    convertedAt: null,
    formName: null,
    createdAt: "2026-11-18T08:00:00.000Z",
    ...change,
  };
}

const MAIN = { id: "bd1", branchId: "b1", branchName: "Chilonzor", name: "Main", leadCount: 3 };

function board(change: Partial<BoardView> = {}): BoardView {
  return {
    boards: [MAIN],
    board: MAIN,
    columns: [
      {
        id: "c1",
        name: "New",
        sortOrder: 0,
        total: 2,
        leads: [lead(), lead({ id: "l2", fullName: "Bobur Rahimov" })],
      },
      {
        id: "c2",
        name: "Trial",
        sortOrder: 1,
        total: 1,
        leads: [lead({ id: "l3", columnId: "c2", fullName: "Zarina Aliyeva" })],
      },
    ],
    due: 0,
    today: "2026-11-24",
    ...change,
  };
}

const OPTIONS: LeadOptions = {
  teachers: [],
  sources: [],
  lessonTimes: [],
  owners: [],
  groups: [
    { id: "g1", name: "IELTS Morning", branchId: "b1" },
    { id: "g9", name: "Yunusobod group", branchId: "b9" },
  ],
  courses: [],
  waiting: 0,
  unreadConversations: 0,
  boards: [],
};

async function showBoard(view: BoardView = board(), more: Routes = {}) {
  serve({ "GET /leads": view, "GET /leads/options": OPTIONS, ...more });
  await renderScreen(<LeadsScreen />);
  await screen.findByTestId("leads-search");
  await screen.findByTestId("lead-l1");
}

const FORBIDDEN = "You do not have permission to do this.";
const tick = (id: string) => fireEvent.press(screen.getByTestId(`lead-tick-${id}`));

describe("ticking leads on the board", () => {
  it("shows the bar only once a lead is ticked, and counts them", async () => {
    await showBoard();
    expect(screen.queryByTestId("leads-bulk")).toBeNull();
    await tick("l1");
    expect(await screen.findByTestId("leads-bulk-count")).toHaveTextContent("1 selected");
    await tick("l2");
    expect(screen.getByTestId("leads-bulk-count")).toHaveTextContent("2 selected");
    await tick("l1");
    expect(screen.getByTestId("leads-bulk-count")).toHaveTextContent("1 selected");
    await fireEvent.press(screen.getByTestId("bulk-clear"));
    expect(screen.queryByTestId("leads-bulk")).toBeNull();
  });

  it("has no tick boxes for someone who may only look", async () => {
    mockPermissions = ["leads.view"];
    await showBoard();
    expect(screen.queryByTestId("lead-tick-l1")).toBeNull();
    expect(screen.queryByTestId("leads-bulk")).toBeNull();
  });

  it("opens a lead's card from its row, not its tick", async () => {
    await showBoard();
    await tick("l1");
    expect(screen.queryByTestId("lead-card")).toBeNull();
    expect(screen.getByTestId("leads-bulk")).toBeOnTheScreen();
  });

  it("keeps ticks across the columns of a tablet's board", async () => {
    mockWide = true;
    await showBoard();
    await tick("l1");
    await tick("l3");
    expect(screen.getByTestId("leads-bulk-count")).toHaveTextContent("2 selected");
  });

  it("moves the ticked leads to another column and says what came of it", async () => {
    await showBoard(board(), { "POST /leads/bulk": { done: 2, skipped: 0 } });
    await tick("l1");
    await tick("l2");
    await fireEvent.press(screen.getByTestId("bulk-move"));
    await fireEvent.press(await screen.findByTestId("bulk-move-c2"));
    await waitFor(() => expect(calls("POST", "/leads/bulk")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/bulk")[0]![1])).toEqual({
      action: "move",
      columnId: "c2",
      leadIds: ["l1", "l2"],
    });
    expect(await screen.findByTestId("leads-bulk-note")).toHaveTextContent("2 done, 0 skipped.");
    expect(screen.queryByTestId("leads-bulk")).toBeNull();
  });

  it("shows that the move is under way until the server answers", async () => {
    await showBoard();
    let finish: (response: Response) => void = () => undefined;
    const usual = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      init?.method === "POST" && url.endsWith("/leads/bulk")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : usual(url, init),
    );
    await tick("l1");
    await fireEvent.press(screen.getByTestId("bulk-move"));
    await fireEvent.press(await screen.findByTestId("bulk-move-c2"));
    expect(await screen.findByTestId("bulk-move-busy")).toBeOnTheScreen();
    expect(screen.queryByTestId("bulk-move-c2")).toBeNull();
    finish(answer(200, { done: 1, skipped: 0 }) as Response);
    expect(await screen.findByTestId("leads-bulk-note")).toHaveTextContent("1 done, 0 skipped.");
  });

  it("has no Move to on a board of one column", async () => {
    const view = board();
    await showBoard({ ...view, columns: [view.columns[0]!] });
    await tick("l1");
    expect(screen.getByTestId("leads-bulk")).toBeOnTheScreen();
    expect(screen.queryByTestId("bulk-move")).toBeNull();
  });

  it("archives the ticked leads after a question", async () => {
    await showBoard(board(), { "POST /leads/bulk": { done: 1, skipped: 1 } });
    await tick("l1");
    await tick("l2");
    await fireEvent.press(screen.getByTestId("bulk-archive"));
    expect(await screen.findByText("Archive 2 leads?")).toBeOnTheScreen();
    expect(calls("POST", "/leads/bulk")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("bulk-confirm-confirm"));
    await waitFor(() => expect(calls("POST", "/leads/bulk")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/bulk")[0]![1])).toEqual({
      action: "archive",
      leadIds: ["l1", "l2"],
    });
    expect(await screen.findByTestId("leads-bulk-note")).toHaveTextContent("1 done, 1 skipped.");
  });

  it("says why when the server refuses, and keeps the ticks", async () => {
    await showBoard(board(), {
      "POST /leads/bulk": () => refusal(403, "errors.forbidden"),
    });
    await tick("l1");
    await fireEvent.press(screen.getByTestId("bulk-archive"));
    await fireEvent.press(await screen.findByTestId("bulk-confirm-confirm"));
    await waitFor(() => expect(calls("POST", "/leads/bulk")).toHaveLength(1));
    expect(await screen.findByText(FORBIDDEN)).toBeOnTheScreen();
    expect(screen.getByTestId("leads-bulk-count")).toHaveTextContent("1 selected");
    expect(screen.queryByTestId("leads-bulk-note")).toBeNull();
  });

  it("only brings leads back in the archive", async () => {
    const gone = lead({ isArchived: true });
    serve({
      "GET /leads": (url: string) =>
        url.includes("archived=true")
          ? board({
              columns: [{ id: "c1", name: "New", sortOrder: 0, total: 1, leads: [gone] }],
            })
          : board(),
      "GET /leads/options": OPTIONS,
      "POST /leads/bulk": { done: 1, skipped: 0 },
    });
    await renderScreen(<LeadsScreen />);
    await screen.findByTestId("lead-l1");
    await tick("l2");
    await fireEvent.press(screen.getByTestId("leads-archived"));
    await waitFor(() =>
      expect(calls("GET", "/leads").some(([url]) => url.includes("archived=true"))).toBe(true),
    );
    // The ticks of the board do not follow into the archive.
    await waitFor(() => expect(screen.queryByTestId("leads-bulk")).toBeNull());
    await tick("l1");
    expect(screen.getByTestId("bulk-archive")).toHaveTextContent("Restore");
    expect(screen.queryByTestId("bulk-move")).toBeNull();
    expect(screen.queryByTestId("bulk-sms")).toBeNull();
    await fireEvent.press(screen.getByTestId("bulk-archive"));
    expect(await screen.findByText("Restore 1 leads?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("bulk-confirm-confirm"));
    await waitFor(() => expect(calls("POST", "/leads/bulk")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/bulk")[0]![1])).toEqual({
      action: "restore",
      leadIds: ["l1"],
    });
  });

  it("sends one SMS to the ticked leads", async () => {
    await showBoard(board(), {
      "POST /sms/count": { count: 2, skipped: 0, sample: ["Madina Yusupova", "Bobur Rahimov"] },
      "GET /sms-templates": [],
      "POST /sms/send": { total: 2, sent: 2, failed: 0, skipped: 0, adapter: "fake" },
    });
    await tick("l1");
    await tick("l2");
    await fireEvent.press(screen.getByTestId("bulk-sms"));
    expect(await screen.findByText("SMS to 2 leads")).toBeOnTheScreen();
    await waitFor(() => expect(calls("POST", "/sms/count")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms/count")[0]![1])).toEqual({
      target: { kind: "leads", leadIds: ["l1", "l2"] },
    });
    await fireEvent.changeText(
      await screen.findByTestId("bulk-sms-sheet-text"),
      "Open day on Sunday",
    );
    await fireEvent.press(screen.getByTestId("bulk-sms-sheet-send"));
    await waitFor(() => expect(calls("POST", "/sms/send")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms/send")[0]![1])).toEqual({
      target: { kind: "leads", leadIds: ["l1", "l2"] },
      text: "Open day on Sunday",
    });
    expect(await screen.findByTestId("bulk-sms-sheet-result")).toHaveTextContent(/Sent: 2/);
  });

  it("keeps Send SMS from someone who may not send them", async () => {
    mockPermissions = ["leads.view", "leads.update"];
    await showBoard();
    await tick("l1");
    expect(screen.getByTestId("bulk-archive")).toBeOnTheScreen();
    expect(screen.queryByTestId("bulk-sms")).toBeNull();
    expect(screen.queryByTestId("bulk-group")).toBeNull();
  });

  it("makes the ticked leads students of a group of the board's branch", async () => {
    await showBoard(board(), { "POST /leads/add-to-group": { added: 1, skipped: 1 } });
    await tick("l1");
    await tick("l2");
    expect(screen.getByTestId("bulk-group")).toHaveTextContent("Add leads to group (2)");
    await fireEvent.press(screen.getByTestId("bulk-group"));
    expect(
      await screen.findByText("2 selected leads become students of the chosen group."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("bulk-join-group"));
    expect(await screen.findByTestId("bulk-join-group-option-g1")).toBeOnTheScreen();
    expect(screen.queryByTestId("bulk-join-group-option-g9")).toBeNull();
    await fireEvent.press(screen.getByTestId("bulk-join-group-option-g1"));
    await fireEvent.changeText(screen.getByTestId("bulk-join-day"), "01.12.2026");
    await fireEvent.press(screen.getByTestId("bulk-join-save"));
    await waitFor(() => expect(calls("POST", "/leads/add-to-group")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/add-to-group")[0]![1])).toEqual({
      leadIds: ["l1", "l2"],
      groupId: "g1",
      joinedAt: "2026-12-01",
      status: "NEW",
    });
    expect(await screen.findByTestId("leads-bulk-note")).toHaveTextContent(
      "1 added, 1 skipped (already in the group).",
    );
    expect(screen.queryByTestId("leads-bulk")).toBeNull();
  });
});

describe("an SMS to a whole column", () => {
  it("goes to everyone in the column", async () => {
    await showBoard(board(), {
      "POST /sms/count": { count: 2, skipped: 0, sample: ["Madina Yusupova"] },
      "GET /sms-templates": [],
      "POST /sms/send": { total: 2, sent: 2, failed: 0, skipped: 0, adapter: "fake" },
    });
    await fireEvent.press(screen.getByTestId("column-menu-c1"));
    expect(await screen.findByTestId("column-do-sms")).toHaveTextContent("SMS to the whole column");
    await fireEvent.press(screen.getByTestId("column-do-sms"));
    expect(await screen.findByText("SMS: New")).toBeOnTheScreen();
    await waitFor(() => expect(calls("POST", "/sms/count")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms/count")[0]![1])).toEqual({
      target: { kind: "leadColumn", columnId: "c1" },
    });
    await fireEvent.changeText(await screen.findByTestId("column-sms-text"), "Hello");
    await fireEvent.press(screen.getByTestId("column-sms-send"));
    await waitFor(() => expect(calls("POST", "/sms/send")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms/send")[0]![1])).toEqual({
      target: { kind: "leadColumn", columnId: "c1" },
      text: "Hello",
    });
  });

  it("is not offered for an empty column", async () => {
    const view = board();
    serve({
      "GET /leads": {
        ...view,
        columns: [{ id: "c1", name: "New", sortOrder: 0, total: 0, leads: [] }, view.columns[1]!],
      },
      "GET /leads/options": OPTIONS,
    });
    await renderScreen(<LeadsScreen />);
    await fireEvent.press(await screen.findByTestId("column-menu-c1"));
    expect(await screen.findByTestId("column-do-rename")).toBeOnTheScreen();
    expect(screen.queryByTestId("column-do-sms")).toBeNull();
  });

  it("is kept from someone who may not send SMS", async () => {
    mockPermissions = ["leads.view", "leads.update"];
    await showBoard();
    await fireEvent.press(screen.getByTestId("column-menu-c1"));
    expect(await screen.findByTestId("column-do-rename")).toBeOnTheScreen();
    expect(screen.queryByTestId("column-do-sms")).toBeNull();
  });
});
