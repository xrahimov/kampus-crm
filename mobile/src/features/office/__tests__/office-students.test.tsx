import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { Payment, PaymentInfo, PaymentOptions, StudentOptions } from "@/api/office-students";
import type { Page, StudentDetail, StudentGroupCard, StudentRow } from "@/api/types";
import { isoToTyped, typedToIso } from "@/components/date-field";
import { typedMoney } from "@/features/office/payment-sheet";
import { filtersFromParams } from "@/features/office/student-filters";
import { StudentScreen } from "@/features/staff/student-screen";
import { StudentsScreen } from "@/features/staff/students-screen";
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
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * Students on the office's side, in the app (A-231): the list's filters, a
 * new student, a payment taken and a student's payments. Each test plays the
 * server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockParams = {};
  mockPermissions = ["students.view", "students.create", "payments.create"];
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
    nextPaymentDate: null,
    monthlyPrice: 400000,
    discount: null,
    instalments: [],
    lessonsLeft: null,
    gradeAverage: null,
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

function page(items: StudentRow[]): Page<StudentRow> {
  return { items, total: items.length, page: 1, pageSize: 30 };
}

const OPTIONS: StudentOptions = {
  schools: [],
  sources: [],
  courses: [{ id: "c1", name: "General English", branchId: "b1" }],
  groups: [
    {
      id: "g1",
      name: "GE-Morning A1",
      branchId: "b1",
      courseId: "c1",
      teacherId: "t1",
      teacherName: "Jasur Aliyev",
      time: "09:00–10:30",
      status: "ACTIVE",
    },
  ],
  teachers: [{ id: "t1", fullName: "Jasur Aliyev" }],
  paymentMethods: [{ id: "pm1", name: "Cash" }],
};

const PAY_OPTIONS: PaymentOptions = {
  methods: [
    { id: "pm1", name: "Cash" },
    { id: "pm2", name: "Card" },
  ],
  printReceiptAfterPayment: false,
  refundsEnabled: true,
};

const INFO: PaymentInfo = {
  membershipId: "m1",
  balance: -400000,
  monthlyPrice: 400000,
  suggestedMonth: "2026-11-01",
  suggestedAmount: 400000,
  nextPaymentDate: null,
  months: ["2026-10-01", "2026-11-01", "2026-12-01"],
  groupName: "GE-Morning A1",
  studentName: "Ali Valiyev",
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
    refunded: 0,
    effectiveMonth: "2026-10-01",
    paidAt: "2026-10-05",
    comment: null,
    receivedByName: "Dilnoza Karimova",
    createdAt: "2026-10-05T09:00:00.000Z",
    ...change,
  };
}

describe("the students list for the office", () => {
  it("narrows the list with the site's filters", async () => {
    serve({ "GET /students": page([student()]), "GET /students/options": OPTIONS });
    await renderScreen(<StudentsScreen />);
    await screen.findByTestId("student-s1");

    await fireEvent.press(screen.getByTestId("students-filters"));
    await fireEvent.press(await screen.findByTestId("filter-payment"));
    await fireEvent.press(await screen.findByTestId("filter-payment-option-DEBTOR"));
    await fireEvent.press(screen.getByTestId("filter-archived"));
    await fireEvent.press(screen.getByTestId("filters-apply"));

    await waitFor(() =>
      expect(
        calls("GET", "/students").some(
          ([url]) => url.includes("paymentStatus=DEBTOR") && url.includes("archived=true"),
        ),
      ).toBe(true),
    );
    expect(screen.getByTestId("students-filters")).toHaveTextContent("Filters: 2");

    await fireEvent.press(screen.getByTestId("students-clear-filters"));
    expect(screen.getByTestId("students-filters")).toHaveTextContent("Filters");
    expect(screen.queryByTestId("students-clear-filters")).toBeNull();
  });

  it("arrives from a figure of the home page with its filter set", async () => {
    mockParams = { groupStatus: "NEW" };
    serve({ "GET /students": page([student()]) });
    await renderScreen(<StudentsScreen />);
    await screen.findByTestId("student-s1");
    expect(calls("GET", "/students")[0]![0]).toContain("groupStatus=NEW");
    expect(screen.getByTestId("students-filters")).toHaveTextContent("Filters: 1");
  });

  it("reads only the filters it knows from an address", () => {
    expect(filtersFromParams({ paymentStatus: "DEBTOR", archived: "true", id: "s1" })).toEqual({
      paymentStatus: "DEBTOR",
      archived: true,
    });
    expect(filtersFromParams({ paymentStatus: "ALL", groupStatus: "nonsense" })).toEqual({});
  });

  it("adds a student with a group and a parent, and opens their page", async () => {
    serve({
      "GET /students": page([]),
      "GET /students/options": OPTIONS,
      "POST /students": student({ id: "s9", fullName: "Sardor Karimov" }),
    });
    await renderScreen(<StudentsScreen />);
    await screen.findByTestId("students-count");
    await fireEvent.press(screen.getByTestId("student-add"));

    // Nothing is sent without a name.
    await fireEvent.press(await screen.findByTestId("student-save"));
    expect(calls("POST", "/students")).toHaveLength(0);
    expect(screen.getByText("Required.")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("student-name"), "Sardor Karimov");
    await fireEvent.changeText(screen.getByTestId("student-phone"), "+998 90 111 22 33");
    await fireEvent.changeText(screen.getByTestId("student-birth"), "05032012");
    await fireEvent.press(screen.getByTestId("student-group"));
    await fireEvent.press(await screen.findByTestId("student-group-option-g1"));
    await fireEvent.changeText(screen.getByTestId("student-joined"), "01.11.2026");
    await fireEvent.changeText(screen.getByTestId("student-parent-phone"), "+998907778899");
    await fireEvent.changeText(screen.getByTestId("student-parent-name"), "Karim aka");
    await fireEvent.press(screen.getByTestId("student-save"));

    await waitFor(() => expect(calls("POST", "/students")).toHaveLength(1));
    expect(sentBody(calls("POST", "/students")[0]![1])).toEqual({
      branchId: "b1",
      fullName: "Sardor Karimov",
      phone: "+998901112233",
      birthDate: "2012-03-05",
      photoUrl: null,
      gender: "MALE",
      note: null,
      membership: { groupId: "g1", joinedAt: "2026-11-01", status: "ACTIVE" },
      parent: { fullName: "Karim aka", phone: "+998907778899" },
    });
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/staff/student/[id]",
        params: { id: "s9" },
      }),
    );
  });

  it("keeps the filters and Add student from people without the office's side", async () => {
    mockPermissions = ["students.view"];
    serve({ "GET /students": page([student()]) });
    await renderScreen(<StudentsScreen />);
    await screen.findByTestId("student-s1");
    expect(screen.queryByTestId("student-add")).toBeNull();
  });
});

describe("a payment taken on the student's page", () => {
  beforeEach(() => {
    mockParams = { id: "s1" };
  });

  it("fills in the suggested sum and records the payment", async () => {
    serve({
      "GET /students/s1": student(),
      "GET /payments/options": PAY_OPTIONS,
      "GET /payment-info": INFO,
      "POST /payments": payment({ id: "p2" }),
    });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-pay"));
    await screen.findByTestId("payment-info");
    expect(screen.getByTestId("payment-balance")).toHaveTextContent(/400,000/);

    // Without a sum and a method nothing is sent.
    await fireEvent.press(screen.getByTestId("payment-save"));
    expect(calls("POST", "/payments")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("payment-fill"));
    expect(screen.getByTestId("payment-amount").props.value).toBe("400 000");
    await fireEvent.press(screen.getByTestId("payment-method"));
    await fireEvent.press(await screen.findByTestId("payment-method-option-pm2"));
    await fireEvent.changeText(screen.getByTestId("payment-date"), "20.11.2026");
    await fireEvent.changeText(screen.getByTestId("payment-comment"), "November");
    await fireEvent.press(screen.getByTestId("payment-save"));

    await waitFor(() => expect(calls("POST", "/payments")).toHaveLength(1));
    expect(sentBody(calls("POST", "/payments")[0]![1])).toEqual({
      membershipId: "m1",
      paymentMethodId: "pm2",
      amount: 400000,
      bonus: 0,
      effectiveMonth: "2026-11-01",
      paidAt: "2026-11-20",
      comment: "November",
    });
  });

  it("says so when the student is in no group", async () => {
    serve({ "GET /students/s1": student({ groups: [] }), "GET /payments/options": PAY_OPTIONS });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-pay"));
    expect(await screen.findByTestId("payment-no-groups")).toBeTruthy();
    expect(screen.queryByTestId("payment-save")).toBeNull();
  });

  it("has no Payment button without the right to take payments, or for an archived student", async () => {
    mockPermissions = ["students.view"];
    serve({ "GET /students/s1": student() });
    await renderScreen(<StudentScreen />);
    await screen.findByTestId("student-person");
    expect(screen.queryByTestId("student-pay")).toBeNull();
  });

  it("lists the student's payments with what was refunded", async () => {
    serve({
      "GET /students/s1": student(),
      "GET /payments": {
        items: [payment(), payment({ id: "p0", amount: 300000, refunded: 100000 })],
        total: 2,
        page: 1,
        pageSize: 50,
      },
    });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-tab-payments"));
    const first = await screen.findByTestId("payment-p1");
    expect(first).toHaveTextContent(/400,000/);
    expect(first).toHaveTextContent(/GE-Morning A1/);
    // The student's payments as an Excel file (A-256), in the site's words.
    expect(screen.getByTestId("student-payments-excel")).toHaveTextContent("Export to Excel");
    await fireEvent.press(screen.getByTestId("student-payments-excel"));
    expect(mockSaveFile).toHaveBeenLastCalledWith(
      "/payments/export.xlsx?studentId=s1&locale=en",
      "kampus.xlsx",
    );
    expect(first).toHaveTextContent(/Cash, Dilnoza Karimova/);
    expect(screen.getByTestId("payment-p0")).toHaveTextContent(/Refunded: .*100,000/);
    expect(screen.getByTestId("student-payments-total")).toHaveTextContent(/600,000/);
    expect(calls("GET", "/payments")[0]![0]).toContain("studentId=s1");
  });
});

describe("the office's actions on a student", () => {
  beforeEach(() => {
    mockParams = { id: "s1" };
    mockPermissions = ["students.view", "students.update", "students.delete"];
  });

  it("changes the name, the phone, the day of birth and the note", async () => {
    serve({
      "GET /students/s1": student({ birthDate: "2012-03-05", note: "Allergy" }),
      "PATCH /students/s1": student({ fullName: "Ali Valiyev Jr" }),
    });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-edit"));
    const name = await screen.findByTestId("student-name");
    expect(name.props.value).toBe("Ali Valiyev");
    expect(screen.getByTestId("student-birth").props.value).toBe("05.03.2012");
    // Groups and parents are not part of an edit.
    expect(screen.queryByTestId("student-group")).toBeNull();
    expect(screen.queryByTestId("student-parent-phone")).toBeNull();

    await fireEvent.changeText(name, "Ali Valiyev Jr");
    await fireEvent.press(screen.getByTestId("student-save"));
    await waitFor(() => expect(calls("PATCH", "/students/s1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/students/s1")[0]![1])).toEqual({
      fullName: "Ali Valiyev Jr",
      phone: "+998901112233",
      birthDate: "2012-03-05",
      photoUrl: null,
      note: "Allergy",
    });
  });

  it("archives only after the question is answered", async () => {
    serve({ "GET /students/s1": student(), "DELETE /students/s1": undefined });
    await renderScreen(<StudentScreen />);
    await fireEvent.press(await screen.findByTestId("student-archive"));
    expect(await screen.findByText(/leaves every group and moves to the archive/)).toBeTruthy();
    expect(calls("DELETE", "/students/s1")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("archive-confirm"));
    await waitFor(() => expect(calls("DELETE", "/students/s1")).toHaveLength(1));
  });

  it("brings an archived student back", async () => {
    serve({
      "GET /students/s1": student({ isArchived: true }),
      "POST /students/s1/restore": student(),
    });
    await renderScreen(<StudentScreen />);
    expect(await screen.findByTestId("student-restore")).toBeTruthy();
    // Someone in the archive is not archived again.
    expect(screen.queryByTestId("student-archive")).toBeNull();
    await fireEvent.press(screen.getByTestId("student-restore"));
    await waitFor(() => expect(calls("POST", "/students/s1/restore")).toHaveLength(1));
  });

  it("shows none of it without the rights", async () => {
    mockPermissions = ["students.view"];
    serve({ "GET /students/s1": student() });
    await renderScreen(<StudentScreen />);
    await screen.findByTestId("student-person");
    expect(screen.queryByTestId("student-edit")).toBeNull();
    expect(screen.queryByTestId("student-archive")).toBeNull();
  });
});

describe("a day typed as day.month.year", () => {
  it("reads real days only", () => {
    expect(typedToIso("23.11.2026")).toBe("2026-11-23");
    expect(typedToIso("5/3/2012")).toBe("2012-03-05");
    expect(typedToIso("31.02.2026")).toBeNull();
    expect(typedToIso("23.11")).toBeNull();
    expect(isoToTyped("2026-11-23")).toBe("23.11.2026");
    expect(isoToTyped(null)).toBe("");
  });

  it("reads a typed sum by its digits", () => {
    expect(typedMoney("1 200 000")).toBe(1200000);
    expect(typedMoney("")).toBe(0);
  });
});
