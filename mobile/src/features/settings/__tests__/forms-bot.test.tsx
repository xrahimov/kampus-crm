import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking, Share } from "react-native";

import type { BotRecipient, LeadForm } from "@/api/office-forms-bot";
import { nativeRoute } from "@/features/office/site-paths";
import { BotScreen } from "@/features/settings/bot-screen";
import { FormsScreen, slugify } from "@/features/settings/forms-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));
let mockPermissions = ["settings.integrations", "settings.catalog", "staff.view", "leads.view"];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "me" },
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] }, permission: string) =>
    me.permissions.includes("*") || me.permissions.includes(permission),
}));

/*
 * Telegram recipients and lead forms in the app (A-247): the site's Settings →
 * Bot notifications and Settings → Forms. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPermissions = ["settings.integrations", "settings.catalog", "staff.view", "leads.view"];
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
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
    if (!key) return answer(404, { error: { code: "NOT_FOUND", message: "errors.notFound" } });
    const route = routes[key];
    const body = typeof route === "function" ? (route as (url: string) => unknown)(url) : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

const disabled = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled === true;
const selected = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.selected === true;

describe("bot notifications", () => {
  const STAFF = {
    items: [
      { id: "u1", fullName: "Dilnoza Karimova", phone: "+998901112233" },
      { id: "u2", fullName: "Sardor Aliyev", phone: "+998907778899" },
      { id: "u3", fullName: "Malika Yusupova", phone: "+998935550011" },
    ],
    page: 1,
    pageSize: 100,
    total: 3,
  };
  const BRANCHES = {
    items: [
      { id: "b1", name: "Chilonzor", isActive: true },
      { id: "b2", name: "Yunusobod", isActive: true },
      { id: "b3", name: "Closed branch", isActive: false },
    ],
  };
  const recipient = (id: string, more: Partial<BotRecipient> = {}): BotRecipient => ({
    id,
    userId: "u1",
    fullName: "Dilnoza Karimova",
    phone: "+998901112233",
    chatId: "959000111",
    branchNames: [],
    ...more,
  });

  it("lists who the bot writes to, with their chat's number and branches", async () => {
    serve({
      "GET /bot-recipients": [
        recipient("r1"),
        recipient("r2", {
          userId: "u2",
          fullName: "Sardor Aliyev",
          phone: "+998907778899",
          chatId: "-100200300",
          branchNames: ["Chilonzor", "Yunusobod"],
        }),
      ],
      "GET /staff": STAFF,
      "GET /branches": BRANCHES,
    });
    await renderScreen(<BotScreen />);
    expect(await screen.findByTestId("bot-r1")).toHaveTextContent(
      /Dilnoza Karimova.*\+998901112233.*Special ID: 959000111.*All branches/,
    );
    expect(screen.getByTestId("bot-r2")).toHaveTextContent(
      /Sardor Aliyev.*Special ID: -100200300.*Chilonzor, Yunusobod/,
    );
  });

  it("adds a person who is not in the list yet, for the branches ticked", async () => {
    let rows = [recipient("r1")];
    serve({
      "GET /bot-recipients": () => rows,
      "GET /staff": STAFF,
      "GET /branches": BRANCHES,
      "POST /bot-recipients": () => {
        rows = [...rows, recipient("r2", { userId: "u3", fullName: "Malika Yusupova" })];
        return rows[1];
      },
    });
    await renderScreen(<BotScreen />);
    await screen.findByTestId("bot-r1");
    await waitFor(() => expect(disabled("bot-add")).toBe(false));
    await fireEvent.press(screen.getByTestId("bot-add"));
    await screen.findByTestId("bot-chat-id");
    // A branch that is switched off is not offered.
    expect(screen.getByTestId("bot-branch-b2")).toBeTruthy();
    expect(screen.queryByTestId("bot-branch-b3")).toBeNull();

    // Nothing typed: the chat's number is asked for, and nothing is sent.
    await fireEvent.press(screen.getByTestId("bot-save"));
    expect(await screen.findByText("Enter the numeric Telegram chat ID.")).toBeTruthy();
    expect(calls("POST", "/bot-recipients")).toHaveLength(0);

    // The first person not in the list is chosen already; another can be picked.
    await fireEvent.press(screen.getByTestId("bot-staff"));
    expect(await screen.findByTestId("bot-staff-option-u2")).toBeTruthy();
    expect(screen.queryByTestId("bot-staff-option-u1")).toBeNull();
    await fireEvent.press(screen.getByTestId("bot-staff-option-u3"));
    await fireEvent.changeText(await screen.findByTestId("bot-chat-id"), " 959000222 ");
    await fireEvent.press(screen.getByTestId("bot-branch-b2"));
    expect(selected("bot-branch-b2")).toBe(true);
    await fireEvent.press(screen.getByTestId("bot-save"));
    await waitFor(() => expect(calls("POST", "/bot-recipients")).toHaveLength(1));
    expect(sentBody(calls("POST", "/bot-recipients")[0]![1])).toEqual({
      userId: "u3",
      chatId: "959000222",
      branchIds: ["b2"],
    });
    expect(await screen.findByTestId("bot-r2")).toBeTruthy();
  });

  it("shows what the server refuses under the field", async () => {
    serve({
      "GET /bot-recipients": [],
      "GET /staff": STAFF,
      "GET /branches": BRANCHES,
      "POST /bot-recipients": answer(400, {
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { chatId: ["validation.chatId"] },
        },
      }),
    });
    await renderScreen(<BotScreen />);
    expect(await screen.findByText("Nobody receives bot notifications yet.")).toBeTruthy();
    await waitFor(() => expect(disabled("bot-add")).toBe(false));
    await fireEvent.press(screen.getByTestId("bot-add"));
    await fireEvent.changeText(await screen.findByTestId("bot-chat-id"), "959000222");
    await fireEvent.press(screen.getByTestId("bot-save"));
    expect(await screen.findByText("Enter the numeric Telegram chat ID.")).toBeTruthy();
    expect(screen.getByTestId("bot-form")).toBeTruthy();
  });

  it("removes a person after a question", async () => {
    let rows = [recipient("r1")];
    serve({
      "GET /bot-recipients": () => rows,
      "GET /staff": STAFF,
      "GET /branches": BRANCHES,
      "DELETE /bot-recipients/r1": () => {
        rows = [];
        return undefined;
      },
    });
    await renderScreen(<BotScreen />);
    await fireEvent.press(await screen.findByTestId("bot-remove-r1"));
    expect(await screen.findByText("Remove recipient?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("bot-remove-confirm-cancel"));
    expect(calls("DELETE", "/bot-recipients/r1")).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText("Remove recipient?")).toBeNull());
    await fireEvent.press(screen.getByTestId("bot-remove-r1"));
    await fireEvent.press(await screen.findByTestId("bot-remove-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/bot-recipients/r1")).toHaveLength(1));
    expect(await screen.findByText("Nobody receives bot notifications yet.")).toBeTruthy();
  });

  it("cannot add anyone when everyone is in the list, or without the right to see the staff", async () => {
    serve({
      "GET /bot-recipients": [
        recipient("r1"),
        recipient("r2", { userId: "u2" }),
        recipient("r3", { userId: "u3" }),
      ],
      "GET /staff": STAFF,
      "GET /branches": BRANCHES,
    });
    await renderScreen(<BotScreen />);
    await screen.findByTestId("bot-r3");
    await waitFor(() => expect(calls("GET", "/staff")).toHaveLength(1));
    expect(disabled("bot-add")).toBe(true);
    clearClients();

    fetchMock.mockClear();
    mockPermissions = ["settings.integrations"];
    await renderScreen(<BotScreen />);
    await screen.findAllByTestId("bot-r1");
    expect(calls("GET", "/staff")).toHaveLength(0);
  });
});

describe("lead forms", () => {
  const OPTIONS = {
    teachers: [],
    sources: [
      { id: "s1", name: "Instagram" },
      { id: "s2", name: "Website" },
    ],
    lessonTimes: [],
    owners: [],
    groups: [],
    courses: [],
    waiting: 0,
    unreadConversations: 0,
    boards: [
      {
        id: "bd1",
        name: "Main board",
        branchId: "b1",
        columns: [
          { id: "c1", name: "New" },
          { id: "c2", name: "Contacted" },
        ],
      },
      { id: "bd2", name: "Summer camp", branchId: "b1", columns: [{ id: "c3", name: "Asked" }] },
    ],
  };
  const form = (id: string, more: Partial<LeadForm> = {}): LeadForm => ({
    id,
    name: "Trial lesson",
    slug: "trial-lesson",
    columnId: "c1",
    columnName: "New",
    boardName: "Main board",
    sourceId: "s2",
    sourceName: "Website",
    integration: "kampus.example",
    isActive: true,
    leadCount: 12,
    ...more,
  });

  it("lists the forms with their column, source, leads and address", async () => {
    serve({
      "GET /lead-forms": [
        form("f1"),
        form("f2", {
          name: "Old campaign",
          slug: "old",
          sourceId: null,
          sourceName: null,
          integration: null,
          isActive: false,
          leadCount: 0,
        }),
      ],
    });
    await renderScreen(<FormsScreen />);
    expect(await screen.findByTestId("form-f1")).toHaveTextContent(
      /Trial lesson.*Lead column: Main board · New.*Source: Website.*Integration: kampus\.example.*Leads received: 12.*\/en\/forms\/trial-lesson/s,
    );
    expect(screen.getByTestId("form-f2")).toHaveTextContent(/Old campaign.*Inactive/);
    expect(screen.getByTestId("form-f2")).not.toHaveTextContent(/Source:/);
  });

  it("hands a form's address to the share sheet and opens the form in the browser", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    serve({ "GET /lead-forms": [form("f1")] });
    await renderScreen(<FormsScreen />);
    await fireEvent.press(await screen.findByTestId("form-share-f1"));
    expect(share).toHaveBeenCalledWith({
      message: expect.stringMatching(/^https?:\/\/.+\/en\/forms\/trial-lesson$/),
    });
    await fireEvent.press(screen.getByTestId("form-open-f1"));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/en\/forms\/trial-lesson$/));
  });

  it("adds a form: the link name follows the name until it is typed", async () => {
    let rows: LeadForm[] = [];
    serve({
      "GET /lead-forms": () => rows,
      "GET /leads/options": OPTIONS,
      "POST /lead-forms": () => {
        rows = [form("f9", { name: "Yozgi lager 2027", slug: "summer" })];
        return rows[0];
      },
    });
    await renderScreen(<FormsScreen />);
    await screen.findByTestId("forms-empty");
    await fireEvent.press(screen.getByTestId("forms-add"));
    await screen.findByTestId("form-name");

    // Nothing typed: nothing is sent.
    await fireEvent.press(screen.getByTestId("form-save"));
    expect(calls("POST", "/lead-forms")).toHaveLength(0);
    expect(screen.getAllByText("Required.").length).toBeGreaterThan(0);

    await fireEvent.changeText(screen.getByTestId("form-name"), "Yozgi lager 2027");
    expect(screen.getByTestId("form-slug").props.value).toBe("yozgi-lager-2027");
    await fireEvent.changeText(screen.getByTestId("form-slug"), "Summer Camp");
    await fireEvent.changeText(screen.getByTestId("form-name"), "Yozgi lager 2027!");
    // Typed by hand: it no longer follows the name, and a space is not allowed.
    expect(screen.getByTestId("form-slug").props.value).toBe("Summer Camp");
    await fireEvent.press(screen.getByTestId("form-save"));
    expect(await screen.findByText("Use Latin letters, digits and dashes.")).toBeTruthy();
    expect(calls("POST", "/lead-forms")).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId("form-slug"), "Summer");

    await fireEvent.press(screen.getByTestId("form-column"));
    await fireEvent.press(await screen.findByTestId("form-column-option-c3"));
    await fireEvent.press(await screen.findByTestId("form-source"));
    await fireEvent.press(await screen.findByTestId("form-source-option-s1"));
    await fireEvent.changeText(await screen.findByTestId("form-integration"), " landing ");
    await fireEvent.press(screen.getByTestId("form-save"));
    await waitFor(() => expect(calls("POST", "/lead-forms")).toHaveLength(1));
    expect(sentBody(calls("POST", "/lead-forms")[0]![1])).toEqual({
      name: "Yozgi lager 2027!",
      slug: "summer",
      columnId: "c3",
      sourceId: "s1",
      integration: "landing",
      isActive: true,
    });
    expect(await screen.findByTestId("form-f9")).toBeTruthy();
  });

  it("starts a new form on the first column and sends no source or note when none is given", async () => {
    serve({
      "GET /lead-forms": [],
      "GET /leads/options": OPTIONS,
      "POST /lead-forms": form("f9"),
    });
    await renderScreen(<FormsScreen />);
    await screen.findByTestId("forms-empty");
    await fireEvent.press(screen.getByTestId("forms-add"));
    await fireEvent.changeText(await screen.findByTestId("form-name"), "Trial");
    await waitFor(() =>
      expect(screen.getByTestId("form-column")).toHaveTextContent(/Main board · New/),
    );
    await fireEvent.press(screen.getByTestId("form-save"));
    await waitFor(() => expect(calls("POST", "/lead-forms")).toHaveLength(1));
    expect(sentBody(calls("POST", "/lead-forms")[0]![1])).toEqual({
      name: "Trial",
      slug: "trial",
      columnId: "c1",
      sourceId: null,
      integration: null,
      isActive: true,
    });
  });

  it("changes a form, and shows a link name the server says is taken", async () => {
    let taken = true;
    serve({
      "GET /lead-forms": [form("f1")],
      "GET /leads/options": OPTIONS,
      "PATCH /lead-forms/f1": () =>
        taken
          ? answer(400, {
              error: {
                code: "VALIDATION",
                message: "errors.validation",
                fields: { slug: ["validation.duplicate"] },
              },
            })
          : form("f1"),
    });
    await renderScreen(<FormsScreen />);
    await fireEvent.press(await screen.findByTestId("form-edit-f1"));
    expect((await screen.findByTestId("form-name")).props.value).toBe("Trial lesson");
    // An existing form keeps its link name when it is renamed.
    await fireEvent.changeText(screen.getByTestId("form-name"), "Trial lesson 2");
    expect(screen.getByTestId("form-slug").props.value).toBe("trial-lesson");
    await fireEvent.press(screen.getByTestId("form-active"));
    await fireEvent.press(screen.getByTestId("form-save"));
    await waitFor(() => expect(calls("PATCH", "/lead-forms/f1")).toHaveLength(1));
    expect(await screen.findByText("This value is already in use.")).toBeTruthy();
    expect(screen.queryByTestId("form-problem")).toBeNull();

    taken = false;
    await fireEvent.press(screen.getByTestId("form-save"));
    await waitFor(() => expect(calls("PATCH", "/lead-forms/f1")).toHaveLength(2));
    expect(sentBody(calls("PATCH", "/lead-forms/f1")[1]![1])).toEqual({
      name: "Trial lesson 2",
      slug: "trial-lesson",
      columnId: "c1",
      sourceId: "s2",
      integration: "kampus.example",
      isActive: false,
    });
    await waitFor(() => expect(screen.queryByTestId("form-form")).toBeNull());
  });

  it("deletes a form after a question", async () => {
    let rows = [form("f1")];
    serve({
      "GET /lead-forms": () => rows,
      "GET /leads/options": OPTIONS,
      "DELETE /lead-forms/f1": () => {
        rows = [];
        return undefined;
      },
    });
    await renderScreen(<FormsScreen />);
    await fireEvent.press(await screen.findByTestId("form-edit-f1"));
    await fireEvent.press(await screen.findByTestId("form-delete"));
    expect(await screen.findByText("Delete form?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("form-delete-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/lead-forms/f1")).toHaveLength(1));
    expect(await screen.findByTestId("forms-empty")).toBeTruthy();
  });

  it("makes a link name the way the site does", () => {
    expect(slugify("  Yozgi Lager — 2027! ")).toBe("yozgi-lager-2027");
    expect(slugify("Ünïcode Çamp")).toBe("u-ni-code-c-amp");
    expect(slugify("x".repeat(80))).toHaveLength(60);
  });
});

describe("where these two pages live in the app", () => {
  it("opens both in the app", () => {
    expect(nativeRoute("/settings/forms")).toBe("/staff/settings/forms");
    expect(nativeRoute("/settings/bot")).toBe("/staff/settings/bot");
    expect(nativeRoute("/settings/integrations")).toBeNull();
  });
});
