import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { BoardView, LeadOptions, LeadSource } from "@/api/leads";
import { LeadsScreen } from "@/features/leads/leads-screen";
import { SourcesScreen } from "@/features/leads/sources-screen";
import { nativeRoute } from "@/features/office/site-paths";
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
 * The leads board's own set-up in the app (A-258): boards, columns and the
 * Sources report, as the site's Leads page has them. Each test plays the
 * server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockWide = false;
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockPermissions = ["leads.view", "leads.create", "leads.update", "leads.delete"];
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

const MAIN = { id: "bd1", branchId: "b1", branchName: "Chilonzor", name: "Main", leadCount: 0 };

function board(change: Partial<BoardView> = {}): BoardView {
  return {
    boards: [MAIN],
    board: MAIN,
    columns: [
      { id: "c1", name: "New", sortOrder: 0, total: 0, leads: [] },
      { id: "c2", name: "Trial", sortOrder: 1, total: 0, leads: [] },
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
  groups: [],
  courses: [],
  waiting: 0,
  unreadConversations: 0,
  boards: [],
};

async function showBoard(view: BoardView = board(), more: Routes = {}) {
  serve({ "GET /leads": view, "GET /leads/options": OPTIONS, ...more });
  await renderScreen(<LeadsScreen />);
  await screen.findByTestId("leads-menu");
  await screen.findByTestId("leads-search");
}

describe("the board's menu", () => {
  it("offers what the person may do with the board, and the Sources report", async () => {
    await showBoard();
    await fireEvent.press(screen.getByTestId("leads-menu"));
    expect(await screen.findByTestId("board-do-sources")).toHaveTextContent("Sources");
    expect(screen.getByTestId("board-do-new")).toHaveTextContent("New board");
    expect(screen.getByTestId("board-do-rename")).toHaveTextContent("Rename board");
    expect(screen.getByTestId("board-do-column")).toHaveTextContent("Add column");
    expect(screen.getByTestId("board-do-delete")).toHaveTextContent("Delete board");

    await fireEvent.press(screen.getByTestId("board-do-sources"));
    expect(mockPush).toHaveBeenCalledWith("/staff/leads/sources");
  });

  it("shows only the Sources report to someone who may only look", async () => {
    mockPermissions = ["leads.view"];
    await showBoard();
    expect(screen.queryByTestId("column-menu-c1")).toBeNull();
    await fireEvent.press(screen.getByTestId("leads-menu"));
    expect(await screen.findByTestId("board-do-sources")).toBeOnTheScreen();
    expect(screen.queryByTestId("board-do-new")).toBeNull();
    expect(screen.queryByTestId("board-do-rename")).toBeNull();
    expect(screen.queryByTestId("board-do-column")).toBeNull();
    expect(screen.queryByTestId("board-do-delete")).toBeNull();
  });

  it("keeps Delete board from someone who may change boards but not delete", async () => {
    mockPermissions = ["leads.view", "leads.update"];
    await showBoard();
    await fireEvent.press(screen.getByTestId("leads-menu"));
    expect(await screen.findByTestId("board-do-rename")).toBeOnTheScreen();
    expect(screen.queryByTestId("board-do-delete")).toBeNull();
  });

  it("makes a new board in the person's branch and shows it", async () => {
    const made = { ...MAIN, id: "bd2", name: "Summer camp" };
    await showBoard(board(), { "POST /lead-boards": made });
    await fireEvent.press(screen.getByTestId("leads-menu"));
    await fireEvent.press(await screen.findByTestId("board-do-new"));
    // One branch: there is nothing to choose.
    expect(screen.queryByTestId("board-new-branch")).toBeNull();

    await fireEvent.press(await screen.findByTestId("board-new-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    expect(calls("POST", "/lead-boards")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("board-new-name"), "  Summer camp ");
    await fireEvent.press(screen.getByTestId("board-new-save"));
    await waitFor(() => expect(calls("POST", "/lead-boards")).toHaveLength(1));
    expect(sentBody(calls("POST", "/lead-boards")[0]![1])).toEqual({
      name: "Summer camp",
      branchId: "b1",
    });
    // The board is asked for again, now the new one.
    await waitFor(() => expect(calls("GET", "/leads").at(-1)![0]).toContain("boardId=bd2"));
  });

  it("asks which branch a new board is for when the person has several", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    await showBoard(board(), { "POST /lead-boards": { ...MAIN, id: "bd3", branchId: "b2" } });
    await fireEvent.press(screen.getByTestId("leads-menu"));
    await fireEvent.press(await screen.findByTestId("board-do-new"));
    await fireEvent.press(await screen.findByTestId("board-new-branch"));
    await fireEvent.press(await screen.findByTestId("board-new-branch-option-b2"));
    await fireEvent.changeText(screen.getByTestId("board-new-name"), "Second");
    await fireEvent.press(screen.getByTestId("board-new-save"));
    await waitFor(() => expect(calls("POST", "/lead-boards")).toHaveLength(1));
    expect(sentBody(calls("POST", "/lead-boards")[0]![1])).toEqual({
      name: "Second",
      branchId: "b2",
    });
  });

  it("renames the board, and says so when the name is taken", async () => {
    let taken = true;
    await showBoard(board(), {
      "PATCH /lead-boards/bd1": () =>
        taken
          ? refusal(422, "errors.validation", { name: ["validation.duplicate"] })
          : { ...MAIN, name: "Autumn" },
    });
    await fireEvent.press(screen.getByTestId("leads-menu"));
    await fireEvent.press(await screen.findByTestId("board-do-rename"));
    const name = await screen.findByTestId("board-rename-name");
    expect(name.props.value).toBe("Main");
    await fireEvent.changeText(name, "Autumn");
    await fireEvent.press(screen.getByTestId("board-rename-save"));
    expect(await screen.findByText("This value is already in use.")).toBeOnTheScreen();

    taken = false;
    await fireEvent.press(screen.getByTestId("board-rename-save"));
    await waitFor(() => expect(calls("PATCH", "/lead-boards/bd1")).toHaveLength(2));
    expect(sentBody(calls("PATCH", "/lead-boards/bd1")[1]![1])).toEqual({ name: "Autumn" });
  });

  it("adds a column at the end of the board", async () => {
    await showBoard(board(), { "POST /lead-boards/bd1/columns": { id: "c3" } });
    await fireEvent.press(screen.getByTestId("leads-menu"));
    await fireEvent.press(await screen.findByTestId("board-do-column"));
    await fireEvent.changeText(await screen.findByTestId("column-new-name"), "Thinking");
    await fireEvent.press(screen.getByTestId("column-new-save"));
    await waitFor(() => expect(calls("POST", "/lead-boards/bd1/columns")).toHaveLength(1));
    expect(sentBody(calls("POST", "/lead-boards/bd1/columns")[0]![1])).toEqual({
      name: "Thinking",
    });
  });

  it("deletes the board after a question, and says why when the server keeps it", async () => {
    let held = true;
    await showBoard(board(), {
      "DELETE /lead-boards/bd1": () => (held ? refusal(409, "errors.boardHasLeads") : undefined),
    });
    await fireEvent.press(screen.getByTestId("leads-menu"));
    await fireEvent.press(await screen.findByTestId("board-do-delete"));
    expect(await screen.findByText("Delete board?")).toBeOnTheScreen();
    expect(calls("DELETE", "/lead-boards/bd1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("board-delete-confirm"));
    expect(await screen.findByText("The board still has leads.")).toBeOnTheScreen();

    held = false;
    await fireEvent.press(screen.getByTestId("board-delete-confirm"));
    await waitFor(() => expect(calls("DELETE", "/lead-boards/bd1")).toHaveLength(2));
  });

  it("offers New board where the centre has none, to whoever may make one", async () => {
    serve({
      "GET /leads": board({ boards: [], board: null, columns: [] }),
      "GET /leads/options": OPTIONS,
      "POST /lead-boards": MAIN,
    });
    await renderScreen(<LeadsScreen />);
    await fireEvent.press(await screen.findByTestId("board-create"));
    await fireEvent.changeText(await screen.findByTestId("board-new-name"), "Main");
    await fireEvent.press(screen.getByTestId("board-new-save"));
    await waitFor(() => expect(calls("POST", "/lead-boards")).toHaveLength(1));
  });

  it("has no New board there for someone who may only look", async () => {
    mockPermissions = ["leads.view"];
    serve({
      "GET /leads": board({ boards: [], board: null, columns: [] }),
      "GET /leads/options": OPTIONS,
    });
    await renderScreen(<LeadsScreen />);
    expect(await screen.findByText("No lead boards yet.")).toBeOnTheScreen();
    expect(screen.queryByTestId("board-create")).toBeNull();
  });
});

describe("a column's menu", () => {
  it("renames the column shown on a phone", async () => {
    await showBoard(board(), { "PATCH /lead-columns/c1": { id: "c1" } });
    await fireEvent.press(screen.getByTestId("column-menu-c1"));
    await fireEvent.press(await screen.findByTestId("column-do-rename"));
    const name = await screen.findByTestId("column-rename-name");
    expect(name.props.value).toBe("New");
    await fireEvent.changeText(name, "Fresh");
    await fireEvent.press(screen.getByTestId("column-rename-save"));
    await waitFor(() => expect(calls("PATCH", "/lead-columns/c1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/lead-columns/c1")[0]![1])).toEqual({ name: "Fresh" });
  });

  it("has a menu on every column of a tablet's board", async () => {
    mockWide = true;
    await showBoard(board(), { "PATCH /lead-columns/c2": { id: "c2" } });
    expect(screen.getByTestId("column-menu-c1")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("column-menu-c2"));
    await fireEvent.press(await screen.findByTestId("column-do-rename"));
    expect((await screen.findByTestId("column-rename-name")).props.value).toBe("Trial");
  });

  it("deletes a column after a question, and says why when the server keeps it", async () => {
    let held = true;
    await showBoard(board(), {
      "DELETE /lead-columns/c1": () => (held ? refusal(409, "errors.columnHasLeads") : undefined),
    });
    await fireEvent.press(screen.getByTestId("column-menu-c1"));
    await fireEvent.press(await screen.findByTestId("column-do-delete"));
    expect(await screen.findByText("Delete column?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("column-delete-confirm"));
    expect(await screen.findByText("The column still has leads.")).toBeOnTheScreen();

    held = false;
    await fireEvent.press(screen.getByTestId("column-delete-confirm"));
    await waitFor(() => expect(calls("DELETE", "/lead-columns/c1")).toHaveLength(2));
  });

  it("opens on its menu again after a rename was left half way", async () => {
    await showBoard();
    await fireEvent.press(screen.getByTestId("column-menu-c1"));
    await fireEvent.press(await screen.findByTestId("column-do-rename"));
    await fireEvent.press(await screen.findByTestId("column-rename-close"));
    await fireEvent.press(screen.getByTestId("column-menu-c1"));
    expect(await screen.findByTestId("column-do-delete")).toBeOnTheScreen();
  });
});

function source(change: Partial<LeadSource> = {}): LeadSource {
  return { id: "s1", name: "Instagram", isActive: true, leadCount: 14, studentCount: 3, ...change };
}

describe("the Sources report", () => {
  it("lists each source with its leads and students, and narrows the days", async () => {
    serve({
      "GET /lead-sources": [
        source(),
        source({ id: "s2", name: "Flyers", isActive: false, leadCount: 0, studentCount: 0 }),
      ],
    });
    await renderScreen(<SourcesScreen />);
    const card = await screen.findByTestId("source-s1");
    expect(card).toHaveTextContent(/Instagram/);
    expect(screen.getByTestId("source-count-s1")).toHaveTextContent("14");
    expect(card).toHaveTextContent(/3 students/);
    expect(screen.getByTestId("source-s2")).toHaveTextContent(/Inactive/);
    expect(calls("GET", "/lead-sources")[0]![0]).not.toContain("from=");

    await fireEvent.changeText(screen.getByTestId("sources-from"), "01112026");
    await waitFor(() =>
      expect(calls("GET", "/lead-sources").at(-1)![0]).toContain("from=2026-11-01"),
    );
  });

  it("adds a source", async () => {
    serve({ "GET /lead-sources": [], "POST /lead-sources": source({ id: "s9" }) });
    await renderScreen(<SourcesScreen />);
    expect(await screen.findByText("Nothing found.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("sources-add"));
    await fireEvent.press(await screen.findByTestId("source-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("source-name"), " Telegram ");
    await fireEvent.press(screen.getByTestId("source-save"));
    await waitFor(() => expect(calls("POST", "/lead-sources")).toHaveLength(1));
    expect(sentBody(calls("POST", "/lead-sources")[0]![1])).toEqual({
      name: "Telegram",
      isActive: true,
    });
  });

  it("renames a source, switches it off, and deletes one after a question", async () => {
    serve({
      "GET /lead-sources": [source()],
      "PATCH /lead-sources/s1": source({ isActive: false }),
      "DELETE /lead-sources/s1": undefined,
    });
    await renderScreen(<SourcesScreen />);
    await fireEvent.press(await screen.findByTestId("source-s1"));
    const name = await screen.findByTestId("source-name");
    expect(name.props.value).toBe("Instagram");
    await fireEvent.changeText(name, "Instagram ads");
    await fireEvent.press(screen.getByTestId("source-active"));
    await fireEvent.press(screen.getByTestId("source-save"));
    await waitFor(() => expect(calls("PATCH", "/lead-sources/s1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/lead-sources/s1")[0]![1])).toEqual({
      name: "Instagram ads",
      isActive: false,
    });

    await fireEvent.press(await screen.findByTestId("source-s1"));
    await fireEvent.press(await screen.findByTestId("source-delete"));
    expect(await screen.findByText("Delete source?")).toBeOnTheScreen();
    expect(calls("DELETE", "/lead-sources/s1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("source-delete-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/lead-sources/s1")).toHaveLength(1));
  });

  it("only shows the report to someone who may not change sources", async () => {
    mockPermissions = ["leads.view"];
    serve({ "GET /lead-sources": [source()] });
    await renderScreen(<SourcesScreen />);
    await fireEvent.press(await screen.findByTestId("source-s1"));
    expect(screen.queryByTestId("sources-add")).toBeNull();
    expect(screen.queryByTestId("source-name")).toBeNull();
  });

  it("opens from the site's address in the app", () => {
    expect(nativeRoute("/leads/sources")).toBe("/staff/leads/sources");
  });
});
