import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { GroupDayOff, GroupOptions, Member, Timetable } from "@/api/office-groups";
import type { Group, Page } from "@/api/types";
import { typedToTime } from "@/components/time-field";
import { GroupFormSheet } from "@/features/groups/group-form";
import { GroupOffice } from "@/features/groups/group-office";
import { GroupsTab } from "@/features/groups/groups-tab";
import { MembersScreen } from "@/features/groups/members-screen";
import { StudentToGroupSheet } from "@/features/groups/student-to-group";
import { TimetableScreen } from "@/features/groups/timetable-screen";
import { nativeRoute } from "@/features/office/site-paths";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "g1" }),
  useFocusEffect: () => undefined,
}));
let mockPermissions: string[] = [];
let mockView: "FULL" | "TEACHING" = "FULL";
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    permissions: mockPermissions,
    view: { current: mockView, canSwitch: false },
    branches: mockBranches,
    activeBranch: mockBranches[0],
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
jest.mock("@/lib/web", () => ({ openOnSite: jest.fn(async () => undefined) }));

/*
 * Groups for the office in the app (A-233): the list, the group form with its
 * rules, what is done with a group, its students, and the timetable. Each
 * test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  mockView = "FULL";
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockPermissions = [
    "groups.view",
    "groups.create",
    "groups.update",
    "groups.delete",
    "students.view",
    "students.create",
    "payments.create",
  ];
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
/** A route answers with a body, or with a whole answer (a refusal) made by `answer`. */
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
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

function group(change: Partial<Group> = {}): Group {
  return {
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
    activeStudents: 2,
    lessonsHeld: 5,
    ...change,
  };
}

function page(items: Group[]): Page<Group> {
  return { items, page: 1, pageSize: 30, total: items.length };
}

const OPTIONS: GroupOptions = {
  courses: [
    { id: "c1", branchId: "b1", name: "General English", color: "#0F766E" },
    { id: "c9", branchId: "b9", name: "Other branch course", color: null },
  ],
  rooms: [
    { id: "r1", branchId: "b1", name: "Room 101" },
    { id: "r2", branchId: "b1", name: "Lab" },
  ],
  gradingSystems: [{ id: "gs1", name: "Five points" }],
  teachers: [
    { id: "t1", fullName: "Aziz Rahimov", branchIds: ["b1"] },
    { id: "t2", fullName: "Malika Yusupova", branchIds: ["b1"] },
    { id: "t9", fullName: "Elsewhere Teacher", branchIds: ["b9"] },
  ],
  teachersChangeTimes: false,
};

function member(change: Partial<Member> = {}): Member {
  return {
    id: "m1",
    groupId: "g1",
    studentId: "s1",
    fullName: "Sardor Karimov",
    phone: "+998901112233",
    status: "ACTIVE",
    joinedAt: "2026-09-01",
    leftAt: null,
    customPrice: null,
    note: null,
    billingFrom: null,
    leaveReason: null,
    balance: -400000,
    lessonsLeft: null,
    ...change,
  };
}

const STUDENT_OPTIONS = {
  schools: [],
  sources: [],
  courses: [],
  groups: [
    {
      id: "g1",
      name: "GE-Morning A1",
      branchId: "b1",
      courseId: "c1",
      teacherId: "t1",
      teacherName: "Aziz Rahimov",
      time: "09:00–10:30",
      status: "ACTIVE",
    },
    {
      id: "g2",
      name: "IELTS Evening",
      branchId: "b1",
      courseId: "c2",
      teacherId: "t2",
      teacherName: "Malika Yusupova",
      time: "18:00–19:30",
      status: "ACTIVE",
    },
    {
      id: "g3",
      name: "Old group",
      branchId: "b1",
      courseId: "c1",
      teacherId: null,
      teacherName: null,
      time: null,
      status: "ARCHIVED",
    },
  ],
  teachers: [],
  paymentMethods: [],
};

describe("the Groups tab", () => {
  it("gives the office every group with the site's filters and a search", async () => {
    serve({
      "GET /groups": page([group(), group({ id: "g2", name: "IELTS Evening", status: "FROZEN" })]),
      "GET /groups/options": OPTIONS,
    });
    await renderScreen(<GroupsTab />);
    expect(await screen.findByTestId("group-g1")).toBeOnTheScreen();
    expect(screen.getByTestId("groups-count")).toHaveTextContent("2 groups");
    expect(screen.getByText("Frozen")).toBeOnTheScreen();
    expect(calls("GET", "/groups")[0]![0]).toContain("status=ACTIVE");

    await fireEvent.press(screen.getByTestId("groups-teacher"));
    await fireEvent.press(await screen.findByTestId("groups-teacher-option-t2"));
    await waitFor(() => expect(calls("GET", "/groups").at(-1)![0]).toContain("teacherId=t2"));
    await fireEvent.changeText(screen.getByTestId("groups-search"), "IELTS");
    await waitFor(() => expect(calls("GET", "/groups").at(-1)![0]).toContain("q=IELTS"));
    await fireEvent.press(screen.getByTestId("groups-status"));
    await fireEvent.press(await screen.findByTestId("groups-status-option-ALL"));
    await waitFor(() => expect(calls("GET", "/groups").at(-1)![0]).toContain("status=ALL"));

    await fireEvent.press(screen.getByTestId("group-g1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/group/[id]", params: { id: "g1" } });
  });

  it("keeps a teacher's own short list, with no filters and no New group", async () => {
    mockView = "TEACHING";
    mockPermissions = ["groups.view"];
    serve({ "GET /groups": page([group()]) });
    await renderScreen(<GroupsTab />);
    expect(await screen.findByTestId("group-g1")).toBeOnTheScreen();
    expect(screen.queryByTestId("groups-search")).toBeNull();
    expect(screen.queryByTestId("groups-add")).toBeNull();
    expect(calls("GET", "/groups")[0]![0]).toContain("pageSize=100&status=ACTIVE");
  });

  it("hides New group from someone who may not add one", async () => {
    mockPermissions = ["groups.view"];
    serve({ "GET /groups": page([]), "GET /groups/options": OPTIONS });
    await renderScreen(<GroupsTab />);
    expect(await screen.findByText("Nothing found.")).toBeOnTheScreen();
    expect(screen.queryByTestId("groups-add")).toBeNull();
  });
});

describe("the group form", () => {
  it("adds a group with one time for every lesson day", async () => {
    const onSaved = jest.fn();
    serve({ "GET /groups/options": OPTIONS, "POST /groups": group({ id: "g7" }) });
    await renderScreen(<GroupFormSheet open onClose={jest.fn()} onSaved={onSaved} />);
    await fireEvent.changeText(screen.getByTestId("group-name"), " GE-Evening B1 ");
    await fireEvent.press(screen.getByTestId("group-course"));
    // Only the courses of the group's branch are offered.
    await screen.findByTestId("group-course-option-c1");
    expect(screen.queryByTestId("group-course-option-c9")).toBeNull();
    await fireEvent.press(screen.getByTestId("group-course-option-c1"));
    await fireEvent.changeText(screen.getByTestId("group-start"), "1800");
    await fireEvent.changeText(screen.getByTestId("group-end"), "19:30");
    await fireEvent.press(screen.getByTestId("group-room"));
    await fireEvent.press(await screen.findByTestId("group-room-option-r2"));
    await fireEvent.press(screen.getByTestId("group-teacher-add"));
    await fireEvent.press(screen.getByTestId("group-teacher-0"));
    await screen.findByTestId("group-teacher-0-option-t2");
    expect(screen.queryByTestId("group-teacher-0-option-t9")).toBeNull();
    await fireEvent.press(screen.getByTestId("group-teacher-0-option-t2"));
    await fireEvent.changeText(screen.getByTestId("group-share-0"), "35");
    await fireEvent.changeText(screen.getByTestId("group-start-date"), "01122026");
    await fireEvent.press(screen.getByTestId("group-save"));

    await waitFor(() => expect(calls("POST", "/groups")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups")[0]![1])).toEqual({
      branchId: "b1",
      name: "GE-Evening B1",
      courseId: "c1",
      gradingSystemId: null,
      billingMode: "MONTHLY",
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: "r2",
      })),
      teachers: [{ userId: "t2", role: "MAIN", shareType: "PERCENT", shareValue: 35 }],
      startDate: "2026-12-01",
      endDate: null,
      status: "ACTIVE",
      ignoreClashes: false,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("says what is missing and sends nothing", async () => {
    serve({ "GET /groups/options": OPTIONS });
    await renderScreen(<GroupFormSheet open onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId("group-end"), "08:00");
    await fireEvent.press(screen.getByTestId("group-save"));
    expect((await screen.findAllByText("Required.")).length).toBeGreaterThan(1);
    expect(screen.getByText("Closing time must be after opening time.")).toBeOnTheScreen();
    expect(calls("POST", "/groups")).toHaveLength(0);
  });

  it("takes custom days with a time of their own", async () => {
    serve({ "GET /groups/options": OPTIONS, "POST /groups": group() });
    await renderScreen(<GroupFormSheet open onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId("group-name"), "SAT");
    await fireEvent.press(screen.getByTestId("group-course"));
    await fireEvent.press(await screen.findByTestId("group-course-option-c1"));
    await fireEvent.press(screen.getByTestId("group-pattern"));
    await fireEvent.press(await screen.findByTestId("group-pattern-option-CUSTOM"));
    // No day chosen yet: the form says so.
    await fireEvent.press(screen.getByTestId("group-save"));
    expect(await screen.findByText("Add at least one lesson day")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("group-day-5"));
    await fireEvent.press(screen.getByTestId("group-day-1"));
    await fireEvent.press(screen.getByTestId("group-per-day"));
    await fireEvent.changeText(screen.getByTestId("group-start-1"), "20:30");
    await fireEvent.changeText(screen.getByTestId("group-end-1"), "21:30");
    await fireEvent.changeText(screen.getByTestId("group-start-5"), "16:30");
    await fireEvent.changeText(screen.getByTestId("group-end-5"), "17:30");
    await fireEvent.press(screen.getByTestId("group-save"));
    await waitFor(() => expect(calls("POST", "/groups")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups")[0]![1])).toMatchObject({
      weekdayPattern: "CUSTOM",
      slots: [
        { weekday: 1, startTime: "20:30", endTime: "21:30", roomId: null },
        { weekday: 5, startTime: "16:30", endTime: "17:30", roomId: null },
      ],
    });
  });

  it("names a room that is already busy and saves anyway when asked to", async () => {
    let refused = false;
    serve({
      "GET /groups/options": OPTIONS,
      "POST /groups": () => {
        if (refused) return group({ id: "g7" });
        refused = true;
        return answer(409, {
          error: {
            code: "CONFLICT",
            message: "errors.scheduleClash",
            meta: {
              clashes: [
                {
                  kind: "ROOM",
                  weekday: 2,
                  startTime: "09:00",
                  endTime: "10:30",
                  groupId: "g1",
                  groupName: "GE-Morning A1",
                  roomName: "Room 101",
                  teacherName: null,
                },
              ],
            },
          },
        });
      },
    });
    await renderScreen(<GroupFormSheet open onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId("group-name"), "GE-Second");
    await fireEvent.press(screen.getByTestId("group-course"));
    await fireEvent.press(await screen.findByTestId("group-course-option-c1"));
    await fireEvent.press(screen.getByTestId("group-save"));
    expect(await screen.findByTestId("group-clashes")).toHaveTextContent(
      /Tue 09:00–10:30: room Room 101 is taken by GE-Morning A1\./,
    );
    expect(screen.getByTestId("group-save")).toHaveTextContent("Save anyway");
    await fireEvent.press(screen.getByTestId("group-save"));
    await waitFor(() => expect(calls("POST", "/groups")).toHaveLength(2));
    expect(sentBody(calls("POST", "/groups")[1]![1])).toMatchObject({ ignoreClashes: true });
  });

  it("asks a running group from which day its new times count", async () => {
    serve({ "GET /groups/options": OPTIONS, "PATCH /groups/g1": group() });
    await renderScreen(<GroupFormSheet open onClose={jest.fn()} group={group()} />);
    expect(screen.getByTestId("group-name").props.value).toBe("GE-Morning A1");
    expect(screen.queryByTestId("group-times-changed")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("group-start"), "10:00");
    await fireEvent.changeText(screen.getByTestId("group-end"), "11:30");
    expect(await screen.findByTestId("group-schedule-from")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("group-schedule-from"), "01.12.2026");
    await fireEvent.press(screen.getByTestId("group-notify"));
    await fireEvent.press(screen.getByTestId("group-save"));
    await waitFor(() => expect(calls("PATCH", "/groups/g1")).toHaveLength(1));
    const body = sentBody(calls("PATCH", "/groups/g1")[0]![1]) as Record<string, unknown>;
    // The branch of a group is changed with "Move to another branch", never by an edit.
    expect(body).not.toHaveProperty("branchId");
    expect(body).toMatchObject({
      name: "GE-Morning A1",
      scheduleFrom: "2026-12-01",
      notifySchedule: false,
      status: "ACTIVE",
      teachers: [{ userId: "t1", role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
    });
  });

  it("changes only the days and times in its short form", async () => {
    serve({ "GET /groups/options": OPTIONS, "PATCH /groups/g1/schedule": group() });
    await renderScreen(<GroupFormSheet open onClose={jest.fn()} group={group()} mode="schedule" />);
    expect(screen.queryByTestId("group-name")).toBeNull();
    expect(screen.queryByTestId("group-teacher-add")).toBeNull();
    await fireEvent.press(screen.getByTestId("group-pattern"));
    await fireEvent.press(await screen.findByTestId("group-pattern-option-ODD"));
    await fireEvent.press(screen.getByTestId("group-save"));
    await waitFor(() => expect(calls("PATCH", "/groups/g1/schedule")).toHaveLength(1));
    const body = sentBody(calls("PATCH", "/groups/g1/schedule")[0]![1]) as {
      slots: Array<{ weekday: number }>;
    };
    expect(body).toMatchObject({ weekdayPattern: "ODD", notifySchedule: true });
    expect(body.slots.map((s) => s.weekday)).toEqual([1, 3, 5]);
    expect(body).not.toHaveProperty("name");
  });
});

describe("a group for the office", () => {
  const DAY_OFF: GroupDayOff = {
    id: "d1",
    date: "2026-11-26",
    reason: "Holiday",
    startTime: "09:00",
    movedTo: null,
    notified: true,
  };

  it("says what the group is and who teaches it for what share", async () => {
    serve({
      "GET /groups/g1/day-off": [
        DAY_OFF,
        { ...DAY_OFF, id: "d2", date: "2026-11-28", reason: "@student.cancelled" },
      ],
    });
    await renderScreen(<GroupOffice group={group()} />);
    expect(screen.getByTestId("group-status-badge")).toHaveTextContent("Active");
    expect(screen.getByTestId("group-teacher-t1")).toHaveTextContent(/Main teacher, 40%/);
    expect(await screen.findByTestId("day-off-d1")).toHaveTextContent(/Nov 26, 2026: Holiday/);
    // A day a student cancelled themselves is worded, not shown as its key.
    expect(screen.getByTestId("day-off-d2")).toHaveTextContent(/Cancelled by the student/);
  });

  it("finishes a group after a question, and offers Archive only to who may", async () => {
    mockPermissions = ["groups.view", "groups.update"];
    serve({ "GET /groups/g1/day-off": [], "POST /groups/g1/finish": group() });
    await renderScreen(<GroupOffice group={group()} />);
    await fireEvent.press(screen.getByTestId("group-more"));
    expect(await screen.findByTestId("group-do-finish")).toBeOnTheScreen();
    expect(screen.queryByTestId("group-do-archive")).toBeNull();
    // One branch: there is nowhere to move the group.
    expect(screen.queryByTestId("group-do-move")).toBeNull();
    await fireEvent.press(screen.getByTestId("group-do-finish"));
    await fireEvent.press(await screen.findByTestId("group-finish-confirm"));
    await waitFor(() => expect(calls("POST", "/groups/g1/finish")).toHaveLength(1));
  });

  it("archives a group and goes back to the list", async () => {
    serve({ "GET /groups/g1/day-off": [], "DELETE /groups/g1": undefined });
    await renderScreen(<GroupOffice group={group()} />);
    await fireEvent.press(screen.getByTestId("group-more"));
    await fireEvent.press(await screen.findByTestId("group-do-archive"));
    await fireEvent.press(await screen.findByTestId("group-archive-confirm"));
    await waitFor(() => expect(calls("DELETE", "/groups/g1")).toHaveLength(1));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("gives a day off, moves the lesson, and takes a day off back", async () => {
    serve({
      "GET /groups/g1/day-off": [DAY_OFF],
      "POST /groups/g1/day-off": DAY_OFF,
      "DELETE /day-off/d1": undefined,
    });
    await renderScreen(<GroupOffice group={group()} />);
    await fireEvent.press(screen.getByTestId("group-more"));
    await fireEvent.press(await screen.findByTestId("group-do-dayOff"));
    await fireEvent.changeText(await screen.findByTestId("day-off-date"), "27.11.2026");
    // No reason: nothing is sent.
    await fireEvent.press(screen.getByTestId("day-off-save"));
    expect(await screen.findByText("Required.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("day-off-reason"), "Teacher is ill");
    await fireEvent.press(screen.getByTestId("day-off-move"));
    await fireEvent.changeText(screen.getByTestId("day-off-new-date"), "29.11.2026");
    await fireEvent.changeText(screen.getByTestId("day-off-start"), "11:00");
    await fireEvent.changeText(screen.getByTestId("day-off-end"), "12:30");
    await fireEvent.press(screen.getByTestId("day-off-save"));
    await waitFor(() => expect(calls("POST", "/groups/g1/day-off")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups/g1/day-off")[0]![1])).toEqual({
      date: "2026-11-27",
      reason: "Teacher is ill",
      notify: true,
      moveTo: { date: "2026-11-29", startTime: "11:00", endTime: "12:30" },
    });

    await fireEvent.press(await screen.findByTestId("day-off-undo-d1"));
    await fireEvent.press(await screen.findByTestId("day-off-undo-confirm"));
    await waitFor(() => expect(calls("DELETE", "/day-off/d1")).toHaveLength(1));
  });

  it("changes a teacher, keeping the role and share of the one who leaves", async () => {
    serve({
      "GET /groups/g1/day-off": [],
      "GET /groups/options": OPTIONS,
      "POST /groups/g1/change-teacher": group(),
    });
    await renderScreen(<GroupOffice group={group()} />);
    await fireEvent.press(screen.getByTestId("group-more"));
    await fireEvent.press(await screen.findByTestId("group-do-changeTeacher"));
    await fireEvent.press(await screen.findByTestId("change-teacher-to"));
    // Not the teacher the group already has, and nobody of another branch.
    await screen.findByTestId("change-teacher-to-option-t2");
    expect(screen.queryByTestId("change-teacher-to-option-t1")).toBeNull();
    expect(screen.queryByTestId("change-teacher-to-option-t9")).toBeNull();
    await fireEvent.press(screen.getByTestId("change-teacher-to-option-t2"));
    await fireEvent.press(screen.getByTestId("change-teacher-save"));
    await waitFor(() => expect(calls("POST", "/change-teacher")).toHaveLength(1));
    expect(sentBody(calls("POST", "/change-teacher")[0]![1])).toEqual({
      fromUserId: "t1",
      to: { userId: "t2", role: "MAIN", shareType: "PERCENT", shareValue: 40 },
    });
  });

  it("sets the support teachers", async () => {
    serve({
      "GET /groups/g1/day-off": [],
      "GET /groups/options": OPTIONS,
      "POST /groups/g1/support-teachers": group(),
    });
    await renderScreen(<GroupOffice group={group()} />);
    await fireEvent.press(screen.getByTestId("group-more"));
    await fireEvent.press(await screen.findByTestId("group-do-support"));
    await fireEvent.press(await screen.findByTestId("support-t2"));
    await fireEvent.press(screen.getByTestId("support-save"));
    await waitFor(() => expect(calls("POST", "/support-teachers")).toHaveLength(1));
    expect(sentBody(calls("POST", "/support-teachers")[0]![1])).toEqual({ userIds: ["t2"] });
  });

  it("moves a group to another branch when the person has more than one", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    serve({ "GET /groups/g1/day-off": [], "POST /groups/g1/move-branch": group() });
    await renderScreen(<GroupOffice group={group()} />);
    await fireEvent.press(screen.getByTestId("group-more"));
    await fireEvent.press(await screen.findByTestId("group-do-move"));
    await fireEvent.press(await screen.findByTestId("move-branch-to"));
    await screen.findByTestId("move-branch-to-option-b2");
    expect(screen.queryByTestId("move-branch-to-option-b1")).toBeNull();
    await fireEvent.press(screen.getByTestId("move-branch-to-option-b2"));
    await fireEvent.press(screen.getByTestId("move-branch-save"));
    await waitFor(() => expect(calls("POST", "/move-branch")).toHaveLength(1));
    expect(sentBody(calls("POST", "/move-branch")[0]![1])).toEqual({ branchId: "b2" });
  });

  it("lets the group's own teacher change the times only where the centre allows it", async () => {
    mockPermissions = ["groups.view"];
    const mine = group({
      teachers: [{ ...group().teachers[0]!, userId: "u1", fullName: "Dilnoza Karimova" }],
    });
    serve({ "GET /groups/g1/day-off": [], "GET /groups/options": OPTIONS });
    await renderScreen(<GroupOffice group={mine} />);
    await waitFor(() => expect(calls("GET", "/groups/options")).toHaveLength(1));
    expect(screen.queryByTestId("group-times")).toBeNull();
    expect(screen.queryByTestId("group-edit")).toBeNull();
    expect(screen.queryByTestId("group-more")).toBeNull();
    // The teacher's share is the office's to see.
    expect(screen.getByTestId("group-teacher-u1")).not.toHaveTextContent(/40%/);
    clearClients();

    serve({
      "GET /groups/g1/day-off": [],
      "GET /groups/options": { ...OPTIONS, teachersChangeTimes: true },
    });
    await renderScreen(<GroupOffice group={mine} />);
    expect(await screen.findAllByTestId("group-times")).not.toHaveLength(0);
  });

  it("leaves an archived group as it is", async () => {
    serve({ "GET /groups/g1/day-off": [DAY_OFF] });
    await renderScreen(<GroupOffice group={group({ status: "ARCHIVED" })} />);
    expect(await screen.findByTestId("day-off-d1")).toBeOnTheScreen();
    expect(screen.queryByTestId("group-edit")).toBeNull();
    expect(screen.queryByTestId("group-more")).toBeNull();
    expect(screen.queryByTestId("day-off-undo-d1")).toBeNull();
  });
});

describe("the students of a group", () => {
  function members(
    list: Member[] = [member(), member({ id: "m2", fullName: "Lola", status: "NEW", balance: 0 })],
  ) {
    return {
      "GET /groups/g1": group(),
      "GET /groups/g1/members": list,
    };
  }

  it("lists them with status and balance, and those who left when asked", async () => {
    serve(members());
    await renderScreen(<MembersScreen />);
    expect(await screen.findByTestId("member-row-m1")).toBeOnTheScreen();
    expect(screen.getByTestId("member-status-m1")).toHaveTextContent("Active");
    expect(screen.getByTestId("member-balance-m1")).toHaveTextContent(/400,000/);
    await fireEvent.changeText(screen.getByTestId("members-search"), "lol");
    expect(screen.queryByTestId("member-row-m1")).toBeNull();
    expect(screen.getByTestId("member-row-m2")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("members-removed"));
    await waitFor(() =>
      expect(calls("GET", "/groups/g1/members").at(-1)![0]).toContain("archived=true"),
    );
  });

  it("changes a status and graduates", async () => {
    serve({ ...members(), "PATCH /memberships/m1": member({ status: "FROZEN" }) });
    await renderScreen(<MembersScreen />);
    await fireEvent.press(await screen.findByTestId("member-row-m1"));
    expect(await screen.findByTestId("member-to-GRADUATED")).toHaveTextContent("Graduate");
    await fireEvent.press(screen.getByTestId("member-to-FROZEN"));
    await waitFor(() => expect(calls("PATCH", "/memberships/m1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/memberships/m1")[0]![1])).toEqual({ status: "FROZEN" });
  });

  it("removes a student with one of the centre's reasons", async () => {
    serve({
      ...members(),
      "GET /leave-reasons": [
        { id: "lr1", name: "Moved away", kind: "LEAVE", isActive: true },
        { id: "lr2", name: "Schedule", kind: "TRANSFER", isActive: true },
        { id: "lr3", name: "Old reason", kind: "LEAVE", isActive: false },
      ],
      "POST /memberships/m1/remove": member({ status: "ARCHIVED" }),
    });
    await renderScreen(<MembersScreen />);
    await fireEvent.press(await screen.findByTestId("member-row-m1"));
    await fireEvent.press(await screen.findByTestId("member-remove"));
    await fireEvent.press(await screen.findByTestId("member-remove-reason-pick"));
    await screen.findByTestId("member-remove-reason-pick-option-lr1");
    expect(screen.queryByTestId("member-remove-reason-pick-option-lr2")).toBeNull();
    expect(screen.queryByTestId("member-remove-reason-pick-option-lr3")).toBeNull();
    await fireEvent.press(screen.getByTestId("member-remove-reason-pick-option-lr1"));
    await fireEvent.press(screen.getByTestId("member-remove-save"));
    await waitFor(() => expect(calls("POST", "/memberships/m1/remove")).toHaveLength(1));
    expect(sentBody(calls("POST", "/memberships/m1/remove")[0]![1])).toEqual({
      reason: "Moved away",
    });
  });

  it("moves a student to another group that is not over", async () => {
    serve({
      ...members(),
      "GET /students/options": STUDENT_OPTIONS,
      "GET /leave-reasons": [],
      "POST /memberships/m1/transfer": member(),
    });
    await renderScreen(<MembersScreen />);
    await fireEvent.press(await screen.findByTestId("member-row-m1"));
    await fireEvent.press(await screen.findByTestId("member-transfer"));
    await fireEvent.press(await screen.findByTestId("member-transfer-group"));
    await screen.findByTestId("member-transfer-group-option-g2");
    expect(screen.queryByTestId("member-transfer-group-option-g1")).toBeNull();
    expect(screen.queryByTestId("member-transfer-group-option-g3")).toBeNull();
    await fireEvent.press(screen.getByTestId("member-transfer-group-option-g2"));
    await fireEvent.changeText(screen.getByTestId("member-transfer-date"), "01.12.2026");
    await fireEvent.changeText(
      screen.getByTestId("member-transfer-reason"),
      "Evening suits better",
    );
    await fireEvent.press(screen.getByTestId("member-transfer-save"));
    await waitFor(() => expect(calls("POST", "/memberships/m1/transfer")).toHaveLength(1));
    expect(sentBody(calls("POST", "/memberships/m1/transfer")[0]![1])).toEqual({
      groupId: "g2",
      joinedAt: "2026-12-01",
      customPrice: null,
      note: null,
      reason: "Evening suits better",
    });
  });

  it("sets the day a student is charged from", async () => {
    serve({ ...members(), "PATCH /memberships/m1": member() });
    await renderScreen(<MembersScreen />);
    await fireEvent.press(await screen.findByTestId("member-row-m1"));
    await fireEvent.press(await screen.findByTestId("member-billing"));
    await fireEvent.changeText(await screen.findByTestId("member-billing-date"), "01.01.2027");
    await fireEvent.press(screen.getByTestId("member-billing-save"));
    await waitFor(() => expect(calls("PATCH", "/memberships/m1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/memberships/m1")[0]![1])).toEqual({
      billingFrom: "2027-01-01",
    });
  });

  it("adds a student the centre already has, found by name", async () => {
    serve({
      ...members(),
      "GET /students": {
        items: [{ id: "s9", fullName: "Jasur Aliev", phone: "+998905556677", groups: [] }],
        page: 1,
        pageSize: 8,
        total: 1,
      },
      "POST /groups/g1/members": member({ id: "m9" }),
    });
    await renderScreen(<MembersScreen />);
    await fireEvent.press(await screen.findByTestId("members-add"));
    // Nobody picked: the form asks for a student.
    await fireEvent.press(await screen.findByTestId("member-add-save"));
    expect(await screen.findByText("Choose a student.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("member-search"), "Jas");
    await fireEvent.press(await screen.findByTestId("member-found-s9"));
    expect(screen.getByTestId("member-picked")).toHaveTextContent(/Jasur Aliev/);
    await fireEvent.changeText(screen.getByTestId("member-joined"), "25.11.2026");
    await fireEvent.press(screen.getByTestId("member-custom"));
    await fireEvent.changeText(screen.getByTestId("member-price"), "300 000");
    await fireEvent.press(screen.getByTestId("member-add-save"));
    await waitFor(() => expect(calls("POST", "/groups/g1/members")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups/g1/members")[0]![1])).toEqual({
      studentId: "s9",
      joinedAt: "2026-11-25",
      billingFrom: null,
      customPrice: 300000,
      note: null,
      status: "ACTIVE",
    });
  });

  it("adds a new student straight into the group", async () => {
    serve({ ...members(), "POST /groups/g1/members": member({ id: "m9" }) });
    await renderScreen(<MembersScreen />);
    await fireEvent.press(await screen.findByTestId("members-add"));
    await fireEvent.press(await screen.findByTestId("member-new"));
    await fireEvent.changeText(screen.getByTestId("member-name"), "Madina Tosheva");
    await fireEvent.changeText(screen.getByTestId("member-phone"), "+998 90 123 45 67");
    await fireEvent.press(screen.getByTestId("member-add-save"));
    await waitFor(() => expect(calls("POST", "/groups/g1/members")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups/g1/members")[0]![1])).toMatchObject({
      newStudent: { fullName: "Madina Tosheva", phone: "+998901234567" },
      status: "ACTIVE",
    });
  });

  it("activates everyone who is new or on trial, and says how many", async () => {
    serve({ ...members(), "POST /groups/g1/activate-members": { activated: 1 } });
    await renderScreen(<MembersScreen />);
    await fireEvent.press(await screen.findByTestId("members-activate"));
    await fireEvent.press(await screen.findByTestId("members-activate-sheet-confirm"));
    expect(await screen.findByTestId("members-activated")).toHaveTextContent(
      "1 students activated.",
    );
  });

  it("only shows the list to someone who may not change groups", async () => {
    mockPermissions = ["groups.view", "students.view"];
    serve(members());
    await renderScreen(<MembersScreen />);
    await fireEvent.press(await screen.findByTestId("member-row-m1"));
    expect(screen.queryByTestId("members-add")).toBeNull();
    expect(screen.queryByTestId("members-activate")).toBeNull();
    expect(screen.queryByTestId("member-remove")).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/student/[id]",
      params: { id: "s1" },
    });
  });
});

describe("Add to a group on a student's page", () => {
  it("puts the student into a group they are not in", async () => {
    serve({
      "GET /students/options": STUDENT_OPTIONS,
      "POST /groups/g2/members": member({ id: "m9", groupId: "g2" }),
    });
    await renderScreen(
      <StudentToGroupSheet
        open
        onClose={jest.fn()}
        student={{
          id: "s1",
          fullName: "Sardor Karimov",
          groups: [{ groupId: "g1", status: "ACTIVE" }],
        }}
      />,
    );
    await fireEvent.press(await screen.findByTestId("to-group-group"));
    await screen.findByTestId("to-group-group-option-g2");
    expect(screen.queryByTestId("to-group-group-option-g1")).toBeNull();
    expect(screen.queryByTestId("to-group-group-option-g3")).toBeNull();
    await fireEvent.press(screen.getByTestId("to-group-group-option-g2"));
    await fireEvent.changeText(screen.getByTestId("to-group-joined"), "25.11.2026");
    await fireEvent.press(screen.getByTestId("to-group-save"));
    await waitFor(() => expect(calls("POST", "/groups/g2/members")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups/g2/members")[0]![1])).toEqual({
      studentId: "s1",
      joinedAt: "2026-11-25",
      billingFrom: null,
      customPrice: null,
      note: null,
      status: "ACTIVE",
    });
  });
});

describe("the timetable", () => {
  function week(change: Partial<Timetable> = {}): Timetable {
    return {
      mode: "room",
      branchId: "b1",
      branches: [{ id: "b1", name: "Chilonzor" }],
      rooms: [
        { id: "r1", name: "Room 101" },
        { id: "r2", name: "Lab" },
      ],
      teachers: [{ id: "t1", fullName: "Aziz Rahimov" }],
      selectedId: "r1",
      workStart: "08:00",
      workEnd: "20:00",
      blocks: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "10:30",
        groupId: `g${weekday}`,
        groupName: `Group of day ${weekday}`,
        courseName: "General English",
        color: null,
        roomName: "Room 101",
        teacherNames: ["Aziz Rahimov"],
      })),
      ...change,
    };
  }

  it("shows one day at a time on a phone and opens a lesson's group", async () => {
    serve({ "GET /groups/timetable": week() });
    await renderScreen(<TimetableScreen />);
    await fireEvent.press(await screen.findByTestId("timetable-weekday-3"));
    expect(screen.getByTestId("timetable-block-g3-3")).toHaveTextContent(/Group of day 3/);
    expect(screen.queryByTestId("timetable-block-g4-4")).toBeNull();
    await fireEvent.press(screen.getByTestId("timetable-block-g3-3"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/group/[id]", params: { id: "g3" } });
  });

  it("asks again for another room, and for a teacher's week", async () => {
    serve({ "GET /groups/timetable": week() });
    await renderScreen(<TimetableScreen />);
    await fireEvent.press(await screen.findByTestId("timetable-pick"));
    await fireEvent.press(await screen.findByTestId("timetable-pick-option-r2"));
    await waitFor(() => expect(calls("GET", "/groups/timetable").at(-1)![0]).toContain("id=r2"));
    await fireEvent.press(screen.getByTestId("timetable-mode-teacher"));
    await waitFor(() =>
      expect(calls("GET", "/groups/timetable").at(-1)![0]).toMatch(/mode=teacher$/),
    );
  });

  it("says so when the week is empty or the branch has no rooms", async () => {
    serve({ "GET /groups/timetable": week({ blocks: [] }) });
    await renderScreen(<TimetableScreen />);
    expect(await screen.findByTestId("timetable-nothing")).toBeOnTheScreen();
    clearClients();
    serve({ "GET /groups/timetable": week({ rooms: [], selectedId: null, blocks: [] }) });
    await renderScreen(<TimetableScreen />);
    expect(await screen.findByText("No rooms in this branch yet.")).toBeOnTheScreen();
  });
});

describe("small pieces", () => {
  it("opens the timetable inside the app", () => {
    expect(nativeRoute("/timetable")).toBe("/staff/timetable");
  });

  it("reads a typed time of day", () => {
    expect(typedToTime("9:05")).toBe("09:05");
    expect(typedToTime("19.30")).toBe("19:30");
    expect(typedToTime("24:00")).toBeNull();
    expect(typedToTime("19:6")).toBeNull();
    expect(typedToTime("")).toBeNull();
  });
});
