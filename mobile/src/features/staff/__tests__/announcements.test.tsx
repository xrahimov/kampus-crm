import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { Announcement, Page } from "@/api/types";
import { AnnouncementsScreen } from "@/features/staff/announcements-screen";
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
  useLocalSearchParams: () => ({}),
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/session", () => ({
  useMe: () => ({ permissions: mockPermissions }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * Announcements on the staff side, in the app (A-221): the notices, and a new
 * one to one group. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPermissions = ["groups.view", "announcements.view", "announcements.create"];
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

/** Answers by "<VERB> <end of the path>"; a function is given the request. */
type Routes = Record<string, unknown | ((init?: RequestInit) => Response)>;
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
    if (typeof route === "function") return (route as (init?: RequestInit) => Response)(init);
    return answer(route === undefined ? 204 : 200, route);
  });
}

function notice(change: Partial<Announcement>): Announcement {
  return {
    id: "n1",
    audience: "GROUP",
    branchName: null,
    groupId: "g1",
    groupName: "GE-Morning A1",
    title: "No lesson on Friday",
    body: "The centre is closed for the holiday.",
    sendSms: false,
    recipients: 4,
    telegramQueued: 3,
    smsQueued: 0,
    reads: 2,
    createdAt: "2026-11-20T09:00:00.000Z",
    createdByName: "Demo Teacher",
    ...change,
  };
}

function page(items: Announcement[]): Page<Announcement> {
  return { items, page: 1, pageSize: 20, total: items.length };
}

const GROUPS = {
  items: [
    { id: "g1", name: "GE-Morning A1" },
    { id: "g2", name: "IELTS Evening" },
  ],
  page: 1,
  pageSize: 100,
  total: 2,
};

describe("announcements on the staff side", () => {
  it("lists the notices with where they went and how many read them", async () => {
    serve({
      "GET /announcements": page([
        notice({}),
        notice({
          id: "n2",
          audience: "CENTRE",
          groupId: null,
          groupName: null,
          title: "New prices",
          sendSms: true,
          smsQueued: 40,
        }),
      ]),
    });
    await renderScreen(<AnnouncementsScreen />);
    expect(await screen.findByTestId("announcement-n1")).toHaveTextContent(/No lesson on Friday/);
    expect(screen.getAllByTestId("announcement-where")[0]).toHaveTextContent("GE-Morning A1");
    expect(screen.getAllByTestId("announcement-facts")[0]).toHaveTextContent(/2 of 4 read/);
    expect(screen.getAllByTestId("announcement-facts")[0]).toHaveTextContent(/3 on Telegram/);
    expect(screen.getAllByTestId("announcement-facts")[0]).not.toHaveTextContent(/SMS/);
    expect(screen.getAllByTestId("announcement-where")[1]).toHaveTextContent("Whole centre");
    expect(screen.getAllByTestId("announcement-facts")[1]).toHaveTextContent(/40 SMS/);
  });

  it("posts a notice to one group and says how many students get it", async () => {
    let stored: Announcement[] = [];
    serve({
      "GET /announcements": () => answer(200, page(stored)),
      "GET /groups": GROUPS,
      "POST /announcements": () => {
        const saved = notice({
          id: "n9",
          groupId: "g2",
          groupName: "IELTS Evening",
          recipients: 7,
        });
        stored = [saved];
        return answer(201, saved);
      },
    });
    await renderScreen(<AnnouncementsScreen />);
    await fireEvent.press(await screen.findByTestId("announcement-new"));
    // Nothing goes out before a group, a title and a text are there.
    expect(screen.getByTestId("announcement-post")).toBeDisabled();
    await fireEvent.press(await screen.findByTestId("announcement-group-g2"));
    await fireEvent.changeText(screen.getByTestId("announcement-title"), " No lesson on Friday ");
    await fireEvent.changeText(screen.getByTestId("announcement-body"), "The centre is closed.");
    await fireEvent.press(screen.getByTestId("announcement-post"));

    await waitFor(() => expect(calls("POST", "/announcements")).toHaveLength(1));
    expect(sentBody(calls("POST", "/announcements")[0]![1])).toEqual({
      audience: "GROUP",
      groupId: "g2",
      title: "No lesson on Friday",
      body: "The centre is closed.",
      sendSms: false,
    });
    expect(await screen.findByTestId("announcement-posted")).toHaveTextContent(/7 students/);
    expect(screen.queryByTestId("announcement-form")).toBeNull();
    expect(await screen.findByTestId("announcement-n9")).toBeTruthy();
  });

  it("sends it as SMS too only when that is ticked", async () => {
    serve({
      "GET /announcements": page([]),
      "GET /groups": GROUPS,
      "POST /announcements": () => answer(201, notice({ sendSms: true })),
    });
    await renderScreen(<AnnouncementsScreen />);
    await fireEvent.press(await screen.findByTestId("announcement-new"));
    await fireEvent.press(await screen.findByTestId("announcement-group-g1"));
    await fireEvent.changeText(screen.getByTestId("announcement-title"), "Exam on Monday");
    await fireEvent.changeText(screen.getByTestId("announcement-body"), "Bring a pen.");
    await fireEvent.press(screen.getByTestId("announcement-sms"));
    await fireEvent.press(screen.getByTestId("announcement-post"));
    await waitFor(() => expect(calls("POST", "/announcements")).toHaveLength(1));
    expect(sentBody(calls("POST", "/announcements")[0]![1])).toMatchObject({ sendSms: true });
  });

  it("keeps the form and says why when the server refuses", async () => {
    serve({
      "GET /announcements": page([]),
      "GET /groups": GROUPS,
      "POST /announcements": () =>
        answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    });
    await renderScreen(<AnnouncementsScreen />);
    await fireEvent.press(await screen.findByTestId("announcement-new"));
    await fireEvent.press(await screen.findByTestId("announcement-group-g1"));
    await fireEvent.changeText(screen.getByTestId("announcement-title"), "Exam on Monday");
    await fireEvent.changeText(screen.getByTestId("announcement-body"), "Bring a pen.");
    await fireEvent.press(screen.getByTestId("announcement-post"));
    expect(await screen.findByTestId("announcement-problem")).toBeTruthy();
    expect(screen.getByTestId("announcement-form")).toBeTruthy();
  });

  it("deletes a notice only after a second press", async () => {
    let stored = [notice({})];
    serve({
      "GET /announcements": () => answer(200, page(stored)),
      "DELETE /announcements/n1": () => {
        stored = [];
        return answer(204, undefined);
      },
    });
    await renderScreen(<AnnouncementsScreen />);
    await fireEvent.press(await screen.findByTestId("announcement-delete-n1"));
    expect(calls("DELETE", "/announcements/n1")).toHaveLength(0);
    expect(screen.getByTestId("announcement-delete-confirm")).toHaveTextContent(
      /Messages already sent stay sent/,
    );
    await fireEvent.press(screen.getByTestId("announcement-delete-yes"));
    await waitFor(() => expect(screen.queryByTestId("announcement-n1")).toBeNull());
    expect(calls("DELETE", "/announcements/n1")).toHaveLength(1);
  });

  it("only reads for someone who may not post", async () => {
    mockPermissions = ["announcements.view"];
    serve({ "GET /announcements": page([notice({})]) });
    await renderScreen(<AnnouncementsScreen />);
    await screen.findByTestId("announcement-n1");
    expect(screen.queryByTestId("announcement-new")).toBeNull();
    expect(screen.queryByTestId("announcement-delete-n1")).toBeNull();
  });
});
