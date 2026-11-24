import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";

import type {
  CallRow,
  Family,
  SmsLogRow,
  StudentAccess,
  StudentHistoryRow,
} from "@/api/office-student-page";
import type { Page, StudentDetail } from "@/api/types";
import { typedPercent } from "@/features/office/student-family";
import { callLength } from "@/features/office/student-record";
import { StudentScreen } from "@/features/staff/student-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { smsParts } from "@/lib/sms-parts";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "s1" }),
}));
const mockOpenOnSite = jest.fn<Promise<void>, [string]>();
jest.mock("@/lib/web", () => ({ openOnSite: (path: string) => mockOpenOnSite(path) }));
let mockPermissions: string[] = [];
let mockView = "FULL";
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    permissions: mockPermissions,
    view: { current: mockView, canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * The rest of a student's page for the office, in the app (A-240): SMS,
 * calls, history, parents, the family and its page for the parents, who signs
 * in as the student, extra information and the blacklist. Each test plays
 * the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

const ALL = [
  "students.view",
  "students.update",
  "students.blacklist",
  "sms.send",
  "discounts.give",
];

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockOpenOnSite.mockReset().mockResolvedValue(undefined);
  mockPermissions = ALL;
  mockView = "FULL";
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

function student(change: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: "s1",
    fullName: "Ali Valiyev",
    phone: "+998901112233",
    note: null,
    isArchived: false,
    isBlacklisted: false,
    gradeAverage: null,
    balance: 0,
    groups: [],
    birthDate: null,
    schoolName: null,
    parents: [{ id: "p1", fullName: "Vali Valiyev", phone: "+998907770011" }],
    customFields: [{ id: "f1", name: "T-shirt", value: "M" }],
    ...change,
  };
}

const FAMILY: Family = {
  id: "fam1",
  name: "Valiyevlar",
  discountPercent: 10,
  note: "Two children",
  members: [
    { id: "s1", fullName: "Ali Valiyev", isArchived: false, groups: ["GE-Morning A1"] },
    { id: "s2", fullName: "Laylo Valiyeva", isArchived: false, groups: [] },
  ],
};

const ACCESS: StudentAccess[] = [
  {
    linkId: "l1",
    who: { kind: "STUDENT" },
    telegramName: "Ali",
    telegramUsername: "ali_v",
    via: "PHONE",
    linkedAt: "2026-11-01T08:00:00.000Z",
    lastSeenAt: "2026-11-20T08:00:00.000Z",
    devices: 2,
  },
  {
    linkId: "l2",
    who: { kind: "PARENT", name: "Vali Valiyev" },
    telegramName: "Vali",
    telegramUsername: null,
    via: "STAFF",
    linkedAt: "2026-11-02T08:00:00.000Z",
    lastSeenAt: null,
    devices: 0,
  },
];

/** The student's page with its two cards answered, plus what a test adds. */
function page(routes: Routes = {}, who: StudentDetail = student()): Routes {
  return {
    ...routes,
    "GET /students/s1": who,
    "GET /students/s1/family": null,
    "GET /students/s1/access": [],
  };
}

function sms(change: Partial<SmsLogRow> = {}): SmsLogRow {
  return {
    id: "m1",
    recipientType: "STUDENT",
    recipientName: "Ali Valiyev",
    phone: "+998901112233",
    text: "Lesson moved to 10:00",
    status: "SENT",
    sentByName: "Dilnoza Karimova",
    event: null,
    error: null,
    createdAt: "2026-11-20T09:00:00.000Z",
    ...change,
  };
}

describe("the SMS of a student", () => {
  it("lists what was sent, by whom and how it ended", async () => {
    serve(
      page({
        "GET /students/s1/sms": [
          sms(),
          sms({ id: "m2", status: "FAILED", sentByName: null, event: "DEBTOR", text: "Reminder" }),
        ],
      }),
    );
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-sms"));
    expect(await screen.findByTestId("student-sms-m1")).toHaveTextContent(/Lesson moved to 10:00/);
    expect(screen.getByTestId("student-sms-m1")).toHaveTextContent(/Dilnoza Karimova/);
    expect(screen.getByTestId("student-sms-m1")).toHaveTextContent(/Sent/);
    expect(screen.getByTestId("student-sms-m2")).toHaveTextContent(/Failed/);
    expect(screen.getByTestId("student-sms-m2")).toHaveTextContent(/Sent by the system/);
  });

  it("writes one from a template and says what came of it", async () => {
    serve(
      page({
        "GET /students/s1/sms": [],
        "POST /sms/count": { count: 1, skipped: 0, sample: ["Ali Valiyev"] },
        "GET /sms-templates": [
          { id: "t1", categoryName: "Lessons", text: "Lesson tomorrow at 10:00" },
        ],
        "POST /sms/send": { total: 1, sent: 1, failed: 0, skipped: 0, adapter: "fake" },
      }),
    );
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-sms"));
    expect(await screen.findByTestId("student-sms-empty")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("student-sms-send"));
    await waitFor(() =>
      expect(screen.getByTestId("student-sms-sheet-recipients")).toHaveTextContent(
        /1 recipient \(/,
      ),
    );
    expect(sentBody(calls("POST", "/sms/count")[0]![1])).toEqual({
      target: { kind: "student", studentId: "s1" },
    });
    expect(screen.getByTestId("student-sms-sheet-sample")).toHaveTextContent("Ali Valiyev");

    await fireEvent.press(await screen.findByTestId("student-sms-sheet-template"));
    await fireEvent.press(await screen.findByTestId("student-sms-sheet-template-option-t1"));
    expect(screen.getByTestId("student-sms-sheet-text").props.value).toBe(
      "Lesson tomorrow at 10:00",
    );
    expect(screen.getByText("24 characters · 1 SMS")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("student-sms-sheet-send"));

    expect(await screen.findByTestId("student-sms-sheet-result")).toHaveTextContent(
      /Sent: 1, failed: 0\..*No SMS gateway is configured/,
    );
    expect(sentBody(calls("POST", "/sms/send")[0]![1])).toEqual({
      target: { kind: "student", studentId: "s1" },
      text: "Lesson tomorrow at 10:00",
    });
    // The list is read again, so the new message is on it.
    await waitFor(() => expect(calls("GET", "/students/s1/sms").length).toBeGreaterThan(1));
  });

  it("keeps Send SMS from people who may not send, and from a student without a phone", async () => {
    mockPermissions = ["students.view"];
    serve(page({ "GET /students/s1/sms": [] }));
    const client = await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-sms"));
    await screen.findByTestId("student-sms-empty");
    expect(screen.queryByTestId("student-sms-send")).toBeNull();
    client.clear();
    clearClients();

    mockPermissions = ALL;
    serve(page({ "GET /students/s1/sms": [] }, student({ phone: null })));
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-sms"));
    expect(await screen.findByTestId("student-sms-no-phone")).toHaveTextContent(
      "The student has no phone number.",
    );
    await fireEvent.press(screen.getByTestId("student-sms-send"));
    expect(calls("POST", "/sms/count")).toHaveLength(0);
  });
});

describe("the calls of a student", () => {
  const CALL: CallRow = {
    id: "c1",
    direction: "OUTBOUND",
    status: "MISSED",
    fromPhone: "+998711112233",
    toPhone: "+998901112233",
    staffName: "Dilnoza Karimova",
    durationSeconds: 75,
    startedAt: "2026-11-20T09:00:00.000Z",
  };

  it("lists the calls and rings through the centre's telephony", async () => {
    serve(
      page({
        "GET /students/s1/calls": [CALL],
        "POST /students/s1/call": { ...CALL, id: "c2", adapter: "fake" },
      }),
    );
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-calls"));
    expect(await screen.findByTestId("student-call-c1")).toHaveTextContent(
      /Outgoing, \+998901112233, Dilnoza Karimova, 1:15/,
    );
    expect(screen.getByTestId("student-call-c1")).toHaveTextContent(/Missed/);

    await fireEvent.press(screen.getByTestId("student-calls-call"));
    expect(await screen.findByTestId("student-calls-started")).toHaveTextContent(
      "The call was recorded; no telephony provider is connected yet.",
    );
    expect(sentBody(calls("POST", "/students/s1/call")[0]![1])).toEqual({
      phone: "+998901112233",
    });
  });

  it("writes a call's length in minutes and seconds", () => {
    expect(callLength(0)).toBe("0:00");
    expect(callLength(75)).toBe("1:15");
    expect(callLength(600)).toBe("10:00");
  });
});

describe("the history of a student", () => {
  const row = (change: Partial<StudentHistoryRow>): StudentHistoryRow => ({
    id: "h1",
    action: "payment.create",
    actorName: "Dilnoza Karimova",
    at: "2026-11-20T09:00:00.000Z",
    details: { amount: 400000 },
    ...change,
  });

  it("names what was done and brings the next page when asked", async () => {
    const pages: Record<string, Page<StudentHistoryRow>> = {
      "1": { items: [row({})], total: 21, page: 1, pageSize: 20 },
      "2": {
        items: [row({ id: "h2", action: "something.new", details: {}, actorName: null })],
        total: 21,
        page: 2,
        pageSize: 20,
      },
    };
    serve(
      page({
        "GET /students/s1/history": (url: string) => pages[/page=(\d+)/.exec(url)![1]!],
      }),
    );
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-history"));
    expect(await screen.findByTestId("student-history-h1")).toHaveTextContent(
      /Payment received.*amount: 400000.*Dilnoza Karimova/,
    );
    await fireEvent.press(screen.getByTestId("student-history-more"));
    // A step the app has no words for is shown by its own name.
    expect(await screen.findByTestId("student-history-h2")).toHaveTextContent(/something\.new/);
    expect(screen.queryByTestId("student-history-more")).toBeNull();
  });
});

describe("the parents of a student", () => {
  it("adds a parent and shows what the server says about the phone", async () => {
    let refuse = true;
    serve(
      page({
        "POST /students/s1/parents": () => {
          if (!refuse) return { id: "p2" };
          refuse = false;
          return answer(400, {
            error: {
              code: "VALIDATION",
              message: "errors.validation",
              fields: { phone: ["validation.phone"] },
            },
          });
        },
      }),
    );
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("parent-add"));
    await fireEvent.changeText(await screen.findByTestId("parent-name"), " Zarina Valiyeva ");
    expect(screen.getByTestId("parent-phone").props.value).toBe("+998");
    await fireEvent.changeText(screen.getByTestId("parent-phone"), "+99890");
    await fireEvent.press(screen.getByTestId("parent-save"));
    expect(await screen.findByText("Enter a number like +998 90 123 45 67.")).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId("parent-phone"), "+998905556677");
    await fireEvent.press(screen.getByTestId("parent-save"));
    await waitFor(() => expect(calls("POST", "/students/s1/parents")).toHaveLength(2));
    expect(sentBody(calls("POST", "/students/s1/parents")[1]![1])).toEqual({
      fullName: "Zarina Valiyeva",
      phone: "+998905556677",
    });
    // The page is read again with the new parent.
    await waitFor(() => expect(calls("GET", "/students/s1").length).toBeGreaterThan(1));
  });

  it("removes a parent only after the question is answered", async () => {
    serve(page({ "DELETE /parents/p1": undefined }));
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("parent-remove-p1"));
    expect(
      await screen.findByText("“Vali Valiyev” is removed from this student."),
    ).toBeOnTheScreen();
    expect(calls("DELETE", "/parents/p1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("parent-delete-confirm"));
    await waitFor(() => expect(calls("DELETE", "/parents/p1")).toHaveLength(1));
  });

  it("texts all the parents at once", async () => {
    serve(
      page({
        "POST /sms/count": { count: 1, skipped: 0, sample: ["Vali Valiyev"] },
        "GET /sms-templates": [],
        "POST /sms/send": { total: 1, sent: 1, failed: 0, skipped: 0, adapter: "eskiz" },
      }),
    );
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("parents-sms"));
    await fireEvent.changeText(await screen.findByTestId("parents-sms-sheet-text"), "Hello");
    await waitFor(() =>
      expect(screen.getByTestId("parents-sms-sheet-recipients")).toHaveTextContent(
        /1 recipient \(/,
      ),
    );
    await fireEvent.press(screen.getByTestId("parents-sms-sheet-send"));
    expect(await screen.findByTestId("parents-sms-sheet-result")).toHaveTextContent(
      "Sent: 1, failed: 0.",
    );
    expect(sentBody(calls("POST", "/sms/send")[0]![1])).toEqual({
      target: { kind: "parents", studentId: "s1" },
      text: "Hello",
    });
  });

  it("leaves a teacher only the numbers to call", async () => {
    mockView = "TEACHER";
    serve({ "GET /students/s1": student() });
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("parent-call-p1")).toBeOnTheScreen();
    expect(screen.queryByTestId("parent-add")).toBeNull();
    expect(screen.queryByTestId("parents-sms")).toBeNull();
    expect(screen.queryByTestId("parent-remove-p1")).toBeNull();
    expect(screen.queryByTestId("family-card")).toBeNull();
    expect(screen.queryByTestId("access-card")).toBeNull();
    expect(screen.queryByTestId("student-tab-sms")).toBeNull();
    expect(screen.queryByTestId("student-tab-history")).toBeNull();
    expect(screen.queryByTestId("student-blacklist")).toBeNull();
    expect(screen.queryByTestId("student-badge")).toBeNull();
    expect(calls("GET", "/students/s1/family")).toHaveLength(0);
    expect(calls("GET", "/students/s1/access")).toHaveLength(0);
  });
});

describe("the family of a student", () => {
  it("links the first sibling with the family's name and discount", async () => {
    serve(
      page({
        "GET /students": {
          items: [student(), student({ id: "s2", fullName: "Laylo Valiyeva", phone: null })],
          total: 2,
          page: 1,
          pageSize: 8,
        },
        "POST /students/s1/family/link": FAMILY,
      }),
    );
    await renderScreen(<StudentScreen />);
    expect(await screen.findByText("No siblings linked yet.")).toBeOnTheScreen();
    expect(screen.queryByTestId("family-page")).toBeNull();
    await fireEvent.press(screen.getByTestId("family-link"));

    // Nobody picked: the form asks for a student.
    await fireEvent.press(await screen.findByTestId("family-link-save"));
    expect(await screen.findByText("Choose a student.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("family-sibling-search"), "Val");
    await fireEvent.press(await screen.findByTestId("family-found-s2"));
    // The student is never offered as their own sibling.
    expect(screen.queryByTestId("family-found-s1")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("family-link-name"), "Valiyevlar");
    await fireEvent.changeText(screen.getByTestId("family-link-percent"), "150");
    await fireEvent.press(screen.getByTestId("family-link-save"));
    expect(await screen.findByText("Enter a whole number from 0 to 100.")).toBeOnTheScreen();
    expect(calls("POST", "/students/s1/family/link")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("family-link-percent"), "10");
    await fireEvent.press(screen.getByTestId("family-link-save"));
    await waitFor(() => expect(calls("POST", "/students/s1/family/link")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/s1/family/link")[0]![1])).toEqual({
      studentId: "s2",
      name: "Valiyevlar",
      discountPercent: 10,
    });
  });

  it("shows the family, opens a sibling and changes the discount", async () => {
    serve({
      ...page(),
      "GET /students/s1/family": FAMILY,
      "PATCH /families/fam1": FAMILY,
    });
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("family-discount")).toHaveTextContent("Family discount 10%");
    expect(screen.getByTestId("family-name")).toHaveTextContent("Valiyevlar, 2 members");
    expect(screen.getByTestId("family-member-s1")).toHaveTextContent(/GE-Morning A1/);
    expect(screen.getByTestId("family-member-s2")).toHaveTextContent(/no groups/);
    await fireEvent.press(screen.getByTestId("family-member-s2"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s2" },
    });

    await fireEvent.press(screen.getByTestId("family-edit"));
    expect((await screen.findByTestId("family-edit-name")).props.value).toBe("Valiyevlar");
    await fireEvent.changeText(screen.getByTestId("family-edit-percent"), "15");
    await fireEvent.changeText(screen.getByTestId("family-edit-note"), "");
    await fireEvent.press(screen.getByTestId("family-edit-save"));
    await waitFor(() => expect(calls("PATCH", "/families/fam1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/families/fam1")[0]![1])).toEqual({
      name: "Valiyevlar",
      discountPercent: 15,
      note: null,
    });
  });

  it("keeps the percent as it was for people who may not give discounts", async () => {
    mockPermissions = ALL.filter((p) => p !== "discounts.give");
    serve({ ...page(), "GET /students/s1/family": FAMILY, "PATCH /families/fam1": FAMILY });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("family-edit"));
    expect((await screen.findByTestId("family-edit-percent")).props.editable).toBe(false);
    await fireEvent.changeText(screen.getByTestId("family-edit-name"), "Valiyev family");
    await fireEvent.press(screen.getByTestId("family-edit-save"));
    await waitFor(() => expect(calls("PATCH", "/families/fam1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/families/fam1")[0]![1])).toEqual({
      name: "Valiyev family",
      discountPercent: 10,
      note: "Two children",
    });
  });

  it("takes the student out of the family after the question", async () => {
    serve({ ...page(), "GET /students/s1/family": FAMILY, "DELETE /students/s1/family": {} });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("family-leave"));
    expect(await screen.findByText("Remove Ali Valiyev from the family?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("family-leave-sheet-confirm"));
    await waitFor(() => expect(calls("DELETE", "/students/s1/family")).toHaveLength(1));
  });

  it("shares the parents' page, texts it and replaces it", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });
    serve({
      ...page(),
      "GET /students/s1/family": FAMILY,
      "GET /students/s1/family/page": { url: "https://kampus.test/family/old" },
      "POST /students/s1/family/page": { url: "https://kampus.test/family/new" },
      "POST /sms/send": { total: 2, sent: 2, failed: 0, skipped: 0, adapter: "eskiz" },
    });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("family-page"));
    expect(await screen.findByTestId("family-page-url")).toHaveTextContent(
      "https://kampus.test/family/old",
    );
    await fireEvent.press(screen.getByTestId("family-page-share"));
    expect(share).toHaveBeenCalledWith({ message: "https://kampus.test/family/old" });

    await fireEvent.press(screen.getByTestId("family-page-sms"));
    expect(await screen.findByTestId("family-page-sent")).toHaveTextContent("Sent to 2 phones");
    expect(sentBody(calls("POST", "/sms/send")[0]![1])).toEqual({
      target: { kind: "parents", studentId: "s1" },
      text: "Your children's page: https://kampus.test/family/old",
    });

    await fireEvent.press(screen.getByTestId("family-page-renew"));
    await waitFor(() =>
      expect(screen.getByTestId("family-page-url")).toHaveTextContent(
        "https://kampus.test/family/new",
      ),
    );
    // What was said about the old link goes with it.
    expect(screen.queryByTestId("family-page-sent")).toBeNull();
  });

  it("reads a whole percent only", () => {
    expect(typedPercent("0")).toBe(0);
    expect(typedPercent(" 15 ")).toBe(15);
    expect(typedPercent("100")).toBe(100);
    expect(typedPercent("101")).toBeNull();
    expect(typedPercent("7.5")).toBeNull();
    expect(typedPercent("")).toBeNull();
  });
});

describe("who signs in as a student", () => {
  it("lists the Telegram accounts and takes access away after the question", async () => {
    serve({
      ...page(),
      "GET /students/s1/access": ACCESS,
      "POST /students/s1/access/l1/sign-out": {},
      "DELETE /students/s1/access/l2": undefined,
    });
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("access-l1")).toHaveTextContent(/Ali @ali_v/);
    expect(screen.getByTestId("access-l1")).toHaveTextContent(
      /Phone matched in Telegram.*last seen.*2 devices/,
    );
    expect(screen.getByTestId("access-l2")).toHaveTextContent(/Parent: Vali Valiyev/);
    expect(screen.getByTestId("access-l2")).toHaveTextContent(/Linked by staff.*signed out/);
    // Nothing to sign out where nobody is signed in.
    expect(screen.queryByTestId("access-sign-out-l2")).toBeNull();

    await fireEvent.press(screen.getByTestId("access-sign-out-l1"));
    expect(await screen.findByText("Sign Ali out on every device?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("access-confirm-confirm"));
    await waitFor(() => expect(calls("POST", "/students/s1/access/l1/sign-out")).toHaveLength(1));

    await fireEvent.press(screen.getByTestId("access-unlink-l2"));
    expect(await screen.findByText("Remove Vali's access?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("access-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/students/s1/access/l2")).toHaveLength(1));
  });

  it("only shows them to people who may not change a student", async () => {
    mockPermissions = ["students.view"];
    serve({ ...page(), "GET /students/s1/access": ACCESS, "GET /students/s1/family": FAMILY });
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("access-l1")).toBeOnTheScreen();
    expect(screen.queryByTestId("access-sign-out-l1")).toBeNull();
    expect(screen.queryByTestId("access-unlink-l1")).toBeNull();
    expect(await screen.findByTestId("family-page")).toBeOnTheScreen();
    expect(screen.queryByTestId("family-link")).toBeNull();
    expect(screen.queryByTestId("family-edit")).toBeNull();
    expect(screen.queryByTestId("parent-add")).toBeNull();
    expect(screen.queryByTestId("student-add-field")).toBeNull();
    expect(screen.queryByTestId("student-field-remove-f1")).toBeNull();
    expect(screen.getByTestId("student-person")).toHaveTextContent(/T-shirt: M/);
  });
});

describe("the rest of a student's card", () => {
  it("adds a line of extra information and removes one", async () => {
    serve(
      page({
        "POST /students/s1/custom-fields": { id: "f2" },
        "DELETE /custom-fields/f1": undefined,
      }),
    );
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("student-field-f1")).toHaveTextContent("T-shirt: M");
    await fireEvent.press(screen.getByTestId("student-add-field"));
    await fireEvent.changeText(await screen.findByTestId("field-name"), "Allergy");
    await fireEvent.changeText(screen.getByTestId("field-value"), " nuts ");
    await fireEvent.press(screen.getByTestId("field-save"));
    await waitFor(() => expect(calls("POST", "/students/s1/custom-fields")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/s1/custom-fields")[0]![1])).toEqual({
      name: "Allergy",
      value: "nuts",
    });

    await fireEvent.press(screen.getByTestId("student-field-remove-f1"));
    await waitFor(() => expect(calls("DELETE", "/custom-fields/f1")).toHaveLength(1));
  });

  it("blacklists after the question, and takes a student off the blacklist", async () => {
    serve(page({ "POST /students/s1/blacklist": student({ isBlacklisted: true }) }));
    const client = await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-blacklist"));
    expect(await screen.findByText("Blacklist student?")).toBeOnTheScreen();
    expect(calls("POST", "/students/s1/blacklist")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("blacklist-confirm"));
    await waitFor(() => expect(calls("POST", "/students/s1/blacklist")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/s1/blacklist")[0]![1])).toEqual({ value: true });
    client.clear();
    clearClients();
    fetchMock.mockClear();

    serve(page({ "POST /students/s1/blacklist": student() }, student({ isBlacklisted: true })));
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("student-blacklist")).toHaveTextContent(
      "Remove from blacklist",
    );
    await fireEvent.press(screen.getByTestId("student-blacklist"));
    await fireEvent.press(await screen.findByTestId("blacklist-confirm"));
    await waitFor(() => expect(calls("POST", "/students/s1/blacklist")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students/s1/blacklist")[0]![1])).toEqual({ value: false });
  });

  it("opens the badge to print on the site", async () => {
    serve(page());
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-badge"));
    expect(mockOpenOnSite).toHaveBeenCalledWith("/en/students/s1/badge");
  });
});

describe("the count of an SMS", () => {
  it("counts Latin text by 160 and other alphabets by 70", () => {
    expect(smsParts("")).toEqual({ chars: 0, parts: 0 });
    expect(smsParts("a".repeat(160))).toEqual({ chars: 160, parts: 1 });
    expect(smsParts("a".repeat(161))).toEqual({ chars: 161, parts: 2 });
    expect(smsParts("я".repeat(70))).toEqual({ chars: 70, parts: 1 });
    expect(smsParts("я".repeat(71))).toEqual({ chars: 71, parts: 2 });
    expect(smsParts("o'quvchi")).toEqual({ chars: 8, parts: 1 });
  });
});
