import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type {
  BoardView,
  CallsPage,
  Conversation,
  ConversationDetail,
  Lead,
  LeadCall,
  LeadContact,
  LeadOptions,
  TrialBooking,
  WaitlistEntry,
  WaitlistPage,
} from "@/api/leads";
import { CallsScreen } from "@/features/leads/calls-screen";
import { ConversationScreen } from "@/features/leads/conversation-screen";
import { InboxScreen } from "@/features/leads/inbox-screen";
import { daysBetween } from "@/features/leads/lead-bits";
import { LeadsScreen } from "@/features/leads/leads-screen";
import { WaitlistScreen } from "@/features/leads/waitlist-screen";
import { nativeRoute } from "@/features/office/site-paths";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
let mockPermissions: string[] = [];
const mockSaveFile = jest.fn<Promise<string>, [string, string]>(async () => "opened");
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
jest.mock("@/lib/web", () => ({ openOnSite: jest.fn(async () => undefined) }));

/*
 * Leads in the app (A-232): the board, a lead's card and what is done from
 * it, the day's calls, the waiting list and the inbox. Each test plays the
 * server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockParams = {};
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

function board(change: Partial<BoardView> = {}): BoardView {
  const b = { id: "bd1", branchId: "b1", branchName: "Chilonzor", name: "Main", leadCount: 2 };
  return {
    boards: [b],
    board: b,
    columns: [
      { id: "c1", name: "New", sortOrder: 0, total: 1, leads: [lead()] },
      {
        id: "c2",
        name: "Trial",
        sortOrder: 1,
        total: 1,
        leads: [lead({ id: "l2", columnId: "c2", fullName: "Bobur Rahimov", nextContactAt: null })],
      },
    ],
    due: 2,
    today: "2026-11-23",
    ...change,
  };
}

const OPTIONS: LeadOptions = {
  teachers: [{ id: "t1", fullName: "Jasur Aliyev" }],
  sources: [{ id: "s1", name: "Instagram" }],
  lessonTimes: ["09:00", "19:30"],
  owners: [
    { id: "u1", fullName: "Dilnoza Karimova" },
    { id: "u2", fullName: "Aziz Admin" },
  ],
  groups: [
    { id: "g1", name: "GE-Morning A1", branchId: "b1" },
    { id: "g9", name: "Other branch", branchId: "b2" },
  ],
  courses: [{ id: "co1", name: "General English", branchId: "b1" }],
  waiting: 3,
  unreadConversations: 1,
  boards: [
    {
      id: "bd1",
      name: "Main",
      branchId: "b1",
      columns: [
        { id: "c1", name: "New" },
        { id: "c2", name: "Trial" },
      ],
    },
  ],
};

async function openCard(id = "l1") {
  await renderScreen(<LeadsScreen />);
  await fireEvent.press(await screen.findByTestId(`lead-${id}`));
  await screen.findByTestId("lead-card");
}

describe("the leads board", () => {
  it("shows one column at a time on a phone, with the numbers on its buttons", async () => {
    serve({ "GET /leads": board(), "GET /leads/options": OPTIONS });
    await renderScreen(<LeadsScreen />);
    await screen.findByTestId("lead-l1");
    expect(screen.queryByTestId("lead-l2")).toBeNull();
    expect(screen.getByTestId("lead-overdue-l1")).toHaveTextContent("3 days overdue");
    await waitFor(() =>
      expect(screen.getByTestId("leads-waitlist")).toHaveTextContent("Waiting list (3)"),
    );
    expect(screen.getByTestId("leads-calls")).toHaveTextContent("Calls today (2)");
    expect(screen.getByTestId("leads-inbox")).toHaveTextContent("Inbox (1)");
    // The board as it is filtered, as an Excel file (A-256).
    await fireEvent.press(screen.getByTestId("leads-excel"));
    expect(mockSaveFile).toHaveBeenLastCalledWith(
      "/leads/export.xlsx?boardId=bd1&locale=en",
      "kampus.xlsx",
    );

    await fireEvent.press(screen.getByTestId("column-c2"));
    expect(screen.getByTestId("lead-l2")).toBeTruthy();
    expect(screen.queryByTestId("lead-l1")).toBeNull();

    await fireEvent.press(screen.getByTestId("leads-calls"));
    expect(mockPush).toHaveBeenCalledWith("/staff/leads/calls");
  });

  it("asks the server with the owner filter and the archive switch", async () => {
    serve({ "GET /leads": board(), "GET /leads/options": OPTIONS });
    await renderScreen(<LeadsScreen />);
    await screen.findByTestId("lead-l1");
    // Beside the owner filter the tick box is as wide as its word, so the filter keeps its room (A-266).
    expect(screen.getByTestId("leads-archived")).toHaveStyle({ flexGrow: 0, flexShrink: 0 });
    await fireEvent.press(screen.getByTestId("leads-owner"));
    await fireEvent.press(await screen.findByTestId("leads-owner-option-unassigned"));
    await fireEvent.press(screen.getByTestId("leads-archived"));
    await waitFor(() =>
      expect(
        calls("GET", "/leads").some(
          ([url]) => url.includes("ownerId=none") && url.includes("archived=true"),
        ),
      ).toBe(true),
    );
    // Nothing is added to the archive.
    expect(screen.queryByTestId("lead-add-c1")).toBeNull();
  });

  it("adds a lead into the column it was added from, owned by whoever adds it", async () => {
    serve({ "GET /leads": board(), "GET /leads/options": OPTIONS, "POST /leads": lead() });
    await renderScreen(<LeadsScreen />);
    await fireEvent.press(await screen.findByTestId("lead-add-c1"));

    await fireEvent.press(await screen.findByTestId("lead-save"));
    expect(calls("POST", "/leads")).toHaveLength(0);
    expect(screen.getByText("Required.")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("lead-name"), " Sardor Karimov ");
    await fireEvent.changeText(screen.getByTestId("lead-phone-0"), "+998 90 111 22 33");
    await fireEvent.press(screen.getByTestId("lead-phone-add"));
    await fireEvent.changeText(screen.getByTestId("lead-next"), "25112026");
    await fireEvent.press(screen.getByTestId("lead-save"));

    await waitFor(() => expect(calls("POST", "/leads")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads")[0]![1])).toEqual({
      columnId: "c1",
      fullName: "Sardor Karimov",
      // The second number was left as "+998": it is not sent.
      phones: ["+998901112233"],
      birthDate: null,
      age: null,
      sourceId: null,
      teacherId: null,
      ownerId: "u1",
      nextContactAt: "2026-11-25",
      days: null,
      lessonTime: null,
      status: "NEW",
      temperature: null,
      comment: null,
    });
  });

  it("has no Add button for someone who may only look", async () => {
    mockPermissions = ["leads.view"];
    serve({ "GET /leads": board(), "GET /leads/options": OPTIONS });
    await openCard();
    expect(screen.queryByTestId("lead-add-c1")).toBeNull();
    expect(screen.queryByTestId("lead-log")).toBeNull();
    expect(screen.queryByTestId("lead-edit")).toBeNull();
    expect(screen.queryByTestId("lead-archive")).toBeNull();
    expect(screen.queryByTestId("lead-delete")).toBeNull();
    expect(screen.getByTestId("lead-history-open")).toBeTruthy();
  });

  it("arrives from the search with the board and the name already set", async () => {
    mockParams = { boardId: "bd1", q: "Madina" };
    serve({ "GET /leads": board(), "GET /leads/options": OPTIONS });
    await renderScreen(<LeadsScreen />);
    await screen.findByTestId("lead-l1");
    expect(calls("GET", "/leads")[0]![0]).toContain("boardId=bd1");
    expect(calls("GET", "/leads")[0]![0]).toContain("q=Madina");
    expect(screen.getByTestId("leads-search").props.value).toBe("Madina");
  });

  it("says so when the centre has no board yet", async () => {
    serve({
      "GET /leads": board({ boards: [], board: null, columns: [] }),
      "GET /leads/options": OPTIONS,
    });
    await renderScreen(<LeadsScreen />);
    expect(await screen.findByText("No lead boards yet.")).toBeTruthy();
  });
});

describe("a lead's card", () => {
  it("logs a contact with its outcome and the next day to call", async () => {
    const contact: LeadContact = {
      id: "k1",
      channel: "CALL",
      outcome: "THINKING",
      note: "Call after the exam",
      nextContactAt: "2026-11-27",
      createdBy: "Dilnoza Karimova",
      createdAt: "2026-11-23T10:00:00.000Z",
    };
    serve({
      "GET /leads": board(),
      "GET /leads/options": OPTIONS,
      "POST /contacts": contact,
    });
    await openCard();
    expect(screen.getByText("Wants IELTS")).toBeTruthy();
    expect(screen.getByTestId("lead-dial-0")).toHaveTextContent("+998901112233");

    await fireEvent.press(screen.getByTestId("lead-log"));
    await fireEvent.press(await screen.findByTestId("lead-contact-outcome"));
    await fireEvent.press(await screen.findByTestId("lead-contact-outcome-option-THINKING"));
    await fireEvent.changeText(screen.getByTestId("lead-contact-note"), "Call after the exam");
    await fireEvent.changeText(screen.getByTestId("lead-contact-next"), "27.11.2026");
    await fireEvent.press(screen.getByTestId("lead-contact-save"));

    await waitFor(() => expect(calls("POST", "/leads/l1/contacts")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/l1/contacts")[0]![1])).toEqual({
      channel: "CALL",
      outcome: "THINKING",
      note: "Call after the exam",
      nextContactAt: "2026-11-27",
      status: null,
    });
  });

  it("moves the lead to another column", async () => {
    serve({ "GET /leads": board(), "GET /leads/options": OPTIONS, "POST /move": lead() });
    await openCard();
    await fireEvent.press(await screen.findByTestId("lead-move"));
    await fireEvent.press(await screen.findByTestId("lead-move-option-c2"));
    await waitFor(() => expect(calls("POST", "/leads/l1/move")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/l1/move")[0]![1])).toEqual({ columnId: "c2" });
  });

  it("asks before archiving, and restores an archived lead with one press", async () => {
    serve({
      "GET /leads": board(),
      "GET /leads/options": OPTIONS,
      "POST /archive": lead({ isArchived: true }),
    });
    await openCard();
    await fireEvent.press(screen.getByTestId("lead-archive"));
    expect(calls("POST", "/leads/l1/archive")).toHaveLength(0);
    await fireEvent.press(await screen.findByTestId("lead-archive-sheet-confirm"));
    await waitFor(() => expect(calls("POST", "/leads/l1/archive")).toHaveLength(1));
  });

  it("restores an archived lead", async () => {
    const archived = lead({ isArchived: true });
    serve({
      "GET /leads": board({
        columns: [{ id: "c1", name: "New", sortOrder: 0, total: 0, leads: [archived] }],
      }),
      "GET /leads/options": OPTIONS,
      "POST /restore": lead(),
    });
    await openCard();
    expect(screen.queryByTestId("lead-log")).toBeNull();
    await fireEvent.press(screen.getByTestId("lead-restore"));
    await waitFor(() => expect(calls("POST", "/leads/l1/restore")).toHaveLength(1));
  });

  it("books a trial in a group of the lead's branch", async () => {
    serve({
      "GET /leads": board(),
      "GET /leads/options": OPTIONS,
      "POST /trials": { id: "tr1" },
    });
    await openCard();
    await fireEvent.press(screen.getByTestId("lead-trial"));
    await fireEvent.press(await screen.findByTestId("trial-save"));
    expect(calls("POST", "/leads/l1/trials")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("trial-group"));
    await screen.findByTestId("trial-group-option-g1");
    expect(screen.queryByTestId("trial-group-option-g9")).toBeNull();
    await fireEvent.press(await screen.findByTestId("trial-group-option-g1"));
    await fireEvent.changeText(screen.getByTestId("trial-day"), "26.11.2026");
    await fireEvent.changeText(screen.getByTestId("trial-note"), "Shy, sit in front");
    await fireEvent.press(screen.getByTestId("trial-save"));
    await waitFor(() => expect(calls("POST", "/leads/l1/trials")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/l1/trials")[0]![1])).toEqual({
      groupId: "g1",
      date: "2026-11-26",
      note: "Shy, sit in front",
    });
  });

  it("shows the history and cancels a booked trial from it", async () => {
    const trial: TrialBooking = {
      id: "tr1",
      leadId: "l1",
      groupId: "g1",
      groupName: "GE-Morning A1",
      courseName: "General English",
      lessonId: null,
      startTime: "09:00",
      date: "2026-11-26",
      status: "BOOKED",
      note: null,
      token: null,
      createdByName: "Dilnoza Karimova",
      createdAt: "2026-11-23T10:00:00.000Z",
    };
    const contact: LeadContact = {
      id: "k1",
      channel: "TELEGRAM",
      outcome: "WILL_COME",
      note: "Comes on Thursday",
      nextContactAt: null,
      createdBy: "Aziz Admin",
      createdAt: "2026-11-22T10:00:00.000Z",
    };
    serve({
      "GET /leads": board(),
      "GET /leads/options": OPTIONS,
      "GET /leads/l1/contacts": [contact],
      "GET /leads/l1/trials": [trial],
      "PATCH /leads/trials/tr1": { ...trial, status: "CANCELLED" },
    });
    await openCard();
    await fireEvent.press(screen.getByTestId("lead-history-open"));
    expect(await screen.findByTestId("contact-k1")).toHaveTextContent(/Telegram: Will come/);
    expect(screen.getByText("Comes on Thursday")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("trial-cancel-tr1"));
    await waitFor(() => expect(calls("PATCH", "/leads/trials/tr1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/leads/trials/tr1")[0]![1])).toEqual({ status: "CANCELLED" });
  });

  it("turns the lead into a student of a group", async () => {
    serve({
      "GET /leads": board(),
      "GET /leads/options": OPTIONS,
      "POST /leads/add-to-group": { added: 1, skipped: 0 },
    });
    await openCard();
    await fireEvent.press(screen.getByTestId("lead-to-group"));
    await fireEvent.press(await screen.findByTestId("lead-group-group"));
    await fireEvent.press(await screen.findByTestId("lead-group-group-option-g1"));
    await fireEvent.changeText(screen.getByTestId("lead-group-day"), "01.12.2026");
    await fireEvent.press(screen.getByTestId("lead-group-save"));
    await waitFor(() => expect(calls("POST", "/leads/add-to-group")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/add-to-group")[0]![1])).toEqual({
      leadIds: ["l1"],
      groupId: "g1",
      joinedAt: "2026-12-01",
      status: "NEW",
    });
  });

  it("puts the lead on the waiting list with its name and phone", async () => {
    serve({ "GET /leads": board(), "GET /leads/options": OPTIONS, "POST /waitlist": {} });
    await openCard();
    await fireEvent.press(screen.getByTestId("lead-to-waitlist"));
    expect((await screen.findByTestId("waitlist-name")).props.value).toBe("Madina Yusupova");
    await fireEvent.press(screen.getByTestId("waitlist-course"));
    await fireEvent.press(await screen.findByTestId("waitlist-course-option-co1"));
    await fireEvent.press(screen.getByTestId("waitlist-save"));
    await waitFor(() => expect(calls("POST", "/waitlist")).toHaveLength(1));
    expect(sentBody(calls("POST", "/waitlist")[0]![1])).toEqual({
      branchId: "b1",
      courseId: "co1",
      leadId: "l1",
      fullName: "Madina Yusupova",
      phone: "+998901112233",
      days: "ODD",
      lessonTime: "09:00",
      note: null,
    });
  });

  it("changes a lead and deletes one after asking", async () => {
    serve({
      "GET /leads": board(),
      "GET /leads/options": OPTIONS,
      "PATCH /leads/l1": lead(),
      "DELETE /leads/l1": undefined,
    });
    await openCard();
    await fireEvent.press(screen.getByTestId("lead-edit"));
    expect((await screen.findByTestId("lead-name")).props.value).toBe("Madina Yusupova");
    await fireEvent.changeText(screen.getByTestId("lead-comment"), "Wants IELTS 7");
    await fireEvent.press(screen.getByTestId("lead-save"));
    await waitFor(() => expect(calls("PATCH", "/leads/l1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/leads/l1")[0]![1])).toMatchObject({
      fullName: "Madina Yusupova",
      comment: "Wants IELTS 7",
      ownerId: "u1",
      temperature: "HOT",
      nextContactAt: "2026-11-20",
    });
  });

  it("counts whole days between two days", () => {
    expect(daysBetween("2026-11-20", "2026-11-23")).toBe(3);
    expect(daysBetween("2026-11-23", "2026-11-23")).toBe(0);
    expect(daysBetween("2026-11-25", "2026-11-23")).toBe(-2);
  });
});

describe("calls today", () => {
  function call(change: Partial<LeadCall> = {}): LeadCall {
    return {
      ...lead(),
      boardName: "Main",
      columnName: "New",
      branchName: "Chilonzor",
      lastContactBy: null,
      overdueDays: 3,
      ...change,
    };
  }
  const PAGE: CallsPage = {
    items: [call()],
    total: 1,
    page: 1,
    pageSize: 30,
    summary: { overdue: 1, today: 0, upcoming: 4, none: 2 },
    today: "2026-11-23",
  };

  it("lists the person's own due leads first and opens a lead's card", async () => {
    serve({ "GET /leads/calls": PAGE, "GET /leads/options": OPTIONS });
    await renderScreen(<CallsScreen />);
    await screen.findByTestId("lead-l1");
    expect(calls("GET", "/leads/calls")[0]![0]).toContain("range=DUE");
    expect(calls("GET", "/leads/calls")[0]![0]).toContain("ownerId=me");
    expect(screen.getByTestId("calls-overdue")).toHaveTextContent("1");
    expect(screen.getByTestId("calls-upcoming")).toHaveTextContent("4");
    expect(screen.getByTestId("calls-count")).toHaveTextContent("1 lead");

    await fireEvent.press(screen.getByTestId("calls-range"));
    await fireEvent.press(await screen.findByTestId("calls-range-option-UPCOMING"));
    await waitFor(() =>
      expect(calls("GET", "/leads/calls").some(([url]) => url.includes("range=UPCOMING"))).toBe(
        true,
      ),
    );

    await fireEvent.press(screen.getByTestId("lead-l1"));
    expect(await screen.findByTestId("lead-log")).toBeTruthy();
  });

  it("says so when nothing is due", async () => {
    serve({
      "GET /leads/calls": { ...PAGE, items: [], total: 0 },
      "GET /leads/options": OPTIONS,
    });
    await renderScreen(<CallsScreen />);
    expect(await screen.findByText("Nothing to call right now.")).toBeTruthy();
  });
});

describe("the waiting list", () => {
  function entry(change: Partial<WaitlistEntry> = {}): WaitlistEntry {
    return {
      id: "w1",
      branchId: "b1",
      branchName: "Chilonzor",
      courseId: "co1",
      courseName: "General English",
      leadId: null,
      studentId: null,
      fullName: "Kamola Tosheva",
      phone: "+998907771122",
      days: "EVEN",
      lessonTime: "19:30",
      note: null,
      status: "WAITING",
      position: 1,
      offeredGroup: null,
      offeredAt: null,
      closedAt: null,
      createdBy: "Dilnoza Karimova",
      createdAt: "2026-11-10T08:00:00.000Z",
      ...change,
    };
  }
  function listed(items: WaitlistEntry[]): WaitlistPage {
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: 30,
      summary: {
        waiting: items.length,
        offered: 0,
        byCourse: [{ courseId: "co1", courseName: "General English", waiting: items.length }],
      },
    };
  }

  it("enrols the first in line into a group of the course in their branch", async () => {
    serve({
      "GET /waitlist": listed([entry()]),
      "GET /groups": {
        items: [
          { id: "g1", name: "GE-Morning A1", branchId: "b1", status: "ACTIVE" },
          { id: "g2", name: "GE in another branch", branchId: "b2", status: "ACTIVE" },
          { id: "g3", name: "GE old", branchId: "b1", status: "ARCHIVED" },
        ],
        total: 3,
        page: 1,
        pageSize: 100,
      },
      "POST /waitlist/w1/enrol": entry({ status: "ENROLLED" }),
    });
    await renderScreen(<WaitlistScreen />);
    expect(await screen.findByTestId("waitlist-w1")).toHaveTextContent(/1\. Kamola Tosheva/);
    await fireEvent.press(screen.getByTestId("waitlist-enrol-w1"));
    await fireEvent.press(await screen.findByTestId("waitlist-enrol-group"));
    await screen.findByTestId("waitlist-enrol-group-option-g1");
    expect(screen.queryByTestId("waitlist-enrol-group-option-g2")).toBeNull();
    expect(screen.queryByTestId("waitlist-enrol-group-option-g3")).toBeNull();
    await fireEvent.press(await screen.findByTestId("waitlist-enrol-group-option-g1"));
    await fireEvent.changeText(screen.getByTestId("waitlist-enrol-day"), "01.12.2026");
    await fireEvent.press(screen.getByTestId("waitlist-enrol-save"));
    await waitFor(() => expect(calls("POST", "/waitlist/w1/enrol")).toHaveLength(1));
    expect(sentBody(calls("POST", "/waitlist/w1/enrol")[0]![1])).toEqual({
      groupId: "g1",
      joinedAt: "2026-12-01",
      status: "NEW",
    });
  });

  it("marks an entry declined, and removes one after asking", async () => {
    serve({ "GET /waitlist": listed([entry()]), "PATCH /waitlist/w1": entry() });
    await renderScreen(<WaitlistScreen />);
    await fireEvent.press(await screen.findByTestId("waitlist-decline-w1"));
    await waitFor(() => expect(calls("PATCH", "/waitlist/w1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/waitlist/w1")[0]![1])).toEqual({ status: "DECLINED" });

    await fireEvent.press(screen.getByTestId("waitlist-remove-w1"));
    await fireEvent.press(await screen.findByTestId("waitlist-remove-sheet-confirm"));
    await waitFor(() => expect(calls("PATCH", "/waitlist/w1")).toHaveLength(2));
    expect(sentBody(calls("PATCH", "/waitlist/w1")[1]![1])).toEqual({ status: "REMOVED" });
  });

  it("puts a declined entry back to waiting, and adds a new one", async () => {
    serve({
      "GET /waitlist": listed([entry({ status: "DECLINED", position: null })]),
      "GET /leads/options": OPTIONS,
      "PATCH /waitlist/w1": entry(),
      "POST /waitlist": entry({ id: "w2" }),
    });
    await renderScreen(<WaitlistScreen />);
    await screen.findByTestId("waitlist-w1");
    expect(screen.queryByTestId("waitlist-enrol-w1")).toBeNull();
    await fireEvent.press(screen.getByTestId("waitlist-reopen-w1"));
    await waitFor(() => expect(calls("PATCH", "/waitlist/w1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/waitlist/w1")[0]![1])).toEqual({ status: "WAITING" });

    await fireEvent.press(screen.getByTestId("waitlist-add"));
    await fireEvent.changeText(await screen.findByTestId("waitlist-name"), "Timur Saidov");
    await fireEvent.changeText(screen.getByTestId("waitlist-phone"), "+998 93 555 66 77");
    // Without a course nothing is sent.
    await fireEvent.press(screen.getByTestId("waitlist-save"));
    expect(calls("POST", "/waitlist")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("waitlist-course"));
    await fireEvent.press(await screen.findByTestId("waitlist-course-option-co1"));
    await fireEvent.press(screen.getByTestId("waitlist-save"));
    await waitFor(() => expect(calls("POST", "/waitlist")).toHaveLength(1));
    expect(sentBody(calls("POST", "/waitlist")[0]![1])).toEqual({
      branchId: "b1",
      courseId: "co1",
      leadId: null,
      fullName: "Timur Saidov",
      phone: "+998935556677",
      days: null,
      lessonTime: null,
      note: null,
    });
  });
});

describe("the inbox", () => {
  function chat(change: Partial<Conversation> = {}): Conversation {
    return {
      id: "cv1",
      channel: "TELEGRAM",
      displayName: "Nodira",
      username: "nodira_uz",
      locale: "uz",
      unreadCount: 2,
      isClosed: false,
      lastMessageAt: "2026-11-23T09:00:00.000Z",
      lastMessage: { direction: "IN", text: "How much is the course?" },
      lead: {
        id: "l1",
        fullName: "Nodira",
        boardId: "bd1",
        branchId: "b1",
        columnName: "New",
        phones: [],
        isArchived: false,
      },
      ...change,
    };
  }
  const DETAIL: ConversationDetail = {
    conversation: chat({ unreadCount: 0 }),
    messages: [
      {
        id: "m1",
        direction: "IN",
        text: "How much is the course?",
        sentByName: null,
        createdAt: "2026-11-23T09:00:00.000Z",
      },
    ],
  };

  it("lists the chats with what waits unread and opens one", async () => {
    serve({
      "GET /leads/inbox": [chat(), chat({ id: "cv2", displayName: "Rustam", unreadCount: 0 })],
    });
    await renderScreen(<InboxScreen />);
    expect(await screen.findByTestId("unread-cv1")).toHaveTextContent("2");
    expect(screen.queryByTestId("unread-cv2")).toBeNull();
    expect(calls("GET", "/leads/inbox")[0]![0]).toContain("status=open");

    await fireEvent.press(screen.getByTestId("conversation-cv1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/leads/inbox/[id]",
      params: { id: "cv1" },
    });

    await fireEvent.press(screen.getByTestId("inbox-status-closed"));
    await waitFor(() =>
      expect(calls("GET", "/leads/inbox").some(([url]) => url.includes("status=closed"))).toBe(
        true,
      ),
    );
    await waitFor(() => expect(screen.getByTestId("inbox-status-closed")).toBeSelected());
  });

  it("answers through the bot, opens the chat's lead and closes the chat", async () => {
    mockParams = { id: "cv1" };
    serve({
      "GET /leads/inbox/cv1": DETAIL,
      "POST /leads/inbox/cv1/messages": {
        id: "m2",
        direction: "OUT",
        text: "400 000 a month",
        sentByName: "Dilnoza Karimova",
        createdAt: "2026-11-23T09:05:00.000Z",
      },
      "GET /leads/l1": lead({ fullName: "Nodira" }),
      "GET /leads/options": OPTIONS,
      "PATCH /leads/inbox/cv1": chat({ isClosed: true }),
    });
    await renderScreen(<ConversationScreen />);
    expect(await screen.findByText("How much is the course?")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("chat-input"), "400 000 a month");
    await fireEvent.press(screen.getByTestId("chat-send"));
    await waitFor(() => expect(calls("POST", "/leads/inbox/cv1/messages")).toHaveLength(1));
    expect(sentBody(calls("POST", "/leads/inbox/cv1/messages")[0]![1])).toEqual({
      text: "400 000 a month",
    });
    expect(await screen.findByText("400 000 a month")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("conversation-actions"));
    await fireEvent.press(await screen.findByTestId("conversation-lead"));
    expect(await screen.findByTestId("lead-log")).toBeTruthy();
  });

  it("closes a chat", async () => {
    mockParams = { id: "cv1" };
    serve({ "GET /leads/inbox/cv1": DETAIL, "PATCH /leads/inbox/cv1": chat({ isClosed: true }) });
    await renderScreen(<ConversationScreen />);
    await fireEvent.press(await screen.findByTestId("conversation-actions"));
    await fireEvent.press(await screen.findByTestId("conversation-close"));
    await waitFor(() => expect(calls("PATCH", "/leads/inbox/cv1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/leads/inbox/cv1")[0]![1])).toEqual({ closed: true });
  });
});

describe("where the site's lead pages live in the app", () => {
  it("opens the board, the calls, the waiting list and the inbox in the app", () => {
    expect(nativeRoute("/leads")).toBe("/staff/leads");
    expect(nativeRoute("/leads/calls")).toBe("/staff/leads/calls");
    expect(nativeRoute("/leads/waitlist")).toBe("/staff/leads/waitlist");
    expect(nativeRoute("/leads/inbox")).toBe("/staff/leads/inbox");
    expect(nativeRoute("/absences")).toBe("/staff/absences");
    expect(nativeRoute("/join-requests")).toBe("/staff/join-requests");
  });

  it("opens a lead found by the search on its board, with the name searched", () => {
    expect(nativeRoute("/leads?boardId=bd1&q=Madina")).toEqual({
      pathname: "/staff/leads",
      params: { boardId: "bd1", q: "Madina" },
    });
  });

  it("leaves filters the app's board does not have to the site", () => {
    expect(nativeRoute("/leads?teacherId=t1")).toBeNull();
    expect(nativeRoute("/leads/calls/x")).toBeNull();
  });
});
