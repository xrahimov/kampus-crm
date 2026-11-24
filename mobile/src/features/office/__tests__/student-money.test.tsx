import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type {
  Adjustment,
  InstalmentPlan,
  LegacyPayment,
  MembershipCalendar,
} from "@/api/office-student-money";
import type { Payment, PaymentOptions } from "@/api/office-students";
import type { StudentDetail, StudentGroupCard } from "@/api/types";
import { dayKind, draftParts, equalParts } from "@/features/office/student-groups";
import { StudentScreen } from "@/features/staff/student-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

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
 * A student's groups and money for the office, in the app (A-241): the group
 * cards with the lesson calendar and what is done with a membership, refunds,
 * balance corrections and the payments of the system before. Each test plays
 * the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

const ALL = [
  "students.view",
  "students.update",
  "groups.update",
  "leads.create",
  "payments.create",
  "payments.refund",
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

function group(change: Partial<StudentGroupCard> = {}): StudentGroupCard {
  return {
    membershipId: "m1",
    groupId: "g1",
    groupName: "GE-Morning A1",
    courseName: "General English",
    status: "ACTIVE",
    groupStatus: "ACTIVE",
    teacherName: "Jasur Aliyev",
    time: "09:00–10:30",
    weekdays: [1, 3, 5],
    balance: -400000,
    joinedAt: "2026-09-01",
    billingFrom: null,
    leftAt: null,
    groupStartDate: "2026-09-01",
    groupEndDate: "2027-02-28",
    customPrice: null,
    note: null,
    nextPaymentDate: "2026-12-01",
    monthlyPrice: 400000,
    discount: null,
    instalments: [],
    lessonsLeft: null,
    gradeAverage: 4.5,
    ...change,
  };
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
    balance: -400000,
    groups: [group()],
    birthDate: null,
    schoolName: null,
    parents: [],
    customFields: [],
    ...change,
  };
}

const NOVEMBER: MembershipCalendar = {
  month: "2026-11-01",
  months: ["2026-10-01", "2026-11-01"],
  days: [
    { date: "2026-11-02", status: "PRESENT", paid: true },
    { date: "2026-11-04", status: "PRESENT", paid: false },
    { date: "2026-11-06", status: "ABSENT", paid: false },
    { date: "2026-11-09", status: "EXCUSED", paid: false },
    { date: "2026-11-27", status: "UPCOMING", paid: false },
  ],
  counts: { present: 2, absent: 1, excused: 1, notMarked: 0 },
};
const OCTOBER: MembershipCalendar = {
  month: "2026-10-01",
  months: ["2026-10-01", "2026-11-01"],
  days: [],
  counts: { present: 0, absent: 0, excused: 0, notMarked: 0 },
};

const PAY_OPTIONS: PaymentOptions = {
  methods: [{ id: "pm1", name: "Cash" }],
  printReceiptAfterPayment: false,
  refundsEnabled: true,
};

function payment(change: Partial<Payment> = {}): Payment {
  return {
    id: "p1",
    studentId: "s1",
    studentName: "Ali Valiyev",
    membershipId: "m1",
    groupId: "g1",
    groupName: "GE-Morning A1",
    methodName: "Cash",
    amount: 400000,
    bonus: 0,
    refunded: 100000,
    effectiveMonth: "2026-10-01",
    paidAt: "2026-10-05",
    comment: null,
    receivedByName: "Dilnoza Karimova",
    createdAt: "2026-10-05T09:00:00.000Z",
    ...change,
  };
}

/** The student's page with a group's calendar answered, plus what a test adds. */
function page(routes: Routes = {}, who: StudentDetail = student()): Routes {
  return {
    ...routes,
    "GET /students/s1": who,
    "GET /calendar": (url: string) => (url.includes("month=2026-10-01") ? OCTOBER : NOVEMBER),
    "GET /students/s1/family": null,
    "GET /students/s1/access": [],
  };
}

async function openMenu(membershipId = "m1") {
  await fireEvent.press(await screen.findByTestId(`group-card-menu-${membershipId}`));
}

describe("a student's group card", () => {
  it("shows the money, the dates, a discount, a split fee and the month's lessons", async () => {
    serve(
      page(
        {},
        student({
          groups: [
            group({
              customPrice: 350000,
              monthlyPrice: 350000,
              billingFrom: "2026-09-15",
              note: "Pays on the 5th",
              discount: {
                remainingMonths: 2,
                discountedPrice: 300000,
                percent: 0,
                givenAt: "2026-10-01",
                comment: "Olympiad winner",
                familyId: null,
              },
              instalments: [
                { id: "i1", dueDate: "2026-11-05", amount: 200000, paid: true },
                { id: "i2", dueDate: "2026-11-20", amount: 150000, paid: false },
              ],
            }),
          ],
        }),
      ),
    );
    await renderScreen(<StudentScreen />);
    const card = await screen.findByTestId("group-card-m1");
    expect(screen.getByTestId("group-card-balance-m1")).toHaveTextContent(/400,000/);
    expect(screen.getByTestId("group-card-status-m1")).toHaveTextContent("Active");
    expect(card).toHaveTextContent(/Charged from/);
    expect(card).toHaveTextContent(/350,000 \(custom\)/);
    expect(card).toHaveTextContent(/Pays on the 5th/);
    expect(screen.getByTestId("group-card-discount-m1")).toHaveTextContent(
      /300,000 per month, 2 months left.*Comment: Olympiad winner/,
    );
    expect(screen.getByTestId("group-card-instalments-m1")).toHaveTextContent(/200,000.*paid/);

    // The calendar: each lesson reads its day and what it was.
    expect(await screen.findByTestId("calendar-month-m1")).toHaveTextContent(/Nov 2026/);
    expect(screen.getByTestId("calendar-day-2026-11-02").props.accessibilityLabel).toBe(
      "Nov 2, Paid",
    );
    expect(screen.getByTestId("calendar-day-2026-11-04").props.accessibilityLabel).toBe(
      "Nov 4, Debt",
    );
    expect(screen.getByTestId("calendar-day-2026-11-06").props.accessibilityLabel).toBe(
      "Nov 6, Absent",
    );
    expect(screen.getByTestId("calendar-day-2026-11-27").props.accessibilityLabel).toBe(
      "Nov 27, Upcoming",
    );
    expect(screen.getByTestId("calendar-m1")).toHaveTextContent(/Present: 2/);
    // November is the last month: there is no next one to go to.
    expect(screen.getByTestId("calendar-next-m1").props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId("calendar-prev-m1"));
    await waitFor(() =>
      expect(screen.getByTestId("calendar-month-m1")).toHaveTextContent(/Oct 2026/),
    );
    expect(screen.getByTestId("calendar-m1")).toHaveTextContent(/No lessons this month\./);
    expect(calls("GET", "/memberships/m1/calendar").at(-1)![0]).toContain("month=2026-10-01");

    await fireEvent.press(screen.getByTestId("student-group-g1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/group/[id]", params: { id: "g1" } });
  });

  it("keeps the groups the student has left behind a button", async () => {
    serve(
      page(
        {},
        student({
          groups: [
            group(),
            group({
              membershipId: "m0",
              groupId: "g0",
              groupName: "Kids Starter",
              status: "ARCHIVED",
              leftAt: "2026-08-31",
            }),
          ],
        }),
      ),
    );
    await renderScreen(<StudentScreen />);
    await screen.findByTestId("group-card-m1");
    expect(screen.queryByTestId("group-card-m0")).toBeNull();
    await fireEvent.press(screen.getByTestId("student-groups-left"));
    expect(await screen.findByTestId("group-card-m0")).toHaveTextContent(/Left on/);
    // Nothing is done with a membership that has ended.
    expect(screen.queryByTestId("group-card-menu-m0")).toBeNull();
    expect(screen.getByTestId("student-groups-left")).toHaveTextContent("Hide archived groups");
  });

  it("changes the status, and offers only what the person may do", async () => {
    serve(page({ "PATCH /memberships/m1": {} }));
    const client = await renderScreen(<StudentScreen />);
    await openMenu();
    expect(await screen.findByTestId("group-to-FROZEN")).toBeOnTheScreen();
    expect(screen.getByTestId("group-to-GRADUATED")).toHaveTextContent("Graduate");
    await fireEvent.press(screen.getByTestId("group-to-FROZEN"));
    await waitFor(() => expect(calls("PATCH", "/memberships/m1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/memberships/m1")[0]![1])).toEqual({ status: "FROZEN" });
    client.clear();
    clearClients();

    // A cashier: the payment and the split, not the membership.
    mockPermissions = ["students.view", "payments.create"];
    serve(page());
    await renderScreen(<StudentScreen />);
    await openMenu();
    expect(await screen.findByTestId("group-pay")).toBeOnTheScreen();
    expect(screen.getByTestId("group-split")).toBeOnTheScreen();
    expect(screen.queryByTestId("group-to-FROZEN")).toBeNull();
    expect(screen.queryByTestId("group-transfer")).toBeNull();
    expect(screen.queryByTestId("group-to-lead")).toBeNull();
    expect(screen.queryByTestId("group-remove")).toBeNull();
  });

  it("has no menu for someone who may only look, and no split in a package group", async () => {
    mockPermissions = ["students.view"];
    serve(page());
    const client = await renderScreen(<StudentScreen />);
    await screen.findByTestId("group-card-m1");
    expect(screen.queryByTestId("group-card-menu-m1")).toBeNull();
    client.clear();
    clearClients();

    mockPermissions = ALL;
    serve(page({}, student({ groups: [group({ lessonsLeft: 0 })] })));
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("group-card-lessons-m1")).toHaveTextContent("Lessons left: 0");
    expect(screen.getByTestId("group-card-m1")).not.toHaveTextContent(/Monthly price/);
    await openMenu();
    await screen.findByTestId("group-pay");
    expect(screen.queryByTestId("group-split")).toBeNull();
  });

  it("takes a payment into that group", async () => {
    serve(
      page({
        "GET /payments/options": PAY_OPTIONS,
        "GET /payment-info": {
          membershipId: "m1",
          balance: -400000,
          monthlyPrice: 400000,
          suggestedMonth: "2026-11-01",
          suggestedAmount: 400000,
          nextPaymentDate: null,
          months: ["2026-11-01"],
          groupName: "GE-Morning A1",
          studentName: "Ali Valiyev",
        },
      }),
    );
    await renderScreen(<StudentScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByTestId("group-pay"));
    expect(await screen.findByTestId("payment-info")).toBeOnTheScreen();
    expect(calls("GET", "/memberships/m1/payment-info").length).toBeGreaterThan(0);
  });

  it("returns the student to leads with a reason", async () => {
    serve(page({ "POST /memberships/m1/to-lead": { id: "lead1" } }));
    await renderScreen(<StudentScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByTestId("group-to-lead"));
    expect(
      await screen.findByText(
        "“Ali Valiyev” leaves the group today and appears as a new lead on the board.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("to-lead-reason"), " Moving abroad ");
    await fireEvent.press(screen.getByTestId("to-lead-save"));
    await waitFor(() => expect(calls("POST", "/memberships/m1/to-lead")).toHaveLength(1));
    expect(sentBody(calls("POST", "/memberships/m1/to-lead")[0]![1])).toEqual({
      reason: "Moving abroad",
    });
  });

  it("removes the student from the group, and moves them to another", async () => {
    serve(
      page({
        "GET /leave-reasons": [],
        "POST /memberships/m1/remove": {},
        "POST /memberships/m1/transfer": {},
        "GET /students/options": {
          schools: [],
          sources: [],
          courses: [],
          groups: [
            { id: "g1", name: "GE-Morning A1", branchId: "b1", status: "ACTIVE" },
            { id: "g2", name: "GE-Evening A1", branchId: "b1", status: "ACTIVE" },
          ],
          teachers: [],
          paymentMethods: [],
        },
      }),
    );
    await renderScreen(<StudentScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByTestId("group-transfer"));
    await fireEvent.press(await screen.findByTestId("member-transfer-group"));
    await fireEvent.press(await screen.findByTestId("member-transfer-group-option-g2"));
    await fireEvent.changeText(screen.getByTestId("member-transfer-date"), "01.12.2026");
    await fireEvent.press(screen.getByTestId("member-transfer-save"));
    await waitFor(() => expect(calls("POST", "/memberships/m1/transfer")).toHaveLength(1));
    expect(sentBody(calls("POST", "/memberships/m1/transfer")[0]![1])).toMatchObject({
      groupId: "g2",
      joinedAt: "2026-12-01",
    });

    await openMenu();
    await fireEvent.press(await screen.findByTestId("group-remove"));
    expect(
      await screen.findByText("“Ali Valiyev” leaves the group. Payments and attendance stay."),
    ).toBeOnTheScreen();
    await fireEvent.changeText(await screen.findByTestId("member-remove-reason"), "Too far");
    await fireEvent.press(screen.getByTestId("member-remove-save"));
    await waitFor(() => expect(calls("POST", "/memberships/m1/remove")).toHaveLength(1));
    expect(sentBody(calls("POST", "/memberships/m1/remove")[0]![1])).toEqual({
      reason: "Too far",
    });
  });

  it("leaves a teacher the plain list of groups", async () => {
    mockView = "TEACHER";
    serve({ "GET /students/s1": student() });
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("student-group-g1")).toBeOnTheScreen();
    expect(screen.queryByTestId("group-card-m1")).toBeNull();
    expect(calls("GET", "/memberships/m1/calendar")).toHaveLength(0);
  });
});

describe("a month's fee split into parts", () => {
  const PLAN: InstalmentPlan = {
    membershipId: "m1",
    groupName: "GE-Morning A1",
    month: "2099-01-01",
    months: ["2099-01-01", "2099-02-01"],
    amount: 400001,
    parts: [],
    balance: -400000,
  };

  it("starts with two halves, takes a third part and sends them", async () => {
    let refuse = true;
    serve(
      page({
        "GET /memberships/m1/instalments": PLAN,
        "PUT /memberships/m1/instalments": () => {
          if (!refuse) return {};
          refuse = false;
          return answer(400, {
            error: {
              code: "VALIDATION",
              message: "errors.validation",
              fields: { parts: ["validation.instalmentsSum"] },
            },
          });
        },
      }),
    );
    await renderScreen(<StudentScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByTestId("group-split"));
    expect(await screen.findByTestId("split-amount")).toHaveTextContent(/400,001/);
    // A month that has not begun: the first part falls on its first day, the second fifteen days on.
    expect(screen.getByTestId("split-date-0").props.value).toBe("01.01.2099");
    expect(screen.getByTestId("split-date-1").props.value).toBe("16.01.2099");
    expect(screen.getByTestId("split-amount-0").props.value).toBe("200000");
    expect(screen.getByTestId("split-amount-1").props.value).toBe("200001");
    expect(screen.getByTestId("split-left")).toHaveTextContent(/Left to allocate:.*\b0\b/);
    // Two parts is the least: neither can be removed.
    expect(screen.queryByTestId("split-remove-0")).toBeNull();

    await fireEvent.press(screen.getByTestId("split-add"));
    expect(screen.getByTestId("split-date-2").props.value).toBe("26.01.2099");
    expect(screen.getByTestId("split-add").props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId("split-amount-2"), "50 000");
    expect(screen.getByTestId("split-left")).toHaveTextContent(/-.*50,000/);
    await fireEvent.press(screen.getByTestId("split-save"));
    expect(await screen.findByTestId("split-parts-problem")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("split-equal"));
    expect(screen.getByTestId("split-amount-0").props.value).toBe("133333");
    expect(screen.getByTestId("split-amount-2").props.value).toBe("133335");
    await fireEvent.press(screen.getByTestId("split-save"));
    await waitFor(() => expect(calls("PUT", "/memberships/m1/instalments")).toHaveLength(2));
    expect(sentBody(calls("PUT", "/memberships/m1/instalments")[1]![1])).toEqual({
      month: "2099-01-01",
      parts: [
        { dueDate: "2099-01-01", amount: 133333 },
        { dueDate: "2099-01-16", amount: 133333 },
        { dueDate: "2099-01-26", amount: 133335 },
      ],
    });
  });

  it("shows a split that exists and removes it", async () => {
    serve(
      page({
        "GET /memberships/m1/instalments": {
          ...PLAN,
          parts: [
            {
              id: "i1",
              month: "2099-01-01",
              dueDate: "2099-01-05",
              amount: 250001,
              remaining: 0,
              paid: true,
            },
            {
              id: "i2",
              month: "2099-01-01",
              dueDate: "2099-01-20",
              amount: 150000,
              remaining: 150000,
              paid: false,
            },
          ],
        },
        "DELETE /memberships/m1/instalments": {},
      }),
    );
    await renderScreen(<StudentScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByTestId("group-split"));
    expect((await screen.findByTestId("split-date-0")).props.value).toBe("05.01.2099");
    expect(screen.getByTestId("split-part-0")).toHaveTextContent(/paid/);
    await fireEvent.press(screen.getByTestId("split-clear"));
    await waitFor(() => expect(calls("DELETE", "/memberships/m1/instalments")).toHaveLength(1));
    expect(calls("DELETE", "/memberships/m1/instalments")[0]![0]).toContain("month=2099-01-01");
  });

  it("splits whole sums and draws a lesson by what happened", () => {
    expect(equalParts(400000, 2)).toEqual([200000, 200000]);
    expect(equalParts(400001, 3)).toEqual([133333, 133333, 133335]);
    // A month already running starts from today.
    expect(draftParts({ ...PLAN, month: "2026-11-01" }, "2026-11-24")).toEqual([
      { dueDate: "2026-11-24", amount: "200000", paid: false },
      { dueDate: "2026-12-09", amount: "200001", paid: false },
    ]);
    expect(dayKind({ date: "2026-11-02", status: "PRESENT", paid: true })).toBe("paid");
    expect(dayKind({ date: "2026-11-02", status: "NOT_MARKED", paid: false })).toBe("debt");
    expect(dayKind({ date: "2026-11-02", status: "EXCUSED", paid: true })).toBe("excused");
    expect(dayKind({ date: "2026-11-02", status: "ABSENT", paid: true })).toBe("absent");
    expect(dayKind({ date: "2026-11-02", status: "UPCOMING", paid: false })).toBe("upcoming");
  });
});

describe("a student's money", () => {
  const ADJUSTMENT: Adjustment = {
    id: "a1",
    membershipId: "m1",
    groupName: "GE-Morning A1",
    amount: -150000,
    kind: "OPENING",
    date: "2026-09-01",
    comment: "From the old system",
    createdByName: "Dilnoza Karimova",
  };
  const LEGACY: LegacyPayment[] = [
    {
      id: "l1",
      groupName: "GE-Morning A1",
      amount: 300000,
      paidAt: "2026-05-05",
      method: "Cash",
      comment: null,
    },
    {
      id: "l2",
      groupName: null,
      amount: 200000,
      paidAt: "2026-04-05",
      method: null,
      comment: null,
    },
  ];

  function money(routes: Routes = {}, who: StudentDetail = student()): Routes {
    return page(
      {
        "GET /payments/options": PAY_OPTIONS,
        "GET /payments": {
          items: [
            payment(),
            payment({ id: "p2", refunded: 400000, paidAt: "2026-09-05" }),
            payment({
              id: "p3",
              refunded: 0,
              groupId: "g2",
              groupName: "IELTS 6.5",
              amount: 600000,
              fiscal: { status: "FAILED", error: "timeout" },
            }),
          ],
          total: 3,
          page: 1,
          pageSize: 50,
        },
        "GET /students/s1/adjustments": [],
        ...routes,
      },
      who,
    );
  }

  async function openPayments() {
    await fireEvent.press(await screen.findByTestId("student-tab-payments"));
    await screen.findByTestId("payment-p1");
  }

  it("refunds part of a payment that still has something to give back", async () => {
    serve(money({ "POST /payments/p1/refund": {} }));
    await renderScreen(<StudentScreen />);
    await openPayments();
    await fireEvent.press(screen.getByTestId("student-refund"));
    expect(await screen.findByTestId("refund-left")).toHaveTextContent(
      /300,000 can still be refunded/,
    );
    // A payment refunded in full is not offered.
    await fireEvent.press(screen.getByTestId("refund-payment"));
    await screen.findByTestId("refund-payment-option-p3");
    expect(screen.queryByTestId("refund-payment-option-p2")).toBeNull();
    await fireEvent.press(await screen.findByTestId("refund-payment-option-p1"));

    await fireEvent.changeText(screen.getByTestId("refund-amount"), "100 000");
    await fireEvent.changeText(screen.getByTestId("refund-reason"), "Missed two weeks");
    await fireEvent.press(screen.getByTestId("refund-save"));
    await waitFor(() => expect(calls("POST", "/payments/p1/refund")).toHaveLength(1));
    expect(sentBody(calls("POST", "/payments/p1/refund")[0]![1])).toEqual({
      amount: 100000,
      reason: "Missed two weeks",
    });
  });

  it("offers no refund where the centre has switched refunds off, or without the right", async () => {
    serve(money({ "GET /payments/options": { ...PAY_OPTIONS, refundsEnabled: false } }));
    const client = await renderScreen(<StudentScreen />);
    await openPayments();
    expect(screen.queryByTestId("student-refund")).toBeNull();
    expect(screen.getByTestId("student-adjust")).toBeOnTheScreen();
    client.clear();
    clearClients();

    mockPermissions = ["students.view"];
    serve(money({ "GET /students/s1/adjustments": [ADJUSTMENT] }));
    await renderScreen(<StudentScreen />);
    await openPayments();
    expect(screen.queryByTestId("student-refund")).toBeNull();
    expect(screen.queryByTestId("student-adjust")).toBeNull();
    // The correction is there to read, not to remove.
    expect(await screen.findByTestId("adjustment-a1")).toBeOnTheScreen();
    expect(screen.queryByTestId("adjustment-remove-a1")).toBeNull();
  });

  it("records a debt brought from the old system as a minus", async () => {
    serve(money({ "POST /adjustments": {} }));
    await renderScreen(<StudentScreen />);
    await openPayments();
    await fireEvent.press(screen.getByTestId("student-adjust"));
    await fireEvent.changeText(await screen.findByTestId("adjust-amount"), "150 000");
    await fireEvent.changeText(screen.getByTestId("adjust-date"), "01.09.2026");
    await fireEvent.changeText(screen.getByTestId("adjust-comment"), "From the old system");
    await fireEvent.press(screen.getByTestId("adjust-save"));
    await waitFor(() => expect(calls("POST", "/adjustments")).toHaveLength(1));
    expect(sentBody(calls("POST", "/adjustments")[0]![1])).toEqual({
      membershipId: "m1",
      amount: -150000,
      kind: "OPENING",
      date: "2026-09-01",
      comment: "From the old system",
    });

    // A credit, as a correction.
    await fireEvent.press(screen.getByTestId("student-adjust"));
    await fireEvent.press(await screen.findByTestId("adjust-direction-credit"));
    await fireEvent.press(screen.getByTestId("adjust-kind"));
    await fireEvent.press(await screen.findByTestId("adjust-kind-option-CORRECTION"));
    await fireEvent.changeText(screen.getByTestId("adjust-amount"), "20000");
    await fireEvent.changeText(screen.getByTestId("adjust-date"), "02.09.2026");
    await fireEvent.press(screen.getByTestId("adjust-save"));
    await waitFor(() => expect(calls("POST", "/adjustments")).toHaveLength(2));
    expect(sentBody(calls("POST", "/adjustments")[1]![1])).toEqual({
      membershipId: "m1",
      amount: 20000,
      kind: "CORRECTION",
      date: "2026-09-02",
      comment: null,
    });
  });

  it("lists the corrections and takes one back after the question", async () => {
    serve(
      money({
        "GET /students/s1/adjustments": [ADJUSTMENT],
        "DELETE /adjustments/a1": undefined,
      }),
    );
    await renderScreen(<StudentScreen />);
    await openPayments();
    expect(await screen.findByTestId("adjustment-a1")).toHaveTextContent(
      /GE-Morning A1, Opening balance, Dilnoza Karimova.*From the old system.*-.*150,000/,
    );
    await fireEvent.press(screen.getByTestId("adjustment-remove-a1"));
    expect(await screen.findByText("Remove this adjustment?")).toBeOnTheScreen();
    expect(calls("DELETE", "/adjustments/a1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("adjustment-delete-confirm"));
    await waitFor(() => expect(calls("DELETE", "/adjustments/a1")).toHaveLength(1));
  });

  it("shows the payments of the system before with their total, and none on a server without them", async () => {
    serve(money({ "GET /students/s1/payment-history": LEGACY, "DELETE /payment-history/l2": {} }));
    const client = await renderScreen(<StudentScreen />);
    await openPayments();
    expect(await screen.findByTestId("legacy-payment-l1")).toHaveTextContent(
      /GE-Morning A1, Cash.*300,000/,
    );
    expect(screen.getByTestId("legacy-payments-total")).toHaveTextContent(/Total.*500,000/);
    await fireEvent.press(screen.getByTestId("legacy-payment-remove-l2"));
    await fireEvent.press(await screen.findByTestId("legacy-payment-delete-confirm"));
    await waitFor(() => expect(calls("DELETE", "/payment-history/l2")).toHaveLength(1));
    client.clear();
    clearClients();
    fetchMock.mockClear();

    // The call is new: an older server answers "not found", once, and the page stays as it was.
    serve(money());
    await renderScreen(<StudentScreen />);
    await openPayments();
    await waitFor(() => expect(calls("GET", "/students/s1/payment-history")).toHaveLength(1));
    expect(screen.queryByTestId("legacy-payments")).toBeNull();
    expect(screen.queryByTestId("adjustments")).toBeNull();
    expect(screen.getByTestId("student-payments-total")).toBeOnTheScreen();
  });

  it("narrows the payments to one group, opens a receipt and sends a fiscal receipt again", async () => {
    serve(
      money(
        { "POST /payments/p3/fiscal": {} },
        student({
          groups: [group(), group({ membershipId: "m2", groupId: "g2", groupName: "IELTS 6.5" })],
        }),
      ),
    );
    await renderScreen(<StudentScreen />);
    await openPayments();
    expect(screen.getByTestId("student-payments-total")).toHaveTextContent(/900,000/);
    await fireEvent.press(screen.getByTestId("student-payments-group"));
    await fireEvent.press(await screen.findByTestId("student-payments-group-option-g2"));
    expect(screen.queryByTestId("payment-p1")).toBeNull();
    expect(screen.getByTestId("student-payments-total")).toHaveTextContent(/600,000/);

    await fireEvent.press(screen.getByTestId("payment-receipt-p3"));
    expect(mockOpenOnSite).toHaveBeenCalledWith("/en/payments/p3/receipt");

    expect(screen.getByTestId("payment-fiscal-p3")).toHaveTextContent("Fiscal receipt: Failed");
    await fireEvent.press(screen.getByTestId("payment-fiscal-retry-p3"));
    await waitFor(() => expect(calls("POST", "/payments/p3/fiscal")).toHaveLength(1));
  });
});
