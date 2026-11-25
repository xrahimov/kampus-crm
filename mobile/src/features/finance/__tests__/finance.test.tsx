import { notifyManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type {
  FinanceCategory,
  FinanceEntry,
  FinanceEntryList,
  FinanceFigures,
  FinanceOptions,
  FinancePlan,
  FinanceTotals,
  PayrollLine,
  PayrollRun,
  PayrollSummary,
} from "@/api/office-finance";
import { EntriesScreen } from "@/features/finance/entries-screen";
import { CategoryEntriesScreen, SectionEntriesScreen } from "@/features/finance/entries-routes";
import { typedAmount } from "@/features/finance/entry-sheet";
import { FinanceScreen } from "@/features/finance/finance-screen";
import { payrollMonth, PayrollScreen } from "@/features/finance/payroll-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { centreToday } from "@/lib/days";

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
  useFocusEffect: () => undefined,
}));
const mockOpenOnSite = jest.fn<Promise<void>, [string]>();
jest.mock("@/lib/web", () => ({ openOnSite: (path: string) => mockOpenOnSite(path) }));
const mockSaveFile = jest.fn<Promise<string>, [string, string]>();
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));
let mockPermissions: string[] = [];
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
let mockActive: { id: string; name: string } | null = null;
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    roles: [{ code: "ADMIN", name: "Admin" }],
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockActive,
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));

/*
 * Finance in the app (A-237): the Finance page with its figures, plan,
 * categories and payroll months; the entries of a kind or a category with
 * the entry sheet; and a month's payroll. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

// An answer is told to the screen in the same breath it arrives in, not a timer later: a
// redraw then never falls between two steps of a test, where React would not expect it.
beforeAll(() => notifyManager.setScheduler((flush) => queueMicrotask(flush)));
afterAll(() => notifyManager.setScheduler((flush) => setTimeout(flush, 0)));

const ALL_RIGHTS = [
  "finance.view",
  "finance.create",
  "finance.update",
  "finance.delete",
  "finance.payroll.approve",
];

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockOpenOnSite.mockReset();
  mockSaveFile.mockReset();
  mockSaveFile.mockResolvedValue("opened");
  mockOpenOnSite.mockResolvedValue();
  mockParams = {};
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockActive = { id: "b1", name: "Chilonzor" };
  mockPermissions = ALL_RIGHTS;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(async () => {
  await settled();
  client = null;
  clearClients();
  globalThis.fetch = realFetch;
});

let client: QueryClient | null = null;
async function show(element: ReactElement): Promise<void> {
  client = await renderScreen(element);
}

/** Lets every answer arrive and be drawn, all of it inside React's `act`. */
async function settled(): Promise<void> {
  const asked = client;
  if (!asked) return;
  await act(async () => {
    for (let turn = 0; turn < 100; turn++) {
      await new Promise((done) => setTimeout(done, 5));
      if (turn > 0 && asked.isFetching() + asked.isMutating() === 0) break;
    }
  });
}

function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}
/** The question part of the last call of that kind. */
function asked(method: string, tail: string): URLSearchParams {
  const last = calls(method, tail).at(-1);
  return new URLSearchParams(last ? (last[0].split("?")[1] ?? "") : "");
}

type Routes = Record<string, unknown | ((url: string) => unknown)>;
/** A route answers with a body, or with a whole answer (a refusal) made by `answer`. */
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

const [YEAR, MONTH] = centreToday().split("-").map(Number) as [number, number];
const THIS_MONTH = `${YEAR}-${String(MONTH).padStart(2, "0")}`;

const FIGURES: FinanceFigures = {
  income: 2850,
  studentIncome: 2500,
  otherIncome: 350,
  expenses: 1320,
  profit: 1530,
  activeBalance: 3965,
  investments: 5000,
  ltv: 625,
  cac: 108,
  marketingEfficiency: 87.5,
  averagePayment: 500,
  paymentCount: 5,
  byMethod: [
    { id: "pm1", name: "Cash", amount: 2000 },
    { id: null, name: null, amount: 500 },
  ],
  yearly: Array.from({ length: 12 }, (_, index) => ({
    month: `${YEAR}-${String(index + 1).padStart(2, "0")}`,
    income: 100 * (index + 1),
    expenses: 50,
  })),
};

const PLAN: FinancePlan = {
  month: THIS_MONTH,
  effective: true,
  plan: 5970,
  achieved: 450,
  expected: 5520,
  achievedPercent: 7.5,
  activeDebt: 1364,
  debtors: 22,
  prepayments: 0,
};

const CATEGORIES: FinanceCategory[] = [
  { id: "c1", kind: "EXPENSE", name: "Rent", total: 800, count: 2 },
  { id: "c2", kind: "INCOME", name: "Books sold", total: 350, count: 1 },
];

const TOTALS: FinanceTotals = {
  byType: {
    EXPENSE: 800,
    INCOME: 350,
    ADVANCE: 100,
    MARKETING: 250,
    BONUS: 50,
    PENALTY: 15,
    INVESTMENT: 5000,
  },
  cashCloses: { count: 3, pending: 1 },
};

const OPTIONS: FinanceOptions = {
  staff: [
    { id: "u2", fullName: "Aziz Rahimov" },
    { id: "u3", fullName: "Sevara Tosheva" },
  ],
  paymentMethods: [
    { id: "pm1", name: "Cash" },
    { id: "pm2", name: "Card" },
  ],
  categories: [
    { id: "c1", kind: "EXPENSE", name: "Rent" },
    { id: "c2", kind: "INCOME", name: "Books sold" },
  ],
  branches: [{ id: "b1", name: "Chilonzor" }],
};

const SUMS = {
  fixed: 1000,
  percent: 200,
  perLesson: 300,
  perStudent: 0,
  bonus: 50,
  penalty: 15,
  penaltyCount: 1,
  advance: 100,
  net: 1435,
};

function summary(change: Partial<PayrollSummary> = {}): PayrollSummary {
  return {
    id: "r1",
    month: "2026-10",
    status: "SAVED",
    computedAt: "2026-11-01T05:00:00.000Z",
    staffCount: 2,
    approvedCount: 1,
    totals: SUMS,
    ...change,
  };
}

function everything(more: Routes = {}): Routes {
  return {
    "GET /finance/overview": FIGURES,
    "GET /finance/plan": PLAN,
    "GET /finance/categories": CATEGORIES,
    "GET /finance/totals": TOTALS,
    "GET /finance/options": OPTIONS,
    "GET /payroll": [summary()],
    ...more,
  };
}

describe("the Finance page", () => {
  it("shows the year's figures, the month's plan, the categories and the payroll months", async () => {
    serve(everything());
    await show(<FinanceScreen />);

    expect(await screen.findByTestId("finance-figure-income")).toHaveTextContent(/Income.*2,?850/);
    expect(screen.getByTestId("finance-figure-profit")).toHaveTextContent(/1,?530/);
    expect(screen.getByTestId("finance-figure-marketingEfficiency")).toHaveTextContent(/87\.5%/);
    // A long name is set smaller, not cut: "Эффективность маркетинга" on a phone (A-271).
    expect(screen.getByTestId("finance-figure-marketingEfficiency-name").props).toMatchObject({
      numberOfLines: 1,
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.8,
    });
    expect(screen.getByTestId("finance-by-method")).toHaveTextContent(/Cash.*2,?000/);
    expect(screen.getByTestId("finance-by-method")).toHaveTextContent(/No method/);
    expect(screen.getByTestId("finance-yearly")).toHaveTextContent(new RegExp(`${YEAR} turnover`));

    // The whole year, of every payment type; the plan is this month's, by effect time.
    const first = asked("GET", "/finance/overview");
    expect(first.get("year")).toBe(String(YEAR));
    expect(first.get("month")).toBeNull();
    expect(first.get("paymentMethodId")).toBeNull();
    const plan = asked("GET", "/finance/plan");
    expect(plan.get("month")).toBe(String(MONTH));
    expect(plan.get("effective")).toBe("1");

    await screen.findByTestId("finance-plan-achieved");
    expect(screen.getByTestId("finance-plan")).toHaveTextContent(/7\.5% done/);
    expect(screen.getByTestId("finance-plan")).toHaveTextContent(/92\.5% left/);
    expect(screen.getByTestId("finance-plan-activeDebt")).toHaveTextContent(/1,?364.*22 debtors/);
    expect(screen.getByTestId("finance-plan-progress").props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 8,
    });

    expect(await screen.findByTestId("finance-category-c1")).toHaveTextContent(/Rent.*800/);
    expect(screen.getByTestId("finance-EXPENSE")).not.toHaveTextContent(/Books sold/);
    expect(screen.getByTestId("finance-INCOME")).toHaveTextContent(/Books sold.*350/);
    await waitFor(() => expect(screen.getByTestId("finance-advance")).toHaveTextContent(/100/));
    expect(screen.getByTestId("finance-marketing")).toHaveTextContent(/250/);
    expect(screen.getByTestId("finance-bonus")).toHaveTextContent(/50/);
    expect(screen.getByTestId("finance-penalty")).toHaveTextContent(/15/);
    expect(screen.getByTestId("finance-cashdesk")).toHaveTextContent(
      "Cash desk3 day closes, 1 awaiting hand-over",
    );

    expect(await screen.findByTestId("payroll-2026-10")).toHaveTextContent(/Oct 2026/);
    expect(screen.getByTestId("payroll-2026-10")).toHaveTextContent(/Saved/);
    expect(screen.getByTestId("payroll-2026-10")).toHaveTextContent(/1,?435/);
    // One branch is chosen at the top of the app.
    expect(screen.queryByTestId("finance-branch")).toBeNull();
  });

  it("asks again for a month, a payment type and the plan by payment day", async () => {
    serve(everything());
    await show(<FinanceScreen />);
    await screen.findByTestId("finance-figure-income");

    await fireEvent.press(screen.getByTestId("finance-month"));
    await fireEvent.press(await screen.findByTestId("finance-month-option-3"));
    await waitFor(() => expect(asked("GET", "/finance/overview").get("month")).toBe("3"));
    await waitFor(() => expect(asked("GET", "/finance/plan").get("month")).toBe("3"));
    await waitFor(() => expect(asked("GET", "/finance/categories").get("month")).toBe("3"));
    await waitFor(() => expect(asked("GET", "/finance/totals").get("month")).toBe("3"));
    expect(screen.getByTestId("finance-plan")).toHaveTextContent(
      new RegExp(`Plan for Mar ${YEAR}`),
    );

    await fireEvent.press(screen.getByTestId("finance-method"));
    await fireEvent.press(await screen.findByTestId("finance-method-option-pm2"));
    await waitFor(() =>
      expect(asked("GET", "/finance/overview").get("paymentMethodId")).toBe("pm2"),
    );

    await fireEvent.press(screen.getByTestId("finance-effective"));
    await waitFor(() => expect(asked("GET", "/finance/plan").get("effective")).toBe("0"));

    await fireEvent.press(screen.getByTestId("finance-year"));
    await fireEvent.press(await screen.findByTestId(`finance-year-option-${YEAR - 1}`));
    await waitFor(() => expect(asked("GET", "/finance/overview").get("year")).toBe(`${YEAR - 1}`));
  });

  it("offers the branch only to someone who sees several and chose none", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    mockActive = null;
    serve(everything());
    await show(<FinanceScreen />);
    await screen.findByTestId("finance-figure-income");
    await fireEvent.press(screen.getByTestId("finance-branch"));
    await fireEvent.press(await screen.findByTestId("finance-branch-option-b2"));
    await waitFor(() => expect(asked("GET", "/finance/overview").get("branchId")).toBe("b2"));
    await waitFor(() => expect(asked("GET", "/finance/plan").get("branchId")).toBe("b2"));
  });

  it("shows its links without sums on a server that does not add them up yet", async () => {
    const routes = everything();
    delete routes["GET /finance/totals"];
    serve(routes);
    await show(<FinanceScreen />);
    await screen.findByTestId("finance-category-c1");
    await settled();
    expect(screen.getByTestId("finance-advance")).toHaveTextContent("Advances");
    expect(screen.getByTestId("finance-bonus")).toHaveTextContent("Bonuses");
    expect(screen.getByTestId("finance-cashdesk")).toHaveTextContent("Cash desk");
    // Asked once: a call the server does not have is not asked for again and again.
    expect(calls("GET", "/finance/totals")).toHaveLength(1);
  });

  it("opens each card's list", async () => {
    serve(everything());
    await show(<FinanceScreen />);
    await screen.findByTestId("finance-category-c1");

    await fireEvent.press(screen.getByTestId("finance-advance"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/finance/[section]",
      params: { section: "advance" },
    });
    await fireEvent.press(screen.getByTestId("finance-penalty"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/finance/[section]",
      params: { section: "penalty" },
    });
    // The active balance is what the investments left.
    await fireEvent.press(screen.getByTestId("finance-figure-activeBalance"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/finance/[section]",
      params: { section: "investment" },
    });
    await fireEvent.press(screen.getByTestId("finance-category-c2"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/finance/costs/[id]",
      params: { id: "c2" },
    });
    await fireEvent.press(screen.getByTestId("finance-cashdesk"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/cashdesk");

    // "Open <month>" is this month while the whole year is shown.
    await fireEvent.press(screen.getByTestId("finance-payroll-open"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/finance/salary/[month]",
      params: { month: THIS_MONTH },
    });
    await fireEvent.press(await screen.findByTestId("payroll-2026-10"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/finance/salary/[month]",
      params: { month: "2026-10" },
    });
  });

  it("adds a category by its name", async () => {
    serve(everything({ "POST /finance/categories": { id: "c3", kind: "EXPENSE", name: "Taxes" } }));
    await show(<FinanceScreen />);
    await screen.findByTestId("finance-category-c1");
    const before = calls("GET", "/finance/categories").length;

    await fireEvent.press(screen.getByTestId("finance-add-EXPENSE"));
    await fireEvent.press(await screen.findByTestId("finance-category-save"));
    expect(await screen.findByText("Required.")).toBeTruthy();
    expect(calls("POST", "/finance/categories")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("finance-category-name"), " Taxes ");
    await fireEvent.press(screen.getByTestId("finance-category-save"));
    await waitFor(() => expect(calls("POST", "/finance/categories")).toHaveLength(1));
    expect(sentBody(calls("POST", "/finance/categories")[0]![1])).toEqual({
      kind: "EXPENSE",
      name: "Taxes",
    });
    await waitFor(() => expect(calls("GET", "/finance/categories").length).toBeGreaterThan(before));
  });

  it("does not offer a new category to someone who may only look", async () => {
    mockPermissions = ["finance.view"];
    serve(everything({ "GET /payroll": [] }));
    await show(<FinanceScreen />);
    await screen.findByTestId("finance-category-c1");
    expect(screen.queryByTestId("finance-add-EXPENSE")).toBeNull();
    expect(screen.queryByTestId("finance-add-INCOME")).toBeNull();
    expect(await screen.findByTestId("finance-payroll-empty")).toBeTruthy();
  });
});

function entry(change: Partial<FinanceEntry> = {}): FinanceEntry {
  return {
    id: "e1",
    type: "BONUS",
    branchId: "b1",
    branchName: "Chilonzor",
    categoryId: null,
    categoryName: null,
    paymentMethodId: "pm1",
    paymentMethodName: "Cash",
    amount: 500,
    date: "2026-11-20",
    comment: "Best results",
    staffId: "u2",
    staffName: "Aziz Rahimov",
    studentId: null,
    studentName: null,
    counterparty: null,
    createdByName: "Dilnoza Karimova",
    createdAt: "2026-11-20T09:00:00.000Z",
    ...change,
  };
}

function entries(items: FinanceEntry[]): FinanceEntryList {
  return { items, total: items.reduce((sum, e) => sum + e.amount, 0) };
}

describe("the entries of a kind", () => {
  it("lists them with the period's sum and narrows by staff and payment type", async () => {
    serve({
      "GET /finance/entries": entries([entry(), entry({ id: "e2", amount: 250, comment: null })]),
      "GET /finance/options": OPTIONS,
    });
    await show(<EntriesScreen type="BONUS" category={null} />);

    const card = await screen.findByTestId("entry-e1");
    expect(screen.getByText("Bonuses")).toBeTruthy();
    expect(screen.getByTestId("entries-total")).toHaveTextContent(/750/);
    expect(card).toHaveTextContent(/Aziz Rahimov/);
    expect(card).toHaveTextContent(/Nov 20, 2026, Cash/);
    expect(card).toHaveTextContent(/Best results/);
    // Who wrote the entry is shown for expenses and income only, as on the site.
    expect(card).not.toHaveTextContent(/Created by/);
    const first = asked("GET", "/finance/entries");
    expect(first.get("type")).toBe("BONUS");
    expect(first.get("year")).toBe(String(YEAR));
    expect(first.get("month")).toBeNull();
    expect(first.get("categoryId")).toBeNull();
    expect(await screen.findByTestId("entries-add")).toHaveTextContent("Give bonus");

    await fireEvent.press(screen.getByTestId("entries-staff"));
    await fireEvent.press(await screen.findByTestId("entries-staff-option-u3"));
    await waitFor(() => expect(asked("GET", "/finance/entries").get("staffId")).toBe("u3"));
    await fireEvent.press(screen.getByTestId("entries-method"));
    await fireEvent.press(await screen.findByTestId("entries-method-option-pm2"));
    await waitFor(() =>
      expect(asked("GET", "/finance/entries").get("paymentMethodId")).toBe("pm2"),
    );
    await fireEvent.press(screen.getByTestId("entries-month"));
    await fireEvent.press(await screen.findByTestId("entries-month-option-11"));
    await waitFor(() => expect(asked("GET", "/finance/entries").get("month")).toBe("11"));
  });

  it("gives a bonus: the staff member and the sum are needed", async () => {
    serve({
      "GET /finance/entries": entries([]),
      "GET /finance/options": OPTIONS,
      "POST /finance/entries": entry(),
    });
    await show(<EntriesScreen type="BONUS" category={null} />);
    expect(await screen.findByText("Nothing found.")).toBeTruthy();
    await fireEvent.press(await screen.findByTestId("entries-add"));

    expect(await screen.findByText("Give a bonus")).toBeTruthy();
    // No category and nobody to choose between: a bonus is a staff member's.
    expect(screen.queryByTestId("entry-category")).toBeNull();
    expect(screen.queryByTestId("entry-party")).toBeNull();
    expect(screen.queryByTestId("entry-counterparty")).toBeNull();
    expect(screen.queryByTestId("entry-branch")).toBeNull();

    await fireEvent.press(screen.getByTestId("entry-save"));
    expect(await screen.findAllByText("Required.")).toHaveLength(2);
    expect(calls("POST", "/finance/entries")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("entry-staff"));
    await fireEvent.press(await screen.findByTestId("entry-staff-option-u2"));
    await fireEvent.changeText(screen.getByTestId("entry-amount"), "abc");
    await fireEvent.press(screen.getByTestId("entry-save"));
    expect(await screen.findByText("Too small.")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("entry-amount"), "500 000");
    await fireEvent.changeText(screen.getByTestId("entry-date"), "20112026");
    await fireEvent.changeText(screen.getByTestId("entry-comment"), " Best results ");
    await fireEvent.press(screen.getByTestId("entry-save"));

    await waitFor(() => expect(calls("POST", "/finance/entries")).toHaveLength(1));
    expect(sentBody(calls("POST", "/finance/entries")[0]![1])).toEqual({
      type: "BONUS",
      branchId: "b1",
      categoryId: null,
      paymentMethodId: "pm1",
      amount: 500000,
      date: "2026-11-20",
      comment: "Best results",
      staffId: "u2",
      studentId: null,
      counterparty: null,
    });
    await waitFor(() => expect(calls("GET", "/finance/entries").length).toBeGreaterThan(1));
  });

  it("writes an expense of a category paid to a student, found by name", async () => {
    serve({
      "GET /finance/entries": entries([]),
      "GET /finance/options": OPTIONS,
      "GET /finance/students": [
        { id: "s1", fullName: "Jasur Aliyev", phone: "+998901234567", branchId: "b1" },
        { id: "s9", fullName: "Jasur Other", phone: null, branchId: "b2" },
      ],
      "POST /finance/entries": entry({ type: "EXPENSE" }),
    });
    await show(<EntriesScreen type="EXPENSE" category={{ id: "c1", name: "Rent" }} />);
    await screen.findByText("Rent");
    await fireEvent.press(await screen.findByTestId("entries-add"));

    expect(await screen.findByText("Add an expense")).toBeTruthy();
    // The page is a category's: no category to pick.
    expect(screen.queryByTestId("entry-category")).toBeNull();
    await fireEvent.press(screen.getByTestId("entry-party-STUDENT"));
    expect(screen.queryByTestId("entry-staff")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("entry-student-search"), "Jas");
    // Only students of the entry's branch are offered.
    await fireEvent.press(await screen.findByTestId("entry-student-s1"));
    expect(screen.queryByTestId("entry-student-s9")).toBeNull();
    expect(screen.getByTestId("entry-student")).toHaveTextContent(/Jasur Aliyev/);

    await fireEvent.press(screen.getByTestId("entry-method"));
    await fireEvent.press(await screen.findByTestId("entry-method-option-none"));
    await fireEvent.changeText(screen.getByTestId("entry-amount"), "1 250 000,50");
    await fireEvent.press(screen.getByTestId("entry-save"));

    await waitFor(() => expect(calls("POST", "/finance/entries")).toHaveLength(1));
    expect(sentBody(calls("POST", "/finance/entries")[0]![1])).toMatchObject({
      type: "EXPENSE",
      categoryId: "c1",
      paymentMethodId: null,
      amount: 1250000.5,
      staffId: null,
      studentId: "s1",
      counterparty: null,
    });
    expect(asked("GET", "/finance/entries").get("categoryId")).toBe("c1");
  });

  it("creates an investment by the investor's name, without a payment type", async () => {
    serve({
      "GET /finance/entries": entries([
        entry({
          id: "i1",
          type: "INVESTMENT",
          staffId: null,
          staffName: null,
          paymentMethodId: null,
          paymentMethodName: null,
          counterparty: "Hakim Erkinov",
          amount: 5000,
        }),
      ]),
      "GET /finance/options": OPTIONS,
      "POST /finance/entries": entry({ type: "INVESTMENT" }),
    });
    await show(<EntriesScreen type="INVESTMENT" category={null} />);
    expect(await screen.findByTestId("entry-i1")).toHaveTextContent(/Hakim Erkinov/);
    expect(screen.queryByTestId("entries-method")).toBeNull();
    expect(screen.queryByTestId("entries-staff")).toBeNull();

    await fireEvent.press(await screen.findByTestId("entries-add"));
    await screen.findByTestId("entry-counterparty");
    expect(screen.queryByTestId("entry-method")).toBeNull();
    expect(screen.queryByTestId("entry-staff")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("entry-amount"), "5000000");
    await fireEvent.press(screen.getByTestId("entry-save"));
    expect(await screen.findByText("Required.")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("entry-counterparty"), "Hakim Erkinov");
    await fireEvent.press(screen.getByTestId("entry-save"));
    await waitFor(() => expect(calls("POST", "/finance/entries")).toHaveLength(1));
    expect(sentBody(calls("POST", "/finance/entries")[0]![1])).toMatchObject({
      type: "INVESTMENT",
      paymentMethodId: null,
      staffId: null,
      counterparty: "Hakim Erkinov",
      amount: 5000000,
    });
  });

  it("changes an entry and deletes one after a question", async () => {
    serve({
      "GET /finance/entries": entries([entry()]),
      "GET /finance/options": OPTIONS,
      "PATCH /finance/entries/e1": entry({ amount: 600 }),
      "DELETE /finance/entries/e1": undefined,
    });
    await show(<EntriesScreen type="BONUS" category={null} />);
    await screen.findByTestId("entries-add");
    await fireEvent.press(await screen.findByTestId("entry-e1"));
    await fireEvent.press(await screen.findByTestId("entry-do-edit"));

    expect(await screen.findByText("Edit entry")).toBeTruthy();
    expect(screen.getByTestId("entry-amount").props.value).toBe("500");
    expect(screen.getByTestId("entry-comment").props.value).toBe("Best results");
    expect(screen.getByTestId("entry-date").props.value).toBe("20.11.2026");
    await fireEvent.changeText(screen.getByTestId("entry-amount"), "600");
    await fireEvent.press(screen.getByTestId("entry-save"));
    await waitFor(() => expect(calls("PATCH", "/finance/entries/e1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/finance/entries/e1")[0]![1])).toMatchObject({
      type: "BONUS",
      staffId: "u2",
      paymentMethodId: "pm1",
      amount: 600,
      date: "2026-11-20",
    });
    await settled();

    await fireEvent.press(screen.getByTestId("entry-e1"));
    await fireEvent.press(await screen.findByTestId("entry-do-delete"));
    expect(await screen.findByText("Delete entry?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("entry-delete-confirm"));
    await waitFor(() => expect(calls("DELETE", "/finance/entries/e1")).toHaveLength(1));
  });

  it("shows the server's refusal in the sheet", async () => {
    serve({
      "GET /finance/entries": entries([]),
      "GET /finance/options": OPTIONS,
      "POST /finance/entries": answer(400, {
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { amount: ["validation.max"] },
        },
      }),
    });
    await show(<EntriesScreen type="MARKETING" category={null} />);
    await fireEvent.press(await screen.findByTestId("entries-add"));
    await fireEvent.changeText(await screen.findByTestId("entry-amount"), "99");
    await fireEvent.press(screen.getByTestId("entry-save"));
    expect(await screen.findByText("Too large.")).toBeTruthy();
    expect(screen.queryByTestId("entry-problem")).toBeNull();
  });

  it("only shows the list to someone who may not change it", async () => {
    mockPermissions = ["finance.view"];
    serve({ "GET /finance/entries": entries([entry()]), "GET /finance/options": OPTIONS });
    await show(<EntriesScreen type="BONUS" category={null} />);
    const card = await screen.findByTestId("entry-e1");
    await settled();
    expect(screen.queryByTestId("entries-add")).toBeNull();
    await fireEvent.press(card);
    expect(screen.queryByTestId("entry-do-edit")).toBeNull();
    expect(screen.queryByTestId("entry-do-delete")).toBeNull();
  });

  it("finds the kind from the address, and a category by its id", async () => {
    serve({
      "GET /finance/entries": entries([]),
      "GET /finance/options": OPTIONS,
      "GET /finance/categories/c2": { id: "c2", kind: "INCOME", name: "Books sold" },
    });
    mockParams = { section: "penalty" };
    await show(<SectionEntriesScreen />);
    expect(await screen.findByText("Fines")).toBeTruthy();
    expect(asked("GET", "/finance/entries").get("type")).toBe("PENALTY");
    await settled();
    clearClients();

    mockParams = { id: "c2" };
    await show(<CategoryEntriesScreen />);
    expect(await screen.findByText("Books sold")).toBeTruthy();
    await waitFor(() => expect(asked("GET", "/finance/entries").get("type")).toBe("INCOME"));
    expect(asked("GET", "/finance/entries").get("categoryId")).toBe("c2");
    expect(await screen.findByTestId("entries-add")).toHaveTextContent("Add new");
  });

  it("says so for an address that names no kind", async () => {
    mockParams = { section: "taxes" };
    serve({});
    await show(<SectionEntriesScreen />);
    expect(await screen.findByText("Not found.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads a typed sum", () => {
    expect(typedAmount("1 500 000")).toBe(1500000);
    expect(typedAmount("1500,5")).toBe(1500.5);
    expect(typedAmount("1500.55")).toBe(1500.55);
    expect(typedAmount("0")).toBeNull();
    expect(typedAmount("")).toBeNull();
    expect(typedAmount("12a")).toBeNull();
    expect(typedAmount("1.2.3")).toBeNull();
  });
});

function line(change: Partial<PayrollLine> = {}): PayrollLine {
  return {
    id: "l1",
    userId: "u2",
    fullName: "Aziz Rahimov",
    roleName: "Teacher",
    ...SUMS,
    details: [
      {
        groupId: "g1",
        groupName: "GE-Morning A1",
        shareType: "PERCENT",
        shareValue: 20,
        coursePrice: 500,
        students: 2,
        lessons: 12,
        amount: 200,
      },
      {
        groupId: "g2",
        groupName: "IELTS 6.5",
        shareType: "PER_LESSON",
        shareValue: 25,
        coursePrice: 800,
        students: 5,
        lessons: 12,
        amount: 300,
      },
    ],
    status: "MODERATION",
    approvedByName: null,
    approvedAt: null,
    ...change,
  };
}

const APPROVED = line({
  id: "l2",
  userId: "u3",
  fullName: "Sevara Tosheva",
  roleName: "Front desk",
  net: -40,
  details: [],
  status: "APPROVED",
  approvedByName: "Hakim Erkinov",
  approvedAt: "2026-11-02T05:00:00.000Z",
});

function run(change: Partial<PayrollRun> = {}): PayrollRun {
  return {
    ...summary({ month: "2026-11", status: "DRAFT" }),
    lines: [line(), APPROVED],
    ...change,
  };
}

describe("a month's payroll", () => {
  beforeEach(() => {
    mockParams = { month: "2026-11" };
  });

  it("shows every salary with what it is made of", async () => {
    serve({ "GET /payroll/2026-11": run() });
    await show(<PayrollScreen />);

    expect(await screen.findByText("Nov 2026 payroll")).toBeTruthy();
    expect(screen.getByTestId("payroll-summary")).toHaveTextContent("2 staff · 1 approved");
    expect(screen.getByTestId("payroll-status")).toHaveTextContent("Draft");
    expect(screen.getByTestId("payroll-total-net")).toHaveTextContent(/1,?435/);
    expect(screen.getByTestId("payroll-totals")).toHaveTextContent(/Fines \(1\)/);

    const first = screen.getByTestId("payroll-line-l1");
    expect(first).toHaveTextContent(/Aziz Rahimov/);
    // A system role is in the reader's language; a centre's own role as it was typed.
    expect(first).toHaveTextContent(/Teacher/);
    expect(screen.getByTestId("payroll-line-l2")).toHaveTextContent(/Front desk/);
    expect(screen.getByTestId("payroll-line-l2-status")).toHaveTextContent(
      "Approved: Hakim Erkinov",
    );
    expect(screen.getByTestId("payroll-line-l2-net")).toHaveTextContent(/-.*40/);
    expect(screen.queryByTestId("payroll-line-l2-approve")).toBeNull();

    expect(screen.queryByTestId("payroll-line-l1-details")).toBeNull();
    await fireEvent.press(screen.getByTestId("payroll-line-l1-toggle"));
    const details = screen.getByTestId("payroll-line-l1-details");
    expect(details).toHaveTextContent(/GE-Morning A1/);
    expect(details).toHaveTextContent(/20% × .*500.* × 2 students/);
    expect(details).toHaveTextContent(/25 × 12 lessons/);
    await fireEvent.press(screen.getByTestId("payroll-line-l2-toggle"));
    expect(screen.getByTestId("payroll-line-l2-details")).toHaveTextContent(
      /No groups this month\./,
    );

    await fireEvent.changeText(screen.getByTestId("payroll-search"), "sev");
    expect(screen.queryByTestId("payroll-line-l1")).toBeNull();
    expect(screen.getByTestId("payroll-line-l2")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("payroll-search"), "zzz");
    expect(screen.getByText("Nothing found.")).toBeTruthy();
  });

  it("approves a line, recalculates, and saves as a draft or for good", async () => {
    let state = run();
    serve({
      "GET /payroll/2026-11": () => state,
      "POST /approve": () => {
        state = run({
          approvedCount: 2,
          lines: [line({ status: "APPROVED", approvedByName: "Dilnoza Karimova" }), APPROVED],
        });
        return state;
      },
      "POST /payroll/2026-11/recalculate": () => state,
      "PUT /payroll/2026-11": () => {
        state = { ...state, status: "SAVED" };
        return state;
      },
    });
    await show(<PayrollScreen />);

    await fireEvent.press(await screen.findByTestId("payroll-line-l1-approve"));
    await waitFor(() => expect(calls("POST", "/payroll/2026-11/lines/l1/approve")).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("payroll-line-l1-status")).toHaveTextContent(
        "Approved: Dilnoza Karimova",
      ),
    );
    expect(screen.getByTestId("payroll-summary")).toHaveTextContent("2 staff · 2 approved");

    await fireEvent.press(screen.getByTestId("payroll-recalculate"));
    expect(await screen.findByTestId("payroll-done")).toHaveTextContent("Recalculated.");
    expect(calls("POST", "/payroll/2026-11/recalculate")).toHaveLength(1);

    await fireEvent.press(screen.getByTestId("payroll-save-draft"));
    await waitFor(() =>
      expect(screen.getByTestId("payroll-done")).toHaveTextContent("Draft saved."),
    );
    expect(sentBody(calls("PUT", "/payroll/2026-11")[0]![1])).toEqual({ status: "DRAFT" });

    await fireEvent.press(screen.getByTestId("payroll-save"));
    await waitFor(() =>
      expect(screen.getByTestId("payroll-done")).toHaveTextContent("Payroll saved."),
    );
    expect(sentBody(calls("PUT", "/payroll/2026-11")[1]![1])).toEqual({ status: "SAVED" });
    await waitFor(() => expect(screen.getByTestId("payroll-status")).toHaveTextContent("Saved"));
  });

  it("shows why a step was refused", async () => {
    serve({
      "GET /payroll/2026-11": run(),
      "POST /payroll/2026-11/recalculate": answer(403, {
        error: { code: "FORBIDDEN", message: "errors.forbidden" },
      }),
    });
    await show(<PayrollScreen />);
    await fireEvent.press(await screen.findByTestId("payroll-recalculate"));
    expect(await screen.findByTestId("payroll-problem")).toBeTruthy();
    expect(screen.queryByTestId("payroll-done")).toBeNull();
  });

  it("only shows the month to someone who may neither change nor approve", async () => {
    mockPermissions = ["finance.view"];
    serve({ "GET /payroll/2026-11": run() });
    await show(<PayrollScreen />);
    expect(await screen.findByTestId("payroll-line-l1-status")).toHaveTextContent("Moderation");
    expect(screen.queryByTestId("payroll-line-l1-approve")).toBeNull();
    expect(screen.queryByTestId("payroll-recalculate")).toBeNull();
    expect(screen.queryByTestId("payroll-save")).toBeNull();
  });

  it("fetches the month as an Excel file", async () => {
    serve({ "GET /payroll/2026-11": run() });
    await show(<PayrollScreen />);
    await fireEvent.press(await screen.findByTestId("payroll-excel"));
    expect(mockSaveFile).toHaveBeenCalledWith(
      "/payroll/2026-11/export.xlsx?locale=en",
      "kampus.xlsx",
    );
  });

  it("reads the month from the app's and the site's address, and refuses anything else", async () => {
    expect(payrollMonth("2026-11")).toBe("2026-11");
    expect(payrollMonth("2026-11-01")).toBe("2026-11");
    expect(payrollMonth("2026-13")).toBeNull();
    expect(payrollMonth("2026-11-15")).toBeNull();
    expect(payrollMonth(undefined)).toBeNull();

    mockParams = { month: "soon" };
    serve({});
    await show(<PayrollScreen />);
    expect(await screen.findByText("Not found.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
