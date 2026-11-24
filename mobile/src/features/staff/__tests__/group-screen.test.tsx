import { fireEvent, screen } from "@testing-library/react-native";

import type { Group, MonthGrid } from "@/api/types";
import { GroupScreen } from "@/features/staff/group-screen";
import { answer, clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: "g1" }),
  useFocusEffect: () => undefined,
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    permissions: mockPermissions,
    branches: [{ id: "b1", name: "Chilonzor" }],
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
let mockWide = false;
jest.mock("@/lib/layout", () => ({
  useLayout: () => ({
    wide: mockWide,
    width: mockWide ? 1180 : 390,
    height: 820,
    columns: mockWide ? 2 : 1,
  }),
}));
jest.mock("@/lib/web", () => ({ openOnSite: jest.fn(async () => undefined) }));

/*
 * A group's page (A-248): on a phone the office meets what the group is, and
 * the way to its students, before the month of lessons; a teacher meets the
 * lessons first. A tablet shows both side by side and is left as it was.
 */

const fetchMock = jest.fn<Promise<Response>, [url: string, init?: RequestInit]>();
const realFetch = globalThis.fetch;

let mockBilling: Group["billingMode"] = "MONTHLY";
const GROUP: Group = {
  id: "g1",
  branchId: "b1",
  branchName: "Chilonzor",
  name: "GE-Morning A1",
  courseId: "c1",
  courseName: "General English",
  courseColor: "#0F766E",
  coursePrice: 450000,
  courseDurationMonths: 6,
  gradingSystemId: null,
  gradingSystemName: "Five points",
  billingMode: "MONTHLY",
  weekdayPattern: "EVEN",
  slots: [2, 4, 6].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "10:30",
    roomId: "r1",
    roomName: "Room 101",
  })),
  teachers: [
    {
      userId: "t1",
      fullName: "Aziz Rahimov",
      role: "MAIN",
      shareType: "PERCENT",
      shareValue: 40,
      since: "2020-01-01",
    },
  ],
  supportTeachers: [],
  startDate: "2020-01-01",
  endDate: "2099-06-01",
  status: "ACTIVE",
  activeStudents: 1,
  lessonsHeld: 5,
};

const MONTH: MonthGrid = {
  month: "2026-11",
  lessons: [
    {
      id: "l1",
      date: "2026-11-03",
      startTime: "09:00",
      endTime: "10:30",
      topic: null,
      courseTopicTitle: null,
      isExtra: false,
      attendance: {},
      grades: {},
      studentNote: null,
    },
  ],
  members: [
    {
      membershipId: "m1",
      studentId: "s1",
      fullName: "Sardor Karimov",
      status: "ACTIVE",
      average: 4,
    },
  ],
};

beforeEach(() => {
  mockWide = false;
  mockBilling = "MONTHLY";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => {
    const path = url.split("?")[0]!;
    if (path.endsWith("/groups/g1")) return answer(200, { ...GROUP, billingMode: mockBilling });
    if (path.endsWith("/groups/g1/lessons")) return answer(200, MONTH);
    if (path.endsWith("/groups/g1/day-off")) return answer(200, []);
    if (path.endsWith("/groups/g1/chat")) return answer(200, { messages: [], unread: 0 });
    if (path.endsWith("/homework/queue")) return answer(200, { items: [] });
    return answer(404, { error: { code: "errors.notFound" } });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

/** Where each named piece stands on the page, top to bottom. */
function order(...ids: string[]): number[] {
  const page = JSON.stringify(screen.toJSON());
  return ids.map((id) => page.indexOf(`"testID":"${id}"`));
}

describe("a group's page on a phone", () => {
  it("shows the office what the group is and its students before the month", async () => {
    mockPermissions = ["groups.view", "groups.update", "students.view"];
    await renderScreen(<GroupScreen />);
    await screen.findByTestId("member-m1");
    const [members, facts, month, list] = order(
      "open-members",
      "group-office",
      "month-name",
      "member-m1",
    );
    expect(members).toBeGreaterThan(-1);
    expect(members).toBeLessThan(facts!);
    expect(facts).toBeLessThan(month!);
    expect(month).toBeLessThan(list!);
  });

  it("shows a teacher the month of lessons first, as before", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    await renderScreen(<GroupScreen />);
    await screen.findByTestId("member-m1");
    expect(screen.queryByTestId("open-members")).toBeNull();
    const [month, facts] = order("month-name", "group-office");
    expect(month).toBeGreaterThan(-1);
    expect(month).toBeLessThan(facts!);
  });
});

describe("a group's page on a tablet", () => {
  it("keeps the students' button beside the list and adds no second way", async () => {
    mockWide = true;
    mockPermissions = ["groups.view", "groups.update", "students.view"];
    await renderScreen(<GroupScreen />);
    await screen.findByTestId("member-m1");
    expect(screen.queryByTestId("open-members")).toBeNull();
    expect(screen.getByTestId("group-members")).toBeOnTheScreen();
  });
});

describe("a group's other pages", () => {
  it("have Discounts for every group, and Packages only where lessons are sold by the package", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    await renderScreen(<GroupScreen />);
    await screen.findByTestId("member-m1");
    await fireEvent.press(screen.getByTestId("pages-more"));
    expect(screen.getByTestId("open-discounts")).toBeTruthy();
    expect(screen.queryByTestId("open-packages")).toBeNull();
  });

  it("have Packages in a group that sells them", async () => {
    mockBilling = "PACKAGES";
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    await renderScreen(<GroupScreen />);
    await screen.findByTestId("member-m1");
    await fireEvent.press(screen.getByTestId("pages-more"));
    expect(screen.getByTestId("open-discounts")).toBeTruthy();
    expect(screen.getByTestId("open-packages")).toBeTruthy();
  });
});
