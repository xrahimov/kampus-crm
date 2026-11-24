import { notifyManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type { Course, HoursWindow, Room, TeacherDetail, TeacherRow } from "@/api/office-catalog";
import type { Page } from "@/api/types";
import { CourseFormSheet } from "@/features/catalog/course-form";
import { CoursesScreen } from "@/features/catalog/courses-screen";
import { HoursCard } from "@/features/catalog/hours";
import { RoomsScreen } from "@/features/catalog/rooms-screen";
import { SettingsScreen } from "@/features/catalog/settings-screen";
import { TeacherFormSheet } from "@/features/catalog/teacher-form";
import { TeacherScreen } from "@/features/catalog/teacher-screen";
import { TeachersScreen } from "@/features/catalog/teachers-screen";
import { nativeRoute } from "@/features/office/site-paths";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { openOnSite } from "@/lib/web";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "t1" }),
  useFocusEffect: () => undefined,
}));
let mockPermissions: string[] = [];
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
let mockUserId = "u1";
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: mockUserId, fullName: "Dilnoza Karimova", hasSalary: false },
    roles: [{ code: "ADMIN", name: "Admin" }],
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockBranches[0],
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
jest.mock("@/lib/web", () => ({ openOnSite: jest.fn(async () => undefined) }));

/*
 * Teachers, courses and rooms in the app (A-234), and the list of Settings
 * sections that leads to the last two. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

// An answer is told to the screen in the same breath it arrives in, not a timer later: a
// redraw then never falls between two steps of a test, where React would not expect it.
beforeAll(() => notifyManager.setScheduler((flush) => queueMicrotask(flush)));
afterAll(() => notifyManager.setScheduler((flush) => setTimeout(flush, 0)));

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  jest.mocked(openOnSite).mockClear();
  mockUserId = "u1";
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  mockPermissions = [
    "teachers.view",
    "teachers.create",
    "teachers.update",
    "teachers.delete",
    "settings.catalog",
  ];
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

/**
 * Lets every answer arrive and be drawn, all of it inside React's `act`. A
 * `waitFor` that ends in the very moment a save finishes leaves the redraw
 * that follows outside it.
 */
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

function teacher(change: Partial<TeacherRow> = {}): TeacherRow {
  return {
    id: "t1",
    fullName: "Aziz Rahimov",
    phone: "+998901112233",
    gender: "MALE",
    birthDate: "1990-04-12",
    hireDate: "2024-09-01",
    photoUrl: null,
    salaryMethod: "PERCENT",
    fixedSalary: null,
    percentShare: 40,
    perLessonFee: null,
    perStudentFee: null,
    isArchived: false,
    createdAt: "2024-09-01T05:00:00.000Z",
    roles: [{ code: "TEACHER", name: "Teacher" }],
    branches: [{ id: "b1", name: "Chilonzor" }],
    signInCode: "OFF",
    telegramLinked: false,
    mustChangePassword: false,
    groupNames: ["GE-Morning A1"],
    ...change,
  };
}

function detail(change: Partial<TeacherDetail> = {}): TeacherDetail {
  return {
    ...teacher(),
    stats: { courses: 2, activeGroups: 3, activeStudents: 27 },
    groups: [
      {
        id: "g1",
        name: "GE-Morning A1",
        courseName: "General English",
        status: "ACTIVE",
        role: "MAIN",
        activeStudents: 12,
        startDate: "2026-09-01",
        endDate: "2027-03-01",
      },
      {
        id: "g2",
        name: "IELTS 6.5",
        courseName: "IELTS",
        status: "FROZEN",
        role: "SUPPORT",
        activeStudents: 8,
        startDate: "2026-10-01",
        endDate: "2027-04-01",
      },
    ],
    ...change,
  };
}

function page<T>(items: T[]): Page<T> {
  return { items, page: 1, pageSize: 30, total: items.length };
}

function course(change: Partial<Course> = {}): Course {
  return {
    id: "c1",
    branchId: "b1",
    branchName: "Chilonzor",
    name: "General English",
    description: "Four skills, A1 to B2",
    price: 450000,
    durationMonths: 6,
    gradingSystemId: "gs1",
    gradingSystemName: "Five points",
    color: "#0F766E",
    gradeWeights: null,
    isArchived: false,
    ...change,
  };
}

const ROOM: Room = {
  id: "r1",
  branchId: "b1",
  branchName: "Chilonzor",
  name: "Room 101",
  capacity: 12,
};

const HOURS: HoursWindow[] = [
  { weekday: 1, startTime: "14:00", endTime: "18:00" },
  { weekday: 3, startTime: "09:00", endTime: "12:00" },
];

describe("the teachers list", () => {
  it("has two lists with a search and an archive, and opens a person", async () => {
    serve({
      "GET /teachers": (url: string) =>
        page(
          url.includes("tab=support")
            ? [
                teacher({
                  id: "t2",
                  fullName: "Malika Yusupova",
                  roles: [{ code: "SUPPORT_TEACHER", name: "Support teacher" }],
                  salaryMethod: "MONTHLY",
                  fixedSalary: 2000000,
                  percentShare: null,
                }),
              ]
            : [teacher()],
        ),
    });
    await show(<TeachersScreen />);
    expect(await screen.findByText("Aziz Rahimov")).toBeOnTheScreen();
    // A teacher's row says how they are paid.
    expect(screen.getByText("Percent: 40%")).toBeOnTheScreen();
    expect(calls("GET", "/teachers")[0]![0]).toContain("tab=teachers");
    expect(calls("GET", "/teachers")[0]![0]).not.toContain("archived");

    await fireEvent.press(screen.getByTestId("teachers-kind-support"));
    // A support teacher's row says which groups they help in.
    expect(await screen.findByText("Malika Yusupova")).toBeOnTheScreen();
    expect(screen.getByText("GE-Morning A1")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("teachers-archived"));
    await waitFor(() => expect(calls("GET", "/teachers").at(-1)![0]).toContain("archived=true"));
    await fireEvent.changeText(screen.getByTestId("teachers-search"), "Mal");
    await waitFor(() => expect(calls("GET", "/teachers").at(-1)![0]).toContain("q=Mal"));

    await fireEvent.press(screen.getByTestId("teacher-t2"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/teachers/[id]",
      params: { id: "t2" },
    });
  });

  it("hides New teacher from someone who may not add one", async () => {
    mockPermissions = ["teachers.view"];
    serve({ "GET /teachers": page([]) });
    await show(<TeachersScreen />);
    expect(await screen.findByText("Nothing found.")).toBeOnTheScreen();
    expect(screen.queryByTestId("teachers-add")).toBeNull();
  });
});

describe("the teacher form", () => {
  it("adds a teacher with no password: the first sign-in is by Telegram code", async () => {
    const onSaved = jest.fn();
    serve({ "POST /teachers": teacher({ id: "t7" }) });
    await show(<TeacherFormSheet open onClose={jest.fn()} kind="teachers" onSaved={onSaved} />);
    expect(screen.getByTestId("teacher-first-sign-in")).toBeOnTheScreen();
    // Account safety belongs to someone who already exists.
    expect(screen.queryByTestId("teacher-safety")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("teacher-name"), " Jasur Aliyev ");
    await fireEvent.changeText(screen.getByTestId("teacher-phone"), "+998 90 123-45-67");
    await fireEvent.changeText(screen.getByTestId("teacher-amount"), "37,5");
    await fireEvent.press(screen.getByTestId("teacher-gender-FEMALE"));
    await fireEvent.press(screen.getByTestId("teacher-save"));

    await waitFor(() => expect(calls("POST", "/teachers")).toHaveLength(1));
    const body = sentBody(calls("POST", "/teachers")[0]![1]) as Record<string, unknown>;
    expect(body).toEqual({
      fullName: "Jasur Aliyev",
      phone: "+998901234567",
      gender: "FEMALE",
      birthDate: null,
      hireDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      branchIds: ["b1"],
      salaryMethod: "PERCENT",
      fixedSalary: null,
      percentShare: 37.5,
      perLessonFee: null,
      perStudentFee: null,
      roleCodes: ["TEACHER"],
    });
    expect(body).not.toHaveProperty("password");
    await settled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "t7" }));
  });

  it("gives a person added from the support list the support role", async () => {
    serve({ "POST /teachers": teacher({ id: "t8" }) });
    await show(<TeacherFormSheet open onClose={jest.fn()} kind="support" />);
    await fireEvent.changeText(screen.getByTestId("teacher-name"), "Malika Yusupova");
    await fireEvent.changeText(screen.getByTestId("teacher-phone"), "+998901234568");
    await fireEvent.press(screen.getByTestId("teacher-salary"));
    await fireEvent.press(await screen.findByTestId("teacher-salary-option-MONTHLY"));
    await fireEvent.changeText(screen.getByTestId("teacher-amount"), "2 000 000");
    await fireEvent.press(screen.getByTestId("teacher-save"));
    await waitFor(() => expect(calls("POST", "/teachers")).toHaveLength(1));
    expect(sentBody(calls("POST", "/teachers")[0]![1])).toMatchObject({
      roleCodes: ["SUPPORT_TEACHER"],
      salaryMethod: "MONTHLY",
      fixedSalary: 2000000,
      percentShare: null,
    });
  });

  it("says what is missing and sends nothing", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    serve({});
    await show(<TeacherFormSheet open onClose={jest.fn()} kind="teachers" />);
    // With two branches the form asks which ones; taking the only one off leaves none.
    await fireEvent.press(screen.getByTestId("teacher-branch-b1"));
    await fireEvent.press(screen.getByTestId("teacher-save"));
    expect(await screen.findAllByText("Required.")).toHaveLength(2);
    expect(screen.getByText("Choose at least one branch.")).toBeOnTheScreen();
    expect(calls("POST", "/teachers")).toHaveLength(0);
  });

  it("shows the server's reason under the field it is about", async () => {
    serve({
      "POST /teachers": answer(422, {
        error: { code: "errors.validation", fields: { phone: ["validation.phone"] } },
      }),
    });
    await show(<TeacherFormSheet open onClose={jest.fn()} kind="teachers" />);
    await fireEvent.changeText(screen.getByTestId("teacher-name"), "Jasur Aliyev");
    await fireEvent.changeText(screen.getByTestId("teacher-phone"), "+998901234567");
    await fireEvent.press(screen.getByTestId("teacher-save"));
    expect(await screen.findByText("Enter a number like +998 90 123 45 67.")).toBeOnTheScreen();
    // The field says it; no second notice on top.
    expect(screen.queryByTestId("teacher-problem")).toBeNull();
  });

  it("changes a teacher, keeps the sums of the other pay methods, and signs them out", async () => {
    const person = teacher({ telegramLinked: true, perLessonFee: 50000 });
    serve({
      "PATCH /teachers/t1": person,
      "POST /teachers/t1/sign-out-all": { revoked: 2 },
    });
    await show(<TeacherFormSheet open onClose={jest.fn()} kind="teachers" person={person} />);
    expect(screen.getByTestId("teacher-name").props.value).toBe("Aziz Rahimov");
    expect(screen.getByTestId("teacher-amount").props.value).toBe("40");
    expect(screen.queryByTestId("teacher-first-sign-in")).toBeNull();

    await fireEvent.press(screen.getByTestId("teacher-sign-out-all"));
    expect(await screen.findByTestId("teacher-signed-out")).toBeOnTheScreen();
    expect(calls("POST", "/teachers/t1/sign-out-all")).toHaveLength(1);

    await fireEvent.press(screen.getByTestId("teacher-sign-in-code"));
    await fireEvent.changeText(screen.getByTestId("teacher-amount"), "45");
    await fireEvent.press(screen.getByTestId("teacher-save"));
    await waitFor(() => expect(calls("PATCH", "/teachers/t1")).toHaveLength(1));
    const body = sentBody(calls("PATCH", "/teachers/t1")[0]![1]) as Record<string, unknown>;
    expect(body).toMatchObject({
      fullName: "Aziz Rahimov",
      salaryMethod: "PERCENT",
      percentShare: 45,
      perLessonFee: 50000,
      signInCode: "TELEGRAM",
    });
    // The role is fixed by the list the person is in.
    expect(body).not.toHaveProperty("roleCodes");
    expect(body).not.toHaveProperty("password");
  });

  it("leaves the Telegram code alone for someone the bot cannot reach", async () => {
    const person = teacher({ telegramLinked: false });
    serve({ "PATCH /teachers/t1": person });
    await show(<TeacherFormSheet open onClose={jest.fn()} kind="teachers" person={person} />);
    await fireEvent.press(screen.getByTestId("teacher-save"));
    await waitFor(() => expect(calls("PATCH", "/teachers/t1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/teachers/t1")[0]![1])).not.toHaveProperty("signInCode");
  });
});

describe("a teacher's page", () => {
  it("says who they are, counts their work and lists their groups", async () => {
    serve({ "GET /teachers/t1": detail(), "GET /teachers/t1/availability": HOURS });
    await show(<TeacherScreen />);
    expect(await screen.findByTestId("teacher-profile")).toBeOnTheScreen();
    expect(screen.getByTestId("teacher-salary-line")).toHaveTextContent(/Percent: 40%/);
    expect(screen.getByTestId("teacher-stat-courses")).toHaveTextContent(/2/);
    expect(screen.getByTestId("teacher-stat-activeGroups")).toHaveTextContent(/3/);
    expect(screen.getByTestId("teacher-stat-activeStudents")).toHaveTextContent(/27/);
    // A group they only support says so, and one that is not running says its status.
    expect(screen.getByTestId("teacher-group-g2")).toHaveTextContent(/Support/);
    expect(screen.getByTestId("teacher-group-g2")).toHaveTextContent(/Frozen/);

    await fireEvent.press(screen.getByTestId("teacher-group-g1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/group/[id]", params: { id: "g1" } });
  });

  it("archives the teacher after a question and goes back to the list", async () => {
    serve({
      "GET /teachers/t1": detail(),
      "GET /teachers/t1/availability": [],
      "DELETE /teachers/t1": undefined,
    });
    await show(<TeacherScreen />);
    await fireEvent.press(await screen.findByTestId("teacher-archive"));
    expect(await screen.findByText("Archive teacher?")).toBeOnTheScreen();
    expect(calls("DELETE", "/teachers/t1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("teacher-archive-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/teachers/t1")).toHaveLength(1));
    await settled();
    expect(mockBack).toHaveBeenCalled();
  });

  it("only shows an archived teacher", async () => {
    serve({
      "GET /teachers/t1": detail({ isArchived: true }),
      "GET /teachers/t1/availability": HOURS,
    });
    await show(<TeacherScreen />);
    expect(await screen.findByTestId("teacher-archived")).toBeOnTheScreen();
    expect(screen.queryByTestId("teacher-edit")).toBeNull();
    expect(screen.queryByTestId("teacher-archive")).toBeNull();
    await screen.findByTestId("hours-day-1");
    expect(screen.queryByTestId("hours-change")).toBeNull();
  });

  it("offers nothing to change to someone who may only look", async () => {
    mockPermissions = ["teachers.view"];
    serve({ "GET /teachers/t1": detail(), "GET /teachers/t1/availability": HOURS });
    await show(<TeacherScreen />);
    await screen.findByTestId("teacher-profile");
    expect(screen.queryByTestId("teacher-edit")).toBeNull();
    expect(screen.queryByTestId("teacher-archive")).toBeNull();
    await screen.findByTestId("hours-day-1");
    expect(screen.queryByTestId("hours-change")).toBeNull();
  });

  it("does not offer to archive yourself", async () => {
    mockUserId = "t1";
    serve({ "GET /teachers/t1": detail(), "GET /teachers/t1/availability": HOURS });
    await show(<TeacherScreen />);
    expect(await screen.findByTestId("teacher-edit")).toBeOnTheScreen();
    expect(screen.queryByTestId("teacher-archive")).toBeNull();
  });
});

describe("hours open for 1:1 booking", () => {
  it("shows the week, with the days that are not open", async () => {
    serve({ "GET /teachers/t1/availability": HOURS });
    await show(<HoursCard userId="t1" canEdit />);
    expect(await screen.findByTestId("hours-day-1")).toHaveTextContent(/14:00–18:00/);
    expect(screen.getByTestId("hours-day-3")).toHaveTextContent(/09:00–12:00/);
    expect(screen.getByTestId("hours-day-2")).toHaveTextContent(/not open/);
  });

  it("speaks to the teacher about their own students on their own page", async () => {
    serve({ "GET /teachers/u1/availability": [] });
    await show(<HoursCard userId="u1" canEdit own />);
    expect(
      await screen.findByText(
        "Your students in 1:1 groups book and move lessons inside these hours.",
      ),
    ).toBeOnTheScreen();
  });

  it("adds a window, takes one away and saves the whole week", async () => {
    serve({
      "GET /teachers/t1/availability": HOURS,
      "PUT /teachers/t1/availability": [{ weekday: 2, startTime: "10:00", endTime: "13:00" }],
    });
    await show(<HoursCard userId="t1" canEdit />);
    await fireEvent.press(await screen.findByTestId("hours-change"));
    await fireEvent.press(await screen.findByTestId("hours-add-2"));
    await fireEvent.changeText(screen.getByTestId("hours-start-2-0"), "1000");
    await fireEvent.changeText(screen.getByTestId("hours-end-2-0"), "13:00");
    await fireEvent.press(screen.getByTestId("hours-remove-3-0"));
    await fireEvent.press(screen.getByTestId("hours-save"));
    await waitFor(() => expect(calls("PUT", "/teachers/t1/availability")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/teachers/t1/availability")[0]![1])).toEqual({
      windows: [
        { weekday: 1, startTime: "14:00", endTime: "18:00" },
        { weekday: 2, startTime: "10:00", endTime: "13:00" },
      ],
    });
    // The card shows what the server kept.
    await waitFor(() => expect(screen.getByTestId("hours-day-2")).toHaveTextContent(/10:00–13:00/));
    expect(screen.getByTestId("hours-day-1")).toHaveTextContent(/not open/);
  });

  it("does not send a window that ends before it starts", async () => {
    serve({ "GET /teachers/t1/availability": HOURS });
    await show(<HoursCard userId="t1" canEdit />);
    await fireEvent.press(await screen.findByTestId("hours-change"));
    await fireEvent.changeText(await screen.findByTestId("hours-end-1-0"), "13:00");
    await fireEvent.press(screen.getByTestId("hours-save"));
    expect(await screen.findByText("Closing time must be after opening time.")).toBeOnTheScreen();
    expect(calls("PUT", "/teachers/t1/availability")).toHaveLength(0);
  });

  it("says why the server refused the week", async () => {
    serve({
      "GET /teachers/t1/availability": HOURS,
      "PUT /teachers/t1/availability": answer(422, {
        error: {
          code: "errors.validation",
          fields: { windows: ["validation.availabilityOverlap"] },
        },
      }),
    });
    await show(<HoursCard userId="t1" canEdit />);
    await fireEvent.press(await screen.findByTestId("hours-change"));
    await fireEvent.press(await screen.findByTestId("hours-save"));
    expect(await screen.findByTestId("hours-problem")).toHaveTextContent(
      "Hours of one day overlap",
    );
  });
});

describe("courses", () => {
  it("lists them with price and length, and keeps the archive as a list of its own", async () => {
    serve({
      "GET /courses": (url: string) =>
        page(
          url.includes("archived=true")
            ? [course({ id: "c9", name: "Old course", isArchived: true })]
            : [course()],
        ),
    });
    await show(<CoursesScreen />);
    const card = await screen.findByTestId("course-c1");
    expect(card).toHaveTextContent(/General English/);
    expect(card).toHaveTextContent(/450,000/);
    expect(card).toHaveTextContent(/6 months/);
    expect(card).toHaveTextContent(/Five points/);

    await fireEvent.press(screen.getByTestId("courses-archived"));
    expect(await screen.findByTestId("course-c9")).toBeOnTheScreen();
    // An archived course is only read, as on the site.
    await fireEvent.press(screen.getByTestId("course-c9"));
    expect(screen.queryByTestId("course-do-edit")).toBeNull();
  });

  it("adds a course with the usual grade weights", async () => {
    serve({
      "GET /grading-systems": { items: [{ id: "gs1", name: "Five points" }] },
      "POST /courses": course({ id: "c7" }),
    });
    await show(<CourseFormSheet open onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId("course-name"), " IELTS 6.5 ");
    await fireEvent.changeText(screen.getByTestId("course-price"), "600 000");
    await fireEvent.changeText(screen.getByTestId("course-months"), "4");
    await fireEvent.press(screen.getByTestId("course-grading"));
    await fireEvent.press(await screen.findByTestId("course-grading-option-gs1"));
    await fireEvent.press(screen.getByTestId("course-color-1d4ed8"));
    await fireEvent.press(screen.getByTestId("course-save"));
    await waitFor(() => expect(calls("POST", "/courses")).toHaveLength(1));
    expect(sentBody(calls("POST", "/courses")[0]![1])).toEqual({
      branchId: "b1",
      name: "IELTS 6.5",
      // Text, never null: the server refuses null for the notes.
      description: "",
      price: 600000,
      durationMonths: 4,
      gradingSystemId: "gs1",
      color: "#1D4ED8",
      gradeWeights: { lessons: 30, homework: 30, exercises: 0, tests: 20, exams: 20 },
    });
  });

  it("does not save weights that do not add up to 100", async () => {
    serve({ "GET /grading-systems": { items: [] } });
    await show(<CourseFormSheet open onClose={jest.fn()} course={course()} />);
    await fireEvent.changeText(screen.getByTestId("course-weight-exams"), "30");
    expect(screen.getByTestId("course-weights-sum")).toHaveTextContent(
      "Total: 110% (must be 100%)",
    );
    await fireEvent.press(screen.getByTestId("course-save"));
    expect(calls("PATCH", "/courses/c1")).toHaveLength(0);
  });

  it("changes a course without moving its branch, and keeps a colour chosen on the site", async () => {
    const mine = course({ color: "#ABCDEF" });
    serve({ "GET /grading-systems": { items: [] }, "PATCH /courses/c1": mine });
    await show(<CourseFormSheet open onClose={jest.fn()} course={mine} />);
    expect(screen.getByTestId("course-color-abcdef")).toBeSelected();
    expect(screen.queryByTestId("course-branch")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("course-price"), "500000");
    await fireEvent.press(screen.getByTestId("course-save"));
    await waitFor(() => expect(calls("PATCH", "/courses/c1")).toHaveLength(1));
    const body = sentBody(calls("PATCH", "/courses/c1")[0]![1]) as Record<string, unknown>;
    expect(body).toMatchObject({ price: 500000, color: "#ABCDEF", name: "General English" });
    expect(body).not.toHaveProperty("branchId");
  });

  it("writes the syllabus one topic a line", async () => {
    serve({
      "GET /courses": page([course()]),
      "GET /courses/c1/syllabus": [
        { id: "ct1", sortOrder: 0, title: "Greetings", note: null },
        { id: "ct2", sortOrder: 1, title: "Numbers", note: null },
      ],
      "PUT /courses/c1/syllabus": [],
    });
    await show(<CoursesScreen />);
    await fireEvent.press(await screen.findByTestId("course-c1"));
    await fireEvent.press(await screen.findByTestId("course-do-syllabus"));
    const topics = await screen.findByTestId("syllabus-topics");
    expect(topics.props.value).toBe("Greetings\nNumbers");
    expect(screen.getByTestId("syllabus-count")).toHaveTextContent("2 topics");
    await fireEvent.changeText(topics, "Greetings\n\n  Numbers \nFamily");
    expect(screen.getByTestId("syllabus-count")).toHaveTextContent("3 topics");
    await fireEvent.press(screen.getByTestId("syllabus-save"));
    await waitFor(() => expect(calls("PUT", "/courses/c1/syllabus")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/courses/c1/syllabus")[0]![1])).toEqual({
      topics: [{ title: "Greetings" }, { title: "Numbers" }, { title: "Family" }],
    });
  });

  it("archives a course after a question", async () => {
    serve({ "GET /courses": page([course()]), "DELETE /courses/c1": undefined });
    await show(<CoursesScreen />);
    await fireEvent.press(await screen.findByTestId("course-c1"));
    await fireEvent.press(await screen.findByTestId("course-do-archive"));
    expect(await screen.findByText("Archive course?")).toBeOnTheScreen();
    expect(calls("DELETE", "/courses/c1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("course-archive-confirm"));
    await waitFor(() => expect(calls("DELETE", "/courses/c1")).toHaveLength(1));
  });
});

describe("rooms", () => {
  it("lists rooms with their seats and adds one", async () => {
    serve({ "GET /rooms": page([ROOM]), "POST /rooms": { ...ROOM, id: "r2" } });
    await show(<RoomsScreen />);
    const card = await screen.findByTestId("room-r1");
    expect(card).toHaveTextContent(/Room 101/);
    expect(card).toHaveTextContent(/12/);

    await fireEvent.press(screen.getByTestId("rooms-add"));
    await fireEvent.changeText(await screen.findByTestId("room-name"), " Room 202 ");
    await fireEvent.changeText(screen.getByTestId("room-capacity"), "0");
    await fireEvent.press(screen.getByTestId("room-save"));
    // A room has at least one seat.
    expect(await screen.findByText("Too small.")).toBeOnTheScreen();
    expect(calls("POST", "/rooms")).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId("room-capacity"), "16");
    await fireEvent.press(screen.getByTestId("room-save"));
    await waitFor(() => expect(calls("POST", "/rooms")).toHaveLength(1));
    expect(sentBody(calls("POST", "/rooms")[0]![1])).toEqual({
      branchId: "b1",
      name: "Room 202",
      capacity: 16,
    });
  });

  it("changes a room and deletes one after a question", async () => {
    serve({
      "GET /rooms": page([ROOM]),
      "PATCH /rooms/r1": ROOM,
      "DELETE /rooms/r1": undefined,
    });
    await show(<RoomsScreen />);
    await fireEvent.press(await screen.findByTestId("room-r1"));
    const name = await screen.findByTestId("room-name");
    expect(name.props.value).toBe("Room 101");
    await fireEvent.changeText(screen.getByTestId("room-capacity"), "14");
    await fireEvent.press(screen.getByTestId("room-save"));
    await waitFor(() => expect(calls("PATCH", "/rooms/r1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/rooms/r1")[0]![1])).toEqual({
      name: "Room 101",
      capacity: 14,
    });

    await fireEvent.press(await screen.findByTestId("room-r1"));
    await fireEvent.press(await screen.findByTestId("room-delete"));
    expect(await screen.findByText("Delete room?")).toBeOnTheScreen();
    expect(calls("DELETE", "/rooms/r1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("room-delete-confirm-confirm"));
    await waitFor(() => expect(calls("DELETE", "/rooms/r1")).toHaveLength(1));
  });
});

describe("the settings list", () => {
  it("shows the sections the person may open: most in the app, the rest on the site", async () => {
    mockPermissions = ["settings.catalog", "settings.org", "students.create"];
    serve({});
    await show(<SettingsScreen />);
    expect(screen.getByTestId("settings-courses")).toBeOnTheScreen();
    const arrow = { includeHiddenElements: true };
    expect(screen.queryByTestId("settings-courses-site", arrow)).toBeNull();
    expect(screen.getByTestId("settings-migration-site", arrow)).toBeOnTheScreen();
    // No permission, no row.
    expect(screen.queryByTestId("settings-roles")).toBeNull();
    expect(screen.queryByTestId("settings-integrations")).toBeNull();

    await fireEvent.press(screen.getByTestId("settings-rooms"));
    expect(mockPush).toHaveBeenCalledWith("/staff/settings/rooms");
    await fireEvent.press(screen.getByTestId("settings-migration"));
    await waitFor(() => expect(openOnSite).toHaveBeenCalledWith("/en/settings/migration"));
  });

  it("knows which of the site's addresses the app has", () => {
    expect(nativeRoute("/teachers")).toBe("/staff/teachers");
    expect(nativeRoute("/teachers/t1")).toEqual({
      pathname: "/staff/teachers/[id]",
      params: { id: "t1" },
    });
    expect(nativeRoute("/settings")).toBe("/staff/settings");
    expect(nativeRoute("/settings/courses")).toBe("/staff/settings/courses");
    expect(nativeRoute("/settings/rooms")).toBe("/staff/settings/rooms");
    expect(nativeRoute("/settings/migration")).toBeNull();
  });
});
