import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { Staff } from "@/api/office-catalog";
import type { RoleCount, RoleRow } from "@/api/office-staff";
import { nativeRoute } from "@/features/office/site-paths";
import { PERMISSIONS, permissionGroups } from "@/features/settings/permissions";
import { RolesScreen } from "@/features/settings/roles-screen";
import { StaffScreen } from "@/features/settings/staff-screen";
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
const ALL_STAFF_RIGHTS = ["staff.view", "staff.create", "staff.update", "staff.delete"];
let mockPermissions = [...ALL_STAFF_RIGHTS, "settings.roles"];
const mockSaveFile = jest.fn<Promise<string>, [string, string]>(async () => "opened");
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));
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
 * Staff and roles in the app (A-244): the site's Settings → Staff and
 * Settings → Roles. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPermissions = [...ALL_STAFF_RIGHTS, "settings.roles"];
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

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 30, total: items.length });
const disabled = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled === true;
const selected = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.selected === true;

const role = (code: string, name: string, more: Partial<RoleRow> = {}): RoleRow => ({
  id: `r-${code}`,
  code,
  name,
  isSystem: true,
  isActive: true,
  permissions: [],
  userCount: 0,
  ...more,
});
const ROLES: RoleRow[] = [
  role("CEO", "CEO", { permissions: ["*"], userCount: 1 }),
  role("ADMIN", "Admin", { permissions: ["students.view", "students.create"], userCount: 2 }),
  role("CASHIER", "Cashier", { permissions: ["payments.create"] }),
  role("OLD", "Old role", { isSystem: false, isActive: false }),
  role("FRONT_DESK", "Front desk", {
    isSystem: false,
    permissions: ["leads.view"],
    userCount: 1,
  }),
];
const COUNTS: RoleCount[] = [
  { code: "CEO", name: "CEO", count: 1 },
  { code: "ADMIN", name: "Admin", count: 2 },
  { code: "CASHIER", name: "Cashier", count: 0 },
];

const person = (id: string, fullName: string, more: Partial<Staff> = {}): Staff => ({
  id,
  fullName,
  phone: "+998901112233",
  gender: "FEMALE",
  birthDate: null,
  hireDate: "2026-09-01",
  photoUrl: null,
  salaryMethod: "MONTHLY",
  fixedSalary: 4_000_000,
  percentShare: null,
  perLessonFee: null,
  perStudentFee: null,
  isArchived: false,
  createdAt: "2026-09-01T05:00:00.000Z",
  roles: [{ code: "ADMIN", name: "Admin" }],
  branches: [{ id: "b1", name: "Chilonzor" }],
  signInCode: "OFF",
  telegramLinked: false,
  mustChangePassword: false,
  ...more,
});
const MADINA = person("s1", "Madina Karimova", { mustChangePassword: true });
const ME = person("me", "Kamola Yusupova", { roles: [{ code: "CEO", name: "CEO" }] });

async function showStaff(routes: Routes = {}) {
  serve({
    "GET /staff/role-counts": COUNTS,
    "GET /staff": page([ME, MADINA]),
    "GET /roles": ROLES,
    ...routes,
  });
  const client = await renderScreen(<StaffScreen />);
  expect(await screen.findByTestId("staff-s1")).toBeOnTheScreen();
  // The form needs the roles: the header's button wakes when they are there.
  await waitFor(() => expect(disabled("staff-add")).toBe(false));
  return client;
}

describe("staff", () => {
  it("lists everyone with their roles and filters by role, archive and name", async () => {
    await showStaff();
    expect(screen.getByTestId("staff-s1")).toHaveTextContent(/Madina Karimova.*Admin.*Chilonzor/);
    expect(screen.getByTestId("staff-s1")).toHaveTextContent(/Monthly: .*Hired on/);
    expect(screen.getByTestId("staff-temporary-s1")).toHaveTextContent("Temporary password");
    expect(screen.queryByTestId("staff-temporary-me")).toBeNull();
    // The list as it is filtered, as an Excel file (A-256).
    await fireEvent.press(screen.getByTestId("staff-excel"));
    expect(mockSaveFile).toHaveBeenLastCalledWith(
      "/staff/export.xlsx?sort=fullName%3Aasc&locale=en",
      "kampus.xlsx",
    );

    // A chip per role somebody holds, with how many; All is their sum.
    expect(screen.getByTestId("staff-role-all")).toHaveTextContent(/All.*3/);
    expect(screen.getByTestId("staff-role-filter-ADMIN")).toHaveTextContent(/Admin.*2/);
    expect(screen.queryByTestId("staff-role-filter-CASHIER")).toBeNull();
    await fireEvent.press(screen.getByTestId("staff-role-filter-ADMIN"));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url.includes("role=ADMIN"))).toBe(true),
    );
    expect(selected("staff-role-filter-ADMIN")).toBe(true);

    // The archive has its own people and its own counts, and starts from All.
    await fireEvent.press(screen.getByTestId("staff-archived"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url.includes("/staff/role-counts?archived=true")),
      ).toBe(true),
    );
    const archivedList = fetchMock.mock.calls.filter(
      ([url]) => url.includes("/staff?") && url.includes("archived=true"),
    );
    expect(archivedList.length).toBeGreaterThan(0);
    expect(archivedList.every(([url]) => !url.includes("role="))).toBe(true);

    await fireEvent.changeText(screen.getByTestId("staff-search"), "madi");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url.includes("q=madi"))).toBe(true),
    );
  });

  it("adds a person with at least one role, paid by the month unless said otherwise", async () => {
    await showStaff({ "POST /staff": person("s2", "Aziz Aliyev") });
    await fireEvent.press(screen.getByTestId("staff-add"));
    expect(await screen.findByTestId("staff-name")).toHaveProp("value", "");
    expect(screen.getAllByText("New staff member")).toHaveLength(2);
    // A role that is switched off is not offered to a new person.
    expect(screen.getByTestId("staff-role-FRONT_DESK")).toBeOnTheScreen();
    expect(screen.queryByTestId("staff-role-OLD")).toBeNull();
    // No password is typed for anyone here.
    expect(screen.getByTestId("staff-first-sign-in")).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId("staff-name"), "Aziz Aliyev");
    await fireEvent.changeText(screen.getByTestId("staff-phone"), "+998 90 555 66 77");
    await fireEvent.press(screen.getByTestId("staff-save"));
    expect(await screen.findByTestId("staff-roles-problem")).toHaveTextContent(
      "Choose at least one role.",
    );
    expect(calls("POST", "/staff")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("staff-role-CASHIER"));
    await fireEvent.press(screen.getByTestId("staff-role-FRONT_DESK"));
    await fireEvent.changeText(screen.getByTestId("staff-amount"), "3 500 000");
    await fireEvent.press(screen.getByTestId("staff-save"));
    await waitFor(() => expect(calls("POST", "/staff")).toHaveLength(1));
    expect(sentBody(calls("POST", "/staff")[0]![1])).toMatchObject({
      fullName: "Aziz Aliyev",
      phone: "+998905556677",
      branchIds: ["b1"],
      roleCodes: ["CASHIER", "FRONT_DESK"],
      salaryMethod: "MONTHLY",
      fixedSalary: 3_500_000,
      percentShare: null,
    });
    expect(sentBody(calls("POST", "/staff")[0]![1])).not.toHaveProperty("password");
  });

  it("changes someone's roles and archives them after asking", async () => {
    await showStaff({
      "PATCH /staff/s1": MADINA,
      "DELETE /staff/s1": undefined,
    });
    await fireEvent.press(screen.getByTestId("staff-s1"));
    expect(await screen.findByText("Edit staff member")).toBeOnTheScreen();
    expect(selected("staff-role-ADMIN")).toBe(true);
    await fireEvent.press(screen.getByTestId("staff-role-ADMIN"));
    await fireEvent.press(screen.getByTestId("staff-role-CASHIER"));
    await fireEvent.press(screen.getByTestId("staff-save"));
    await waitFor(() => expect(calls("PATCH", "/staff/s1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/staff/s1")[0]![1])).toMatchObject({
      fullName: "Madina Karimova",
      roleCodes: ["CASHIER"],
      fixedSalary: 4_000_000,
    });

    await fireEvent.press(await screen.findByTestId("staff-s1"));
    await fireEvent.press(await screen.findByTestId("staff-archive"));
    expect(await screen.findByText("Archive staff member?")).toBeOnTheScreen();
    expect(calls("DELETE", "/staff/s1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("staff-archive-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/staff/s1")).toHaveLength(1));
  });

  it("lets nobody change their own roles or archive themselves", async () => {
    await showStaff({ "PATCH /staff/me": ME });
    await fireEvent.press(screen.getByTestId("staff-me"));
    expect(await screen.findByTestId("staff-own-roles")).toHaveTextContent(
      "You cannot change your own roles.",
    );
    expect(screen.queryByTestId("staff-role-CEO")).toBeNull();
    expect(screen.queryByTestId("staff-archive")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("staff-name"), "Kamola Yusupova-Karimova");
    await fireEvent.press(screen.getByTestId("staff-save"));
    await waitFor(() => expect(calls("PATCH", "/staff/me")).toHaveLength(1));
    const body = sentBody(calls("PATCH", "/staff/me")[0]![1]);
    expect(body).toMatchObject({ fullName: "Kamola Yusupova-Karimova" });
    expect(body).not.toHaveProperty("roleCodes");
  });

  it("only shows the list to someone who may not change it", async () => {
    mockPermissions = ["staff.view"];
    serve({
      "GET /staff/role-counts": COUNTS,
      "GET /staff": page([MADINA, person("s3", "Old Colleague", { isArchived: true })]),
    });
    await renderScreen(<StaffScreen />);
    expect(await screen.findByTestId("staff-s1")).toBeOnTheScreen();
    expect(screen.queryByTestId("staff-add")).toBeNull();
    // The roles are for the form, which this person never opens.
    expect(calls("GET", "/roles")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("staff-s1"));
    expect(screen.queryByText("Edit staff member")).toBeNull();
  });

  it("opens nothing for a person who is archived", async () => {
    await showStaff({
      "GET /staff": page([MADINA, person("s3", "Old Colleague", { isArchived: true })]),
    });
    await fireEvent.press(screen.getByTestId("staff-s3"));
    expect(screen.queryByText("Edit staff member")).toBeNull();
  });
});

describe("roles", () => {
  async function showRoles(routes: Routes = {}) {
    serve({ "GET /roles": ROLES, ...routes });
    const client = await renderScreen(<RolesScreen />);
    // The page's own words: a press never lands on the header of the loading screen.
    expect(await screen.findByText(/What each role may do/)).toBeOnTheScreen();
    return client;
  }

  it("lists each role with what it holds, and leaves the CEO closed", async () => {
    await showRoles();
    expect(screen.getByTestId("role-CEO")).toHaveTextContent(/CEO.*System.*Everything.*Users: 1/);
    expect(screen.getByTestId("role-ADMIN")).toHaveTextContent(/Admin.*2 permissions.*Users: 2/);
    expect(screen.getByTestId("role-CASHIER")).toHaveTextContent(/1 permission\b/);
    expect(screen.getByTestId("role-OLD")).toHaveTextContent(/Old role.*Inactive/);
    expect(screen.getByTestId("role-FRONT_DESK")).not.toHaveTextContent(/System/);
    await fireEvent.press(screen.getByTestId("role-CEO"));
    expect(screen.queryByTestId("role-name")).toBeNull();
  });

  it("builds a new role from what the person holds themselves", async () => {
    mockPermissions = ["settings.roles", "leads.view", "leads.create", "students.view"];
    await showRoles({ "POST /roles": role("NEW", "Reception", { isSystem: false }) });
    await fireEvent.press(screen.getByTestId("roles-add"));
    await fireEvent.press(await screen.findByTestId("role-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    expect(calls("POST", "/roles")).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("role-name"), " Reception ");
    // The module's own tick takes everything in it that the person may hand out.
    expect(disabled("role-permission-leads.update")).toBe(true);
    expect(disabled("role-all-finance")).toBe(true);
    await fireEvent.press(screen.getByTestId("role-all-leads"));
    await fireEvent.press(screen.getByTestId("role-permission-students.view"));
    // A greyed tick does nothing.
    await fireEvent.press(screen.getByTestId("role-permission-payments.create"));
    await fireEvent.press(screen.getByTestId("role-save"));
    await waitFor(() => expect(calls("POST", "/roles")).toHaveLength(1));
    expect(sentBody(calls("POST", "/roles")[0]![1])).toEqual({
      name: "Reception",
      isActive: true,
      permissions: ["leads.view", "leads.create", "students.view"],
    });
  });

  it("changes a built-in role without offering to delete it", async () => {
    mockPermissions = ["*"];
    await showRoles({ "PATCH /roles/r-ADMIN": ROLES[1] });
    await fireEvent.press(screen.getByTestId("role-ADMIN"));
    expect(await screen.findByTestId("role-system-hint")).toBeOnTheScreen();
    expect(screen.queryByTestId("role-delete")).toBeNull();
    // With everything, every tick is open; the module's tick goes off again as a whole.
    expect(disabled("role-permission-finance.payroll.approve")).toBe(false);
    await fireEvent.press(screen.getByTestId("role-permission-students.create"));
    await fireEvent.press(screen.getByTestId("role-active"));
    await fireEvent.press(screen.getByTestId("role-save"));
    await waitFor(() => expect(calls("PATCH", "/roles/r-ADMIN")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/roles/r-ADMIN")[0]![1])).toEqual({
      name: "Admin",
      isActive: false,
      permissions: ["students.view"],
    });
  });

  it("says why a role somebody holds cannot be deleted, and why one is refused", async () => {
    mockPermissions = ["settings.roles", "leads.view"];
    await showRoles({
      "PATCH /roles/r-FRONT_DESK": answer(403, {
        error: { code: "FORBIDDEN", message: "errors.roleBeyondOwn" },
      }),
      "DELETE /roles/r-FRONT_DESK": answer(409, {
        error: { code: "CONFLICT", message: "errors.inUse" },
      }),
    });
    await fireEvent.press(screen.getByTestId("role-FRONT_DESK"));
    await fireEvent.press(await screen.findByTestId("role-save"));
    expect(await screen.findByTestId("role-problem")).toHaveTextContent(
      "You cannot grant permissions you do not hold yourself.",
    );
    await fireEvent.press(screen.getByTestId("role-delete"));
    expect(await screen.findByText("Delete role?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("role-delete-confirm-confirm"));
    expect(
      await screen.findByText("This record is in use and cannot be deleted."),
    ).toBeOnTheScreen();
  });

  it("groups every permission under its module, each once", () => {
    const groups = permissionGroups();
    expect(groups.flatMap((group) => group.permissions)).toEqual([...PERMISSIONS]);
    expect(groups.map((group) => group.module)).toContain("finance");
    expect(new Set(groups.map((group) => group.module)).size).toBe(groups.length);
  });
});

describe("where Staff and Roles live", () => {
  it("opens both in the app", () => {
    expect(nativeRoute("/settings/staff")).toBe("/staff/settings/staff");
    expect(nativeRoute("/settings/roles")).toBe("/staff/settings/roles");
    expect(nativeRoute("/settings/organizations")).toBeNull();
  });
});
