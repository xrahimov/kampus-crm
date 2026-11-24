import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type {
  CoinReasonRow,
  CoinSettings,
  DayOff,
  ReceiptSettings,
  School,
  SmsCategory,
  SmsTemplateRow,
} from "@/api/office-settings";
import { nativeRoute } from "@/features/office/site-paths";
import { CoinsSettingsScreen, typedCoins } from "@/features/settings/coins-settings-screen";
import { DaysOffScreen } from "@/features/settings/days-off-screen";
import { ReceiptScreen } from "@/features/settings/receipt-screen";
import { SchoolsScreen } from "@/features/settings/schools-screen";
import { SmsTemplatesScreen } from "@/features/settings/sms-templates-screen";
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
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    permissions: ["settings.catalog", "settings.org"],
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockBranches[0],
  }),
  can: () => true,
}));

/*
 * The first of the centre's settings in the app (A-242): days off, schools,
 * SMS templates, the receipt and the coin rules. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
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

const page = <T,>(items: T[], total = items.length, at = 1) => ({
  items,
  page: at,
  pageSize: 50,
  total,
});
const refused = (message: string, status = 409) =>
  answer(status, { error: { code: "CONFLICT", message } });

describe("days off", () => {
  const DAY: DayOff = {
    id: "d1",
    branchId: "b1",
    branchName: "Chilonzor",
    date: "2026-12-31",
    reason: "New Year's Eve",
  };

  it("lists them newest first and asks for the next fifty", async () => {
    serve({
      "GET /days-off": (url: string) =>
        url.includes("page=2")
          ? page([{ ...DAY, id: "d2", date: "2026-09-01", reason: "Independence Day" }], 51, 2)
          : page([DAY], 51),
    });
    await renderScreen(<DaysOffScreen />);
    expect(await screen.findByTestId("day-off-d1")).toHaveTextContent(
      /Dec 31, 2026.*New Year's Eve.*Chilonzor/,
    );
    expect(calls("GET", "/days-off")[0]![0]).toContain("sort=date:desc");
    await fireEvent.press(screen.getByTestId("days-off-more"));
    expect(await screen.findByTestId("day-off-d2")).toHaveTextContent(/Sep 1, 2026/);
    expect(screen.queryByTestId("days-off-more")).toBeNull();
  });

  it("adds one for a branch and tells the families unless that is switched off", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    serve({ "GET /days-off": page([]), "POST /days-off": DAY });
    await renderScreen(<DaysOffScreen />);
    // The page first, so the press lands on the button that stays.
    await screen.findByText("Dates with no lessons at a branch.");
    await fireEvent.press(screen.getByTestId("days-off-add"));
    await fireEvent.press(await screen.findByTestId("day-off-save"));
    expect(await screen.findAllByText("Required.")).toHaveLength(2);
    expect(calls("POST", "/days-off")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("day-off-branch"));
    await fireEvent.press(await screen.findByTestId("day-off-branch-option-b2"));
    await fireEvent.changeText(screen.getByTestId("day-off-date"), "31.12.2026");
    await fireEvent.changeText(screen.getByTestId("day-off-reason"), " New Year's Eve ");
    await fireEvent.press(screen.getByTestId("day-off-notify"));
    await fireEvent.press(screen.getByTestId("day-off-save"));
    await waitFor(() => expect(calls("POST", "/days-off")).toHaveLength(1));
    expect(sentBody(calls("POST", "/days-off")[0]![1])).toEqual({
      branchId: "b2",
      date: "2026-12-31",
      reason: "New Year's Eve",
      notify: false,
    });
  });

  it("changes the date and the reason, never the branch, and deletes after the question", async () => {
    serve({
      "GET /days-off": page([DAY]),
      "PATCH /days-off/d1": DAY,
      "DELETE /days-off/d1": undefined,
    });
    await renderScreen(<DaysOffScreen />);
    await fireEvent.press(await screen.findByTestId("day-off-d1"));
    expect(await screen.findByTestId("day-off-date")).toHaveProp("value", "31.12.2026");
    // The branch and the message to the families belong to a new day off only.
    expect(screen.queryByTestId("day-off-branch")).toBeNull();
    expect(screen.queryByTestId("day-off-notify")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("day-off-date"), "01.01.2027");
    await fireEvent.press(screen.getByTestId("day-off-save"));
    await waitFor(() => expect(calls("PATCH", "/days-off/d1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/days-off/d1")[0]![1])).toEqual({
      date: "2027-01-01",
      reason: "New Year's Eve",
    });

    await fireEvent.press(await screen.findByTestId("day-off-d1"));
    await fireEvent.press(await screen.findByTestId("day-off-delete"));
    expect(await screen.findByText("Dec 31, 2026 will be removed.")).toBeOnTheScreen();
    expect(calls("DELETE", "/days-off/d1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("day-off-delete-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/days-off/d1")).toHaveLength(1));
  });
});

describe("schools", () => {
  const SCHOOL: School = { id: "sc1", name: "School 21", studentsCount: 14 };
  const DUPLICATE = "This value is already in use.";
  const IN_USE = "This record is in use and cannot be deleted.";

  it("lists, adds, renames and says why one cannot be deleted", async () => {
    serve({
      "GET /schools": page([SCHOOL]),
      "POST /schools": SCHOOL,
      "PATCH /schools/sc1": SCHOOL,
      "DELETE /schools/sc1": () => refused("errors.inUse"),
    });
    await renderScreen(<SchoolsScreen />);
    expect(await screen.findByTestId("school-sc1")).toHaveTextContent(/School 21.*Students: 14/);
    expect(calls("GET", "/schools")[0]![0]).toContain("sort=name:asc");

    await fireEvent.press(screen.getByTestId("schools-add"));
    await fireEvent.press(await screen.findByTestId("school-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("school-name"), " Lyceum 2 ");
    await fireEvent.press(screen.getByTestId("school-save"));
    await waitFor(() => expect(calls("POST", "/schools")).toHaveLength(1));
    expect(sentBody(calls("POST", "/schools")[0]![1])).toEqual({ name: "Lyceum 2" });

    await fireEvent.press(await screen.findByTestId("school-sc1"));
    expect(await screen.findByTestId("school-name")).toHaveProp("value", "School 21");
    await fireEvent.changeText(screen.getByTestId("school-name"), "School 22");
    await fireEvent.press(screen.getByTestId("school-save"));
    await waitFor(() => expect(calls("PATCH", "/schools/sc1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/schools/sc1")[0]![1])).toEqual({ name: "School 22" });

    await fireEvent.press(await screen.findByTestId("school-sc1"));
    await fireEvent.press(await screen.findByTestId("school-delete"));
    expect(await screen.findByText("“School 21” will be removed.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("school-delete-confirm-confirm"));
    expect(await screen.findByText(IN_USE)).toBeOnTheScreen();
  });

  it("shows the server's words under the name", async () => {
    serve({
      "GET /schools": page([]),
      "POST /schools": () =>
        answer(400, {
          error: {
            code: "VALIDATION",
            message: "errors.validation",
            fields: { name: ["validation.duplicate"] },
          },
        }),
    });
    await renderScreen(<SchoolsScreen />);
    await screen.findByText("Schools your students attend.");
    await fireEvent.press(screen.getByTestId("schools-add"));
    await fireEvent.changeText(await screen.findByTestId("school-name"), "School 21");
    await fireEvent.press(screen.getByTestId("school-save"));
    await waitFor(() => expect(calls("POST", "/schools")).toHaveLength(1));
    expect(await screen.findByText(DUPLICATE)).toBeOnTheScreen();
    expect(screen.queryByTestId("school-problem")).toBeNull();
  });
});

describe("SMS templates", () => {
  const CATEGORIES: SmsCategory[] = [
    { id: "c1", name: "Debts", templatesCount: 1 },
    { id: "c2", name: "Holidays", templatesCount: 0 },
  ];
  const TEMPLATE: SmsTemplateRow = {
    id: "t1",
    categoryId: "c1",
    categoryName: "Debts",
    text: "Dear {studentName}, please pay {debt}.",
    imported: true,
  };

  it("shows the templates under their categories; only an empty category can be deleted", async () => {
    serve({
      "GET /sms-categories": CATEGORIES,
      "GET /sms-templates": [TEMPLATE],
      "DELETE /sms-categories/c2": undefined,
    });
    await renderScreen(<SmsTemplatesScreen />);
    expect(await screen.findByTestId("sms-category-c1")).toHaveTextContent(/Debts \(1\)/);
    expect(screen.getByTestId("sms-template-t1")).toHaveTextContent(
      "Dear {studentName}, please pay {debt}.imported",
    );
    expect(screen.queryByTestId("sms-category-remove-c1")).toBeNull();
    await fireEvent.press(screen.getByTestId("sms-category-remove-c2"));
    expect(await screen.findByText("Delete category?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("sms-category-delete-confirm"));
    await waitFor(() => expect(calls("DELETE", "/sms-categories/c2")).toHaveLength(1));
  });

  it("creates a category and a template with the words in braces", async () => {
    serve({
      "GET /sms-categories": CATEGORIES,
      "GET /sms-templates": [TEMPLATE],
      "POST /sms-categories": {},
      "POST /sms-templates": {},
    });
    await renderScreen(<SmsTemplatesScreen />);
    await fireEvent.press(await screen.findByTestId("sms-category-add"));
    await fireEvent.changeText(await screen.findByTestId("sms-category-name"), "Exams");
    await fireEvent.press(screen.getByTestId("sms-category-save"));
    await waitFor(() => expect(calls("POST", "/sms-categories")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms-categories")[0]![1])).toEqual({ name: "Exams" });

    await fireEvent.press(screen.getByTestId("sms-template-add"));
    await fireEvent.press(await screen.findByTestId("sms-template-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("sms-template-category"));
    await fireEvent.press(await screen.findByTestId("sms-template-category-option-c2"));
    await fireEvent.changeText(screen.getByTestId("sms-template-text"), "Happy holiday, ");
    await fireEvent.press(screen.getByTestId("sms-variable-studentName"));
    expect(screen.getByTestId("sms-template-text")).toHaveProp(
      "value",
      "Happy holiday, {studentName}",
    );
    expect(screen.getByText("28 characters · 1 SMS")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("sms-template-save"));
    await waitFor(() => expect(calls("POST", "/sms-templates")).toHaveLength(1));
    expect(sentBody(calls("POST", "/sms-templates")[0]![1])).toEqual({
      categoryId: "c2",
      text: "Happy holiday, {studentName}",
    });
  });

  it("changes a template and deletes it after the question", async () => {
    serve({
      "GET /sms-categories": CATEGORIES,
      "GET /sms-templates": [TEMPLATE],
      "PATCH /sms-templates/t1": {},
      "DELETE /sms-templates/t1": undefined,
    });
    await renderScreen(<SmsTemplatesScreen />);
    await fireEvent.press(await screen.findByTestId("sms-template-t1"));
    await fireEvent.changeText(
      await screen.findByTestId("sms-template-text"),
      "Please pay {debt}.",
    );
    await fireEvent.press(screen.getByTestId("sms-template-save"));
    await waitFor(() => expect(calls("PATCH", "/sms-templates/t1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/sms-templates/t1")[0]![1])).toEqual({
      categoryId: "c1",
      text: "Please pay {debt}.",
    });

    await fireEvent.press(await screen.findByTestId("sms-template-t1"));
    await fireEvent.press(await screen.findByTestId("sms-template-delete"));
    expect(await screen.findByText("Delete template?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("sms-template-delete-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/sms-templates/t1")).toHaveLength(1));
  });

  it("copies the provider's templates into the first category and says how many", async () => {
    serve({
      "GET /sms-categories": CATEGORIES,
      "GET /sms-templates": [TEMPLATE],
      "POST /sms-templates/import": { imported: 3, adapter: "eskiz" },
    });
    await renderScreen(<SmsTemplatesScreen />);
    await fireEvent.press(await screen.findByTestId("sms-import"));
    expect(await screen.findByTestId("sms-imported")).toHaveTextContent(
      "Imported 3 templates into “Debts” (eskiz).",
    );
    expect(sentBody(calls("POST", "/sms-templates/import")[0]![1])).toEqual({ categoryId: "c1" });
  });

  it("asks for a category first when there is none", async () => {
    serve({ "GET /sms-categories": [], "GET /sms-templates": [] });
    await renderScreen(<SmsTemplatesScreen />);
    expect(await screen.findByText("No categories yet.")).toBeOnTheScreen();
    expect(screen.getByTestId("sms-template-add").props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId("sms-import"));
    expect(await screen.findByTestId("sms-import-problem")).toHaveTextContent(
      "Create a category first; imported templates go into the first one.",
    );
    expect(calls("POST", "/sms-templates/import")).toHaveLength(0);
  });
});

describe("the receipt", () => {
  const RECEIPT: ReceiptSettings = {
    organizationName: "Kampus Demo",
    logoUrl: null,
    address: "Chilonzor 5",
    phone: null,
    visibleFields: ["header", "address", "student", "amount", "footer", "teacher"],
    logoPosition: "TOP",
    footerText: null,
  };

  it("draws the sample as the choices change and saves them in the receipt's order", async () => {
    serve({ "GET /settings/receipt": RECEIPT, "PUT /settings/receipt": {} });
    await renderScreen(<ReceiptScreen />);
    expect(await screen.findByTestId("receipt-preview")).toHaveTextContent(/Kampus Demo/);
    expect(screen.getByTestId("receipt-preview-address")).toHaveTextContent("Chilonzor 5");
    expect(screen.getByTestId("receipt-preview-teacher")).toBeOnTheScreen();
    expect(screen.queryByTestId("receipt-preview-group")).toBeNull();
    expect(screen.getByTestId("receipt-preview-footer")).toHaveTextContent(
      "Thank you for your payment!",
    );

    await fireEvent.press(screen.getByTestId("receipt-field-teacher"));
    expect(screen.queryByTestId("receipt-preview-teacher")).toBeNull();
    await fireEvent.press(screen.getByTestId("receipt-field-group"));
    expect(screen.getByTestId("receipt-preview-group")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("receipt-address"), "Bunyodkor 12");
    expect(screen.getByTestId("receipt-preview-address")).toHaveTextContent("Bunyodkor 12");
    // The centre's own words at the foot show only with "Footer text" ticked.
    await fireEvent.changeText(screen.getByTestId("receipt-footer"), "See you in class");
    expect(screen.getByTestId("receipt-preview-footer")).toHaveTextContent(
      "Thank you for your payment!",
    );
    await fireEvent.press(screen.getByTestId("receipt-field-footerText"));
    expect(screen.getByTestId("receipt-preview-footer")).toHaveTextContent("See you in class");
    await fireEvent.press(screen.getByTestId("receipt-logo-BOTTOM"));

    await fireEvent.press(screen.getByTestId("receipt-save"));
    await waitFor(() => expect(calls("PUT", "/settings/receipt")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/settings/receipt")[0]![1])).toEqual({
      address: "Bunyodkor 12",
      phone: null,
      visibleFields: ["header", "address", "student", "group", "amount", "footer", "footerText"],
      logoPosition: "BOTTOM",
      footerText: "See you in class",
    });
    expect(await screen.findByTestId("receipt-saved")).toBeOnTheScreen();
    // "Saved." is about what was saved: the next change takes it away.
    await fireEvent.changeText(screen.getByTestId("receipt-phone"), "+998 71 200 00 00");
    expect(screen.queryByTestId("receipt-saved")).toBeNull();
  });

  it("says when the save did not go through", async () => {
    serve({
      "GET /settings/receipt": RECEIPT,
      "PUT /settings/receipt": () => refused("errors.forbidden", 403),
    });
    await renderScreen(<ReceiptScreen />);
    await fireEvent.press(await screen.findByTestId("receipt-save"));
    expect(await screen.findByTestId("receipt-problem")).toHaveTextContent(
      "You do not have permission to do this.",
    );
  });
});

describe("coin settings", () => {
  const SETTINGS: CoinSettings = {
    autoCoins: true,
    rules: [
      { event: "ATTENDANCE", amount: 1, isActive: true },
      { event: "HOMEWORK", amount: 2, isActive: true },
    ],
  };
  const REASON: CoinReasonRow = {
    id: "r1",
    name: "Active in class",
    maxCoins: 10,
    isActive: true,
    usedCount: 4,
  };

  it("saves the switch and every rule, and stops at a wrong number", async () => {
    serve({ "GET /settings/coins": SETTINGS, "GET /coin-reasons": [], "PUT /settings/coins": {} });
    await renderScreen(<CoinsSettingsScreen />);
    expect(await screen.findByTestId("coin-rule-amount-ATTENDANCE")).toHaveProp("value", "1");
    expect(await screen.findByTestId("coin-reasons-empty")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("coin-rule-amount-HOMEWORK"), "0");
    await fireEvent.press(screen.getByTestId("coin-rules-save"));
    expect(await screen.findByText("Too small.")).toBeOnTheScreen();
    expect(calls("PUT", "/settings/coins")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("coin-rule-amount-HOMEWORK"), "5");
    await fireEvent.press(screen.getByTestId("coin-rule-active-ATTENDANCE"));
    await fireEvent.press(screen.getByTestId("coin-auto"));
    await fireEvent.press(screen.getByTestId("coin-rules-save"));
    await waitFor(() => expect(calls("PUT", "/settings/coins")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/settings/coins")[0]![1])).toEqual({
      autoCoins: false,
      rules: [
        { event: "ATTENDANCE", amount: 1, isActive: false },
        { event: "HOMEWORK", amount: 5, isActive: true },
      ],
    });
    expect(await screen.findByTestId("coin-rules-saved")).toBeOnTheScreen();
  });

  it("adds a reason, changes one and says why a used one stays", async () => {
    serve({
      "GET /settings/coins": SETTINGS,
      "GET /coin-reasons": [REASON, { ...REASON, id: "r2", name: "Old reason", isActive: false }],
      "POST /coin-reasons": {},
      "PATCH /coin-reasons/r1": {},
      "DELETE /coin-reasons/r1": () => refused("errors.coinReasonUsed"),
    });
    await renderScreen(<CoinsSettingsScreen />);
    expect(await screen.findByTestId("coin-reason-r1")).toHaveTextContent(
      "Active in classup to 10Active",
    );
    expect(screen.getByTestId("coin-reason-r2")).toHaveTextContent(/Inactive/);
    // Every reason, the switched-off ones too: not the list a teacher picks from.
    expect(calls("GET", "/coin-reasons")[0]![0]).not.toContain("active=1");

    await fireEvent.press(screen.getByTestId("coin-reason-add"));
    expect(await screen.findByTestId("coin-reason-max")).toHaveProp("value", "10");
    await fireEvent.changeText(screen.getByTestId("coin-reason-name"), "Helped a classmate");
    await fireEvent.changeText(screen.getByTestId("coin-reason-max"), "3");
    await fireEvent.press(screen.getByTestId("coin-reason-save"));
    await waitFor(() => expect(calls("POST", "/coin-reasons")).toHaveLength(1));
    expect(sentBody(calls("POST", "/coin-reasons")[0]![1])).toEqual({
      name: "Helped a classmate",
      maxCoins: 3,
      isActive: true,
    });

    await fireEvent.press(await screen.findByTestId("coin-reason-r1"));
    await fireEvent.press(await screen.findByTestId("coin-reason-active"));
    await fireEvent.press(screen.getByTestId("coin-reason-save"));
    await waitFor(() => expect(calls("PATCH", "/coin-reasons/r1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/coin-reasons/r1")[0]![1])).toEqual({
      name: "Active in class",
      maxCoins: 10,
      isActive: false,
    });

    await fireEvent.press(await screen.findByTestId("coin-reason-r1"));
    await fireEvent.press(await screen.findByTestId("coin-reason-delete"));
    await fireEvent.press(await screen.findByTestId("coin-reason-delete-confirm-confirm"));
    expect(
      await screen.findByText("This reason has already been used and cannot be deleted."),
    ).toBeOnTheScreen();
  });

  it("takes whole coins from 1 to 100,000", () => {
    expect(typedCoins(" 25 ")).toBe(25);
    expect(typedCoins("100000")).toBe(100000);
    expect(typedCoins("100001")).toBeNull();
    expect(typedCoins("0")).toBeNull();
    expect(typedCoins("2.5")).toBeNull();
    expect(typedCoins("")).toBeNull();
  });
});

describe("where the site's settings pages live in the app", () => {
  it("opens these five in the app and leaves the rest to the site", () => {
    expect(nativeRoute("/settings/days-off")).toBe("/staff/settings/days-off");
    expect(nativeRoute("/settings/schools")).toBe("/staff/settings/schools");
    expect(nativeRoute("/settings/sms")).toBe("/staff/settings/sms");
    expect(nativeRoute("/settings/receipt")).toBe("/staff/settings/receipt");
    expect(nativeRoute("/settings/coins")).toBe("/staff/settings/coins");
    expect(nativeRoute("/settings/integrations/face-id")).toBeNull();
    expect(nativeRoute("/settings/integrations/amocrm")).toBeNull();
  });
});
