import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type {
  AutoSms,
  BranchRow,
  GradingSystem,
  OrgSettings,
  PaymentMethodRow,
} from "@/api/office-general-settings";
import { nativeRoute } from "@/features/office/site-paths";
import { typedScore } from "@/features/settings/general-lists";
import { typedInRange } from "@/features/settings/general-org";
import { GeneralSettingsScreen } from "@/features/settings/general-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { openOnSite } from "@/lib/web";

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
jest.mock("@/lib/web", () => ({ openOnSite: jest.fn(async () => undefined) }));
let mockPermissions = ["settings.org", "settings.catalog"];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] }, permission: string) => me.permissions.includes(permission),
}));

/*
 * General settings in the app (A-243): the centre's own form, branches,
 * payment methods, grading systems and the automatic SMS. Each test plays the
 * server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPermissions = ["settings.org", "settings.catalog"];
  jest.mocked(openOnSite).mockClear();
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

type Routes = Record<string, unknown | ((url: string, init?: RequestInit) => unknown)>;
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
    const body =
      typeof route === "function"
        ? (route as (url: string, init?: RequestInit) => unknown)(url, init)
        : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

const fieldsRefused = (fields: Record<string, string[]>) =>
  answer(400, { error: { code: "VALIDATION", message: "errors.validation", fields } });
const refused = (message: string) => answer(409, { error: { code: "CONFLICT", message } });

const ORG: OrgSettings = {
  organizationId: "o1",
  logoUrl: null,
  name: "Kingston",
  workStart: "08:00",
  workEnd: "21:00",
  scheduleStepMinutes: 30,
  debtTelegramDays: 3,
  debtSmsDays: null,
  debtTaskDays: 7,
  absenceStreak: 3,
  absenceSilentDays: null,
  referralBonus: 0,
  studentRescheduleHours: 12,
  publicPage: true,
  publicSlug: "kingston",
  publicIntro: null,
  publicPhone: null,
  publicAddress: null,
  publicInstagram: null,
  publicTelegram: null,
  publicFormId: null,
  spreadOverpayment: true,
  adminActionsNeedApproval: false,
  printReceiptAfterPayment: true,
  refundsEnabled: false,
  attendanceComments: true,
  teachersSeeExamSchedule: true,
  attendanceOnlyDuringLesson: false,
  teacherSeesSalary: false,
  payTeacherOnGroupDayOff: false,
  payOnlyAttendedLessons: false,
  teacherCanAddStudents: false,
  teacherCanChangeSchedule: false,
  bookAnySupportTeacher: false,
  groupSupportSessions: false,
  showSetupChecklist: true,
  studentReschedule: false,
};

/** The page's own words, so a press never lands on the header of the loading screen. */
async function showGeneral(routes: Routes) {
  serve({ "GET /settings/org": ORG, "GET /lead-forms": [], ...routes });
  const client = await renderScreen(<GeneralSettingsScreen />);
  expect(await screen.findByTestId("org-form")).toBeOnTheScreen();
  return client;
}
async function openTab(tab: string, card: string) {
  await fireEvent.press(screen.getByTestId(`general-tabs-${tab}`));
  expect(await screen.findByTestId(card)).toBeOnTheScreen();
}
const disabled = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled === true;

describe("the centre's own settings", () => {
  it("wakes Save only once something differs, and sends the whole form", async () => {
    await showGeneral({
      "PUT /settings/org": (_url: string, init?: RequestInit) => ({
        ...ORG,
        ...(sentBody(init) as object),
      }),
    });
    expect(screen.getByTestId("org-name").props.value).toBe("Kingston");
    expect(disabled("org-save")).toBe(true);

    // An empty "SMS after" is the step switched off; a number switches it on.
    expect(screen.getByTestId("org-debtSmsDays").props.value).toBe("");
    await fireEvent.changeText(screen.getByTestId("org-debtSmsDays"), "5");
    await fireEvent.changeText(screen.getByTestId("org-debtTaskDays"), "");
    await fireEvent.press(screen.getByTestId("org-step-15"));
    await fireEvent.press(screen.getByTestId("org-switch-refundsEnabled"));
    await fireEvent.changeText(screen.getByTestId("org-name"), "  Kingston LC ");
    expect(disabled("org-save")).toBe(false);

    await fireEvent.press(screen.getByTestId("org-save"));
    await waitFor(() => expect(calls("PUT", "/settings/org")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/settings/org")[0]![1])).toEqual({
      ...Object.fromEntries(
        Object.entries(ORG).filter(([key]) => key !== "organizationId" && key !== "logoUrl"),
      ),
      name: "Kingston LC",
      scheduleStepMinutes: 15,
      debtSmsDays: 5,
      debtTaskDays: null,
      refundsEnabled: true,
    });
    expect(await screen.findByTestId("org-saved")).toHaveTextContent("Saved.");
    // The server's spelling is in the form, and there is nothing left to save.
    expect(screen.getByTestId("org-name").props.value).toBe("Kingston LC");
    expect(disabled("org-save")).toBe(true);

    // Put back by hand, the form is what the server has again.
    await fireEvent.changeText(screen.getByTestId("org-name"), "Kingston");
    expect(disabled("org-save")).toBe(false);
    await fireEvent.changeText(screen.getByTestId("org-name"), "Kingston LC");
    expect(disabled("org-save")).toBe(true);
  });

  it("marks what is wrong before anything is sent", async () => {
    await showGeneral({});
    await fireEvent.changeText(screen.getByTestId("org-name"), " ");
    await fireEvent.changeText(screen.getByTestId("org-workEnd"), "07:00");
    await fireEvent.changeText(screen.getByTestId("org-absenceStreak"), "0");
    await fireEvent.changeText(screen.getByTestId("org-studentRescheduleHours"), "");
    await fireEvent.changeText(screen.getByTestId("org-referralBonus"), "1.5");
    await fireEvent.changeText(screen.getByTestId("org-publicSlug"), "Kingston LC");
    await fireEvent.press(screen.getByTestId("org-save"));

    expect(await screen.findByTestId("org-check")).toBeOnTheScreen();
    expect(screen.getByText("Closing time must be after opening time.")).toBeOnTheScreen();
    expect(screen.getByText("Too small.")).toBeOnTheScreen();
    expect(screen.getByText("Enter a whole number.")).toBeOnTheScreen();
    expect(screen.getByText("Use Latin letters, digits and dashes.")).toBeOnTheScreen();
    expect(screen.getAllByText("Required.")).toHaveLength(2);
    expect(calls("PUT", "/settings/org")).toHaveLength(0);
  });

  it("shows what the server refuses under its field", async () => {
    await showGeneral({
      "PUT /settings/org": fieldsRefused({ publicSlug: ["validation.duplicate"] }),
    });
    await fireEvent.changeText(screen.getByTestId("org-publicSlug"), "kampus");
    await fireEvent.press(screen.getByTestId("org-save"));
    expect(await screen.findByText("This value is already in use.")).toBeOnTheScreen();
    expect(screen.queryByTestId("org-problem")).toBeNull();
    expect(screen.queryByTestId("org-saved")).toBeNull();
  });

  it("opens the public page that is live, and offers the sign-up forms it may read", async () => {
    await showGeneral({
      "GET /lead-forms": [{ id: "f1", name: "Instagram" }],
    });
    await fireEvent.press(screen.getByTestId("org-public-open"));
    await waitFor(() => expect(openOnSite).toHaveBeenCalledWith("/en/c/kingston"));
    // A new address is not live until it is saved: the button keeps the old one.
    await fireEvent.changeText(screen.getByTestId("org-publicSlug"), "other");
    await fireEvent.press(screen.getByTestId("org-public-open"));
    expect(openOnSite).toHaveBeenLastCalledWith("/en/c/kingston");

    await fireEvent.press(await screen.findByTestId("org-publicFormId"));
    await fireEvent.press(await screen.findByTestId("org-publicFormId-option-f1"));
    expect(disabled("org-save")).toBe(false);
  });

  it("leaves the sign-up form out for someone who may not read the forms", async () => {
    mockPermissions = ["settings.org"];
    await showGeneral({});
    expect(screen.queryByTestId("org-publicFormId")).toBeNull();
    expect(calls("GET", "/lead-forms")).toHaveLength(0);
  });

  it("reads typed numbers in their range", () => {
    expect(typedInRange("", { min: 1, max: 365, empty: null })).toBeNull();
    expect(typedInRange("", { min: 0, max: 100, empty: 0 })).toBe(0);
    expect(typedInRange("", { min: 1, max: 168, empty: "no" })).toBeUndefined();
    expect(typedInRange(" 12 ", { min: 1, max: 168, empty: "no" })).toBe(12);
    expect(typedInRange("169", { min: 1, max: 168, empty: "no" })).toBeUndefined();
    expect(typedInRange("1,5", { min: 1, max: 168, empty: "no" })).toBeUndefined();
  });
});

describe("branches", () => {
  const BRANCHES: BranchRow[] = [
    { id: "b1", name: "Chilonzor", isActive: true },
    { id: "b2", name: "Yunusobod", isActive: false },
  ];

  it("adds one and shows a name that is taken under the field", async () => {
    let taken = true;
    await showGeneral({
      "GET /branches": { items: BRANCHES },
      "POST /branches": () => {
        if (!taken) return { id: "b3", name: "Sergeli", isActive: true };
        taken = false;
        return fieldsRefused({ name: ["validation.duplicate"] });
      },
    });
    await openTab("branches", "branches");
    expect(await screen.findByTestId("branch-b2")).toHaveTextContent(/Yunusobod.*Inactive/);

    await fireEvent.press(screen.getByTestId("branches-add"));
    await fireEvent.press(await screen.findByTestId("branch-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    expect(calls("POST", "/branches")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("branch-name"), " Chilonzor ");
    await fireEvent.press(screen.getByTestId("branch-save"));
    expect(await screen.findByText("This value is already in use.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("branch-name"), "Sergeli");
    await fireEvent.press(screen.getByTestId("branch-save"));
    await waitFor(() => expect(calls("POST", "/branches")).toHaveLength(2));
    expect(sentBody(calls("POST", "/branches")[1]![1])).toEqual({
      name: "Sergeli",
      isActive: true,
    });
  });

  it("switches one off only after asking, and one that is off back on from its form", async () => {
    await showGeneral({
      "GET /branches": { items: BRANCHES },
      "DELETE /branches/b1": undefined,
      "PATCH /branches/b2": { ...BRANCHES[1], isActive: true },
    });
    await openTab("branches", "branches");
    await fireEvent.press(await screen.findByTestId("branch-b1"));
    await fireEvent.press(await screen.findByTestId("branch-delete"));
    expect(await screen.findByText("Deactivate branch?")).toBeOnTheScreen();
    expect(calls("DELETE", "/branches/b1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("branch-deactivate-confirm"));
    await waitFor(() => expect(calls("DELETE", "/branches/b1")).toHaveLength(1));

    // A branch that is off has nothing to deactivate; the tick brings it back.
    await fireEvent.press(screen.getByTestId("branch-b2"));
    expect(await screen.findByTestId("branch-name")).toHaveProp("value", "Yunusobod");
    expect(screen.queryByTestId("branch-delete")).toBeNull();
    await fireEvent.press(screen.getByTestId("branch-active"));
    await fireEvent.press(screen.getByTestId("branch-save"));
    await waitFor(() => expect(calls("PATCH", "/branches/b2")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/branches/b2")[0]![1])).toEqual({
      name: "Yunusobod",
      isActive: true,
    });
  });
});

describe("payment methods", () => {
  const METHODS: PaymentMethodRow[] = [
    { id: "m1", name: "Cash", isActive: true, isCash: true, sortOrder: 0 },
    { id: "m2", name: "Payme", isActive: false, isCash: false, sortOrder: 2 },
  ];

  it("marks the cash ones and saves a change with its place in the list", async () => {
    await showGeneral({
      "GET /payment-methods": { items: METHODS },
      "PATCH /payment-methods/m2": METHODS[1],
    });
    await openTab("methods", "methods");
    expect(await screen.findByTestId("method-cash-m1")).toBeOnTheScreen();
    expect(screen.queryByTestId("method-cash-m2")).toBeNull();

    await fireEvent.press(screen.getByTestId("method-m2"));
    expect(await screen.findByTestId("method-order")).toHaveProp("value", "2");
    await fireEvent.changeText(screen.getByTestId("method-order"), "1001");
    await fireEvent.press(screen.getByTestId("method-save"));
    expect(await screen.findByText("Too large.")).toBeOnTheScreen();
    expect(calls("PATCH", "/payment-methods/m2")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("method-order"), "");
    await fireEvent.press(screen.getByTestId("method-active"));
    await fireEvent.press(screen.getByTestId("method-save"));
    await waitFor(() => expect(calls("PATCH", "/payment-methods/m2")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/payment-methods/m2")[0]![1])).toEqual({
      name: "Payme",
      isActive: true,
      isCash: false,
      sortOrder: 0,
    });
  });

  it("says why one that payments use cannot be deleted", async () => {
    await showGeneral({
      "GET /payment-methods": { items: METHODS },
      "DELETE /payment-methods/m1": refused("errors.inUse"),
    });
    await openTab("methods", "methods");
    await fireEvent.press(await screen.findByTestId("method-m1"));
    await fireEvent.press(await screen.findByTestId("method-delete"));
    expect(await screen.findByText("Delete payment method?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("method-delete-confirm-confirm"));
    expect(
      await screen.findByText("This record is in use and cannot be deleted."),
    ).toBeOnTheScreen();
  });
});

describe("grading systems", () => {
  const SYSTEM: GradingSystem = {
    id: "g1",
    name: "CEFR",
    rounding: "STANDARD",
    coursesCount: 2,
    levels: [
      { id: "l1", name: "A1", minScore: 0, maxScore: 49 },
      { id: "l2", name: "A2", minScore: 50, maxScore: 100 },
    ],
  };

  it("builds a new one level by level, the next starting above the last", async () => {
    await showGeneral({
      "GET /grading-systems": { items: [SYSTEM] },
      "POST /grading-systems": { ...SYSTEM, id: "g2" },
    });
    await openTab("grading", "grading");
    expect(await screen.findByTestId("grading-g1")).toHaveTextContent(
      /CEFR.*Levels: 2.*Courses: 2/,
    );

    await fireEvent.press(screen.getByTestId("grading-add"));
    // One level to start with, and it cannot be removed.
    expect(await screen.findByTestId("grading-level-0")).toBeOnTheScreen();
    expect(screen.queryByTestId("grading-level-remove-0")).toBeNull();
    await fireEvent.press(screen.getByTestId("grading-save"));
    expect((await screen.findAllByText("Required.")).length).toBeGreaterThan(0);
    expect(calls("POST", "/grading-systems")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("grading-name"), "IELTS bands");
    await fireEvent.press(screen.getByTestId("grading-rounding-IELTS"));
    await fireEvent.changeText(screen.getByTestId("grading-level-name-0"), "Low");
    await fireEvent.changeText(screen.getByTestId("grading-level-max-0"), "4,5");
    await fireEvent.press(screen.getByTestId("grading-level-add"));
    expect(screen.getByTestId("grading-level-min-1").props.value).toBe("5.5");
    await fireEvent.changeText(screen.getByTestId("grading-level-name-1"), "High");
    await fireEvent.changeText(screen.getByTestId("grading-level-min-1"), "5");
    await fireEvent.changeText(screen.getByTestId("grading-level-max-1"), "4");
    await fireEvent.press(screen.getByTestId("grading-save"));
    expect(await screen.findByTestId("grading-level-problem-1")).toHaveTextContent(
      "Maximum must be at least the minimum.",
    );
    await fireEvent.changeText(screen.getByTestId("grading-level-max-1"), "9");
    await fireEvent.press(screen.getByTestId("grading-save"));
    await waitFor(() => expect(calls("POST", "/grading-systems")).toHaveLength(1));
    expect(sentBody(calls("POST", "/grading-systems")[0]![1])).toEqual({
      name: "IELTS bands",
      rounding: "IELTS",
      levels: [
        { name: "Low", minScore: 0, maxScore: 4.5 },
        { name: "High", minScore: 5, maxScore: 9 },
      ],
    });
  });

  it("changes one whole, shows a refused level, and says how many courses lose it", async () => {
    let first = true;
    await showGeneral({
      "GET /grading-systems": { items: [SYSTEM] },
      "PUT /grading-systems/g1": () => {
        if (!first) return SYSTEM;
        first = false;
        return fieldsRefused({ "levels.0.maxScore": ["validation.levelRange"] });
      },
      "DELETE /grading-systems/g1": undefined,
    });
    await openTab("grading", "grading");
    await fireEvent.press(await screen.findByTestId("grading-g1"));
    expect(await screen.findByTestId("grading-level-name-1")).toHaveProp("value", "A2");
    await fireEvent.press(screen.getByTestId("grading-level-remove-1"));
    expect(screen.queryByTestId("grading-level-1")).toBeNull();
    await fireEvent.press(screen.getByTestId("grading-save"));
    expect(await screen.findByTestId("grading-level-problem-0")).toHaveTextContent(
      "Maximum must be at least the minimum.",
    );
    expect(screen.queryByTestId("grading-problem")).toBeNull();
    await fireEvent.press(screen.getByTestId("grading-save"));
    await waitFor(() => expect(calls("PUT", "/grading-systems/g1")).toHaveLength(2));
    expect(sentBody(calls("PUT", "/grading-systems/g1")[1]![1])).toEqual({
      name: "CEFR",
      rounding: "STANDARD",
      levels: [{ name: "A1", minScore: 0, maxScore: 49 }],
    });

    await fireEvent.press(await screen.findByTestId("grading-g1"));
    await fireEvent.press(await screen.findByTestId("grading-delete"));
    expect(
      await screen.findByText(/2 courses use it and will keep working without a scale/),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("grading-delete-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/grading-systems/g1")).toHaveLength(1));
  });

  it("reads a typed score with a comma or a point", () => {
    expect(typedScore("4,5")).toBe(4.5);
    expect(typedScore("1000")).toBe(1000);
    expect(typedScore("1000.5")).toBeNull();
    expect(typedScore("-1")).toBeNull();
    expect(typedScore("")).toBeNull();
    expect(typedScore("1.234")).toBeNull();
  });
});

describe("automatic SMS", () => {
  const ROWS: AutoSms[] = [
    {
      event: "BIRTHDAY",
      isActive: false,
      template: "Happy birthday, {studentName}!",
      variables: ["studentName", "centerName"],
    },
    {
      event: "ABSENT",
      isActive: true,
      template: "{studentName} missed the lesson on {date}.",
      variables: ["studentName", "groupName", "date"],
    },
  ];

  it("lists every event with whether it sends, and saves one with the rest as they are", async () => {
    await showGeneral({
      "GET /settings/auto-sms": ROWS,
      "PUT /settings/auto-sms": undefined,
    });
    await openTab("sms", "auto-sms");
    expect(await screen.findByTestId("auto-sms-BIRTHDAY")).toHaveTextContent(
      /Birthday greeting.*Happy birthday/,
    );
    expect(screen.getByTestId("auto-sms-state-BIRTHDAY")).toHaveTextContent("Inactive");
    expect(screen.getByTestId("auto-sms-state-ABSENT")).toHaveTextContent("Active");

    await fireEvent.press(screen.getByTestId("auto-sms-BIRTHDAY"));
    expect(await screen.findByTestId("auto-sms-text")).toHaveProp(
      "value",
      "Happy birthday, {studentName}!",
    );
    // Only this event's own words are offered.
    expect(screen.getByTestId("auto-sms-variable-centerName")).toBeOnTheScreen();
    expect(screen.queryByTestId("auto-sms-variable-date")).toBeNull();
    await fireEvent.press(screen.getByTestId("auto-sms-active"));
    await fireEvent.changeText(screen.getByTestId("auto-sms-text"), "Happy birthday from ");
    await fireEvent.press(screen.getByTestId("auto-sms-variable-centerName"));
    expect(screen.getByTestId("auto-sms-text").props.value).toBe(
      "Happy birthday from {centerName}",
    );
    await fireEvent.press(screen.getByTestId("auto-sms-save"));
    await waitFor(() => expect(calls("PUT", "/settings/auto-sms")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/settings/auto-sms")[0]![1])).toEqual({
      settings: [
        { event: "BIRTHDAY", isActive: true, template: "Happy birthday from {centerName}" },
        {
          event: "ABSENT",
          isActive: true,
          template: "{studentName} missed the lesson on {date}.",
        },
      ],
    });
  });

  it("does not send an empty text, and shows a refusal of this event under its text", async () => {
    await showGeneral({
      "GET /settings/auto-sms": ROWS,
      "PUT /settings/auto-sms": fieldsRefused({ "settings.1.template": ["validation.tooLong"] }),
    });
    await openTab("sms", "auto-sms");
    await fireEvent.press(await screen.findByTestId("auto-sms-ABSENT"));
    await fireEvent.changeText(await screen.findByTestId("auto-sms-text"), "  ");
    await fireEvent.press(screen.getByTestId("auto-sms-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    expect(calls("PUT", "/settings/auto-sms")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("auto-sms-text"), "Missed.");
    await fireEvent.press(screen.getByTestId("auto-sms-save"));
    expect(await screen.findByText("Too long.")).toBeOnTheScreen();
    expect(screen.queryByTestId("auto-sms-problem")).toBeNull();
  });
});

describe("where General settings lives", () => {
  it("opens in the app", () => {
    expect(nativeRoute("/settings/general")).toBe("/staff/settings/general");
    expect(nativeRoute("/settings/staff")).toBeNull();
  });
});
