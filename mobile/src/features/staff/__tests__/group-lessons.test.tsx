import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";

import type { Group, MonthGrid, TodayLesson } from "@/api/types";
import { GroupLinksScreen } from "@/features/staff/group-links-screen";
import { GroupScreen } from "@/features/staff/group-screen";
import { LessonExtras } from "@/features/staff/lesson-extras";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: "g1" }),
  useFocusEffect: () => undefined,
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/save-file", () => ({ saveFile: jest.fn(async () => "opened") }));
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false },
    permissions: mockPermissions,
    branches: [{ id: "b1", name: "Chilonzor" }],
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
jest.mock("@/lib/layout", () => ({
  useLayout: () => ({ wide: false, width: 390, height: 820, columns: 1 }),
}));
jest.mock("@/lib/web", () => ({ openOnSite: jest.fn(async () => undefined) }));

/*
 * What a group's page does around its lessons (A-262): an extra lesson, the
 * students' own links to the video lessons, free seats offered to the waiting
 * list, and on a lesson the plan topic, the note and link for the students
 * and what they thought of it.
 */

const fetchMock = jest.fn<Promise<Response>, [url: string, init?: RequestInit]>();
const realFetch = globalThis.fetch;

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
function calls(method: string, tail: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

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
    startTime: "19:30",
    endTime: "21:00",
    roomId: "r1",
    roomName: "Room 101",
  })),
  teachers: [],
  supportTeachers: [],
  startDate: "2020-01-01",
  endDate: "2099-06-01",
  status: "ACTIVE",
  activeStudents: 1,
  lessonsHeld: 5,
};

const LESSON: MonthGrid["lessons"][number] = {
  id: "l1",
  date: "2026-11-03",
  startTime: "19:30",
  endTime: "21:00",
  topic: null,
  courseTopicId: null,
  courseTopicTitle: null,
  attachmentUrl: null,
  isExtra: false,
  attendance: {},
  grades: {},
  studentNote: null,
  rating: { average: null, count: 0 },
};
const MONTH: MonthGrid = {
  month: "2026-11",
  lessons: [LESSON],
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

/** Everything the group's page reads; a test adds what it is about. */
const PAGE: Routes = {
  "GET /groups/g1": GROUP,
  "GET /groups/g1/lessons": MONTH,
  "GET /groups/g1/day-off": [],
  "GET /groups/g1/chat": { messages: [], unread: 0 },
  "GET /homework/queue": { items: [] },
  "GET /groups/g1/video": { enabled: true, room: null, todayLesson: null },
};

beforeEach(() => {
  mockPermissions = [];
  mockPush.mockReset();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("an extra lesson on a group's page", () => {
  it("is added by the office with the group's usual hours, and its month is shown", async () => {
    mockPermissions = ["groups.view", "groups.update"];
    const months: string[] = [];
    serve({
      ...PAGE,
      "GET /groups/g1/lessons": (url: string) => {
        months.push(new URL(url, "https://kampus.center").searchParams.get("month") ?? "");
        return MONTH;
      },
      "POST /groups/g1/lessons/extra": { id: "l9" },
    });
    await renderScreen(<GroupScreen />);
    await fireEvent.press(await screen.findByTestId("extra-lesson-open"));
    expect(screen.getByTestId("extra-lesson-start").props.value).toBe("19:30");
    expect(screen.getByTestId("extra-lesson-end").props.value).toBe("21:00");
    await fireEvent.changeText(screen.getByTestId("extra-lesson-date"), "14.02.2027");
    await fireEvent.changeText(screen.getByTestId("extra-lesson-start"), "1000");
    await fireEvent.changeText(screen.getByTestId("extra-lesson-end"), "1130");
    await fireEvent.press(screen.getByTestId("extra-lesson-save"));
    expect(await screen.findByTestId("extra-lesson-added")).toHaveTextContent(
      /Extra lesson added on .*Feb.*2027/,
    );
    expect(sentBody(calls("POST", "/lessons/extra")[0]![1])).toEqual({
      date: "2027-02-14",
      startTime: "10:00",
      endTime: "11:30",
    });
    // The page went to the month the lesson is in.
    await waitFor(() => expect(months).toContain("2027-02"));
  });

  it("is not sent when it would end before it starts", async () => {
    mockPermissions = ["groups.view", "groups.update"];
    serve(PAGE);
    await renderScreen(<GroupScreen />);
    await fireEvent.press(await screen.findByTestId("extra-lesson-open"));
    await fireEvent.changeText(screen.getByTestId("extra-lesson-end"), "1900");
    await fireEvent.press(screen.getByTestId("extra-lesson-save"));
    expect(await screen.findByText("The lesson must end after it starts.")).toBeOnTheScreen();
    expect(calls("POST", "/lessons/extra")).toHaveLength(0);
  });

  it("says why when the server refuses it, and stays open", async () => {
    mockPermissions = ["groups.view", "groups.update"];
    serve({
      ...PAGE,
      "POST /groups/g1/lessons/extra": () =>
        answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    });
    await renderScreen(<GroupScreen />);
    await fireEvent.press(await screen.findByTestId("extra-lesson-open"));
    await fireEvent.press(screen.getByTestId("extra-lesson-save"));
    expect(await screen.findByTestId("extra-lesson-problem")).toHaveTextContent(
      "You do not have permission to do this.",
    );
    expect(screen.queryByTestId("extra-lesson-added")).toBeNull();
  });

  it("is not a teacher's to add, nor anybody's in an archived group", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    serve(PAGE);
    await renderScreen(<GroupScreen />);
    await screen.findByTestId("month-lesson-l1");
    expect(screen.queryByTestId("extra-lesson-open")).toBeNull();
    clearClients();

    mockPermissions = ["groups.view", "groups.update"];
    serve({ ...PAGE, "GET /groups/g1": { ...GROUP, status: "ARCHIVED" } });
    await renderScreen(<GroupScreen />);
    await screen.findAllByTestId("month-lesson-l1");
    expect(screen.queryByTestId("extra-lesson-open")).toBeNull();
  });

  it("is named in the month, with what the students thought of a lesson", async () => {
    mockPermissions = ["groups.view"];
    serve({
      ...PAGE,
      "GET /groups/g1/lessons": {
        ...MONTH,
        lessons: [
          { ...LESSON, rating: { average: 4.5, count: 2 } },
          { ...LESSON, id: "l2", date: "2026-11-08", isExtra: true },
        ],
      },
    });
    await renderScreen(<GroupScreen />);
    expect(await screen.findByTestId("rating-l1")).toHaveTextContent("4.5");
    expect(screen.getByTestId("extra-l2")).toHaveTextContent("Extra lesson");
    expect(screen.queryByTestId("rating-l2")).toBeNull();
    expect(screen.queryByTestId("extra-l1")).toBeNull();
  });
});

describe("the way to the students' links", () => {
  it("shows to someone who marks lessons, where the centre has video lessons", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    serve(PAGE);
    await renderScreen(<GroupScreen />);
    await screen.findByTestId("month-lesson-l1");
    await fireEvent.press(screen.getByTestId("pages-more"));
    await fireEvent.press(await screen.findByTestId("open-links"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/staff/links/[id]", params: { id: "g1" } });
  });

  it("is not there without video lessons, or for someone who does not mark", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    serve({ ...PAGE, "GET /groups/g1/video": { enabled: false, room: null, todayLesson: null } });
    await renderScreen(<GroupScreen />);
    await screen.findByTestId("month-lesson-l1");
    await fireEvent.press(screen.getByTestId("pages-more"));
    expect(screen.queryByTestId("open-links")).toBeNull();
    clearClients();

    mockPermissions = ["groups.view"];
    fetchMock.mockClear();
    serve(PAGE);
    await renderScreen(<GroupScreen />);
    await screen.findAllByTestId("month-lesson-l1");
    expect(calls("GET", "/groups/g1/video")).toHaveLength(0);
  });
});

describe("free seats offered to the waiting list", () => {
  const WAITING = {
    waiting: 3,
    freeSeats: 2,
    smsActive: true,
    next: [
      { id: "w1", fullName: "Aziza Karimova", phone: "+998901112233" },
      { id: "w2", fullName: "Bobur Aliyev", phone: "+998907778899" },
    ],
  };
  const office = ["groups.view", "groups.update", "leads.view", "leads.update"];

  it("shows the seats and who is next, tells them and says how many were told", async () => {
    mockPermissions = office;
    serve({
      ...PAGE,
      "GET /groups/g1/waitlist": WAITING,
      "POST /groups/g1/waitlist": { offered: 2, sms: 2, telegram: 1 },
    });
    await renderScreen(<GroupScreen />);
    await fireEvent.press(await screen.findByTestId("group-more"));
    await fireEvent.press(await screen.findByTestId("group-do-offerSeats"));
    expect(await screen.findByTestId("offer-seats-free")).toHaveTextContent("2");
    expect(screen.getByTestId("offer-seats-waiting")).toHaveTextContent("3");
    expect(screen.getByTestId("offer-seats-w1")).toHaveTextContent(
      /1\..*Aziza Karimova.*\+998901112233/,
    );
    expect(screen.getByTestId("offer-seats-w2")).toHaveTextContent(/2\..*Bobur Aliyev/);
    expect(screen.getByTestId("offer-seats-sms")).toHaveTextContent(/each person gets a text/);
    expect(screen.getByTestId("offer-seats-send")).toHaveTextContent("Offer 2 seats");
    await fireEvent.press(screen.getByTestId("offer-seats-send"));
    expect(await screen.findByTestId("group-seats-offered")).toHaveTextContent(
      "2 offered: 2 SMS sent, 1 Telegram messages queued.",
    );
    expect(sentBody(calls("POST", "/groups/g1/waitlist")[0]![1])).toEqual({});
  });

  it("offers nothing when every seat is taken, and says the SMS is off", async () => {
    mockPermissions = office;
    serve({
      ...PAGE,
      "GET /groups/g1/waitlist": { waiting: 3, freeSeats: 0, smsActive: false, next: [] },
    });
    await renderScreen(<GroupScreen />);
    await fireEvent.press(await screen.findByTestId("group-more"));
    await fireEvent.press(await screen.findByTestId("group-do-offerSeats"));
    expect(await screen.findByTestId("offer-seats-none")).toHaveTextContent(
      /People are waiting, but the group has no free seat/,
    );
    expect(screen.getByTestId("offer-seats-sms")).toHaveTextContent(/nobody is texted/);
    expect(screen.getByTestId("offer-seats-send").props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId("offer-seats-send"));
    expect(calls("POST", "/groups/g1/waitlist")).toHaveLength(0);
  });

  it("says seats are unknown without a room, and why the server refused", async () => {
    mockPermissions = office;
    serve({
      ...PAGE,
      "GET /groups/g1/waitlist": { ...WAITING, freeSeats: null },
      "POST /groups/g1/waitlist": () =>
        answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    });
    await renderScreen(<GroupScreen />);
    await fireEvent.press(await screen.findByTestId("group-more"));
    await fireEvent.press(await screen.findByTestId("group-do-offerSeats"));
    expect(await screen.findByTestId("offer-seats-free")).toHaveTextContent(/unknown/);
    await fireEvent.press(screen.getByTestId("offer-seats-send"));
    expect(await screen.findByTestId("offer-seats-problem")).toHaveTextContent(
      "You do not have permission to do this.",
    );
    expect(screen.queryByTestId("group-seats-offered")).toBeNull();
  });

  it("is not offered by someone who may not change leads", async () => {
    mockPermissions = ["groups.view", "groups.update", "leads.view"];
    serve(PAGE);
    await renderScreen(<GroupScreen />);
    await fireEvent.press(await screen.findByTestId("group-more"));
    await screen.findByTestId("group-do-dayOff");
    expect(screen.queryByTestId("group-do-offerSeats")).toBeNull();
  });
});

describe("the students' links page", () => {
  const LINKS = [
    {
      membershipId: "m1",
      studentId: "s1",
      fullName: "Sardor Karimov",
      phone: "+998901112233",
      token: "tok-1",
    },
    {
      membershipId: "m2",
      studentId: "s2",
      fullName: "Aziza Karimova",
      phone: null,
      token: "tok-2",
    },
  ];
  const shared = () =>
    jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });

  it("lists each student's link and hands one, or all, to the phone's share window", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    const share = shared();
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/video/links": LINKS });
    await renderScreen(<GroupLinksScreen />);
    expect(await screen.findByTestId("link-address-m1")).toHaveTextContent(
      "https://kampus.center/class/tok-1",
    );
    await fireEvent.press(screen.getByTestId("link-share-m2"));
    expect(share).toHaveBeenLastCalledWith({ message: "https://kampus.center/class/tok-2" });
    await fireEvent.press(screen.getByTestId("links-share-all"));
    expect(share).toHaveBeenLastCalledWith({
      message:
        "Sardor Karimov: https://kampus.center/class/tok-1\nAziza Karimova: https://kampus.center/class/tok-2",
    });
    // Texting the links is for someone who may send SMS.
    expect(screen.queryByTestId("links-sms")).toBeNull();
  });

  it("says so when the device has no share window", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    jest.spyOn(Share, "share").mockRejectedValue(new Error("no share"));
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/video/links": LINKS });
    await renderScreen(<GroupLinksScreen />);
    await fireEvent.press(await screen.findByTestId("link-share-m1"));
    expect(await screen.findByTestId("link-unshared")).toHaveTextContent(/Press and hold the link/);
  });

  it("makes a new link for one student after asking, and shows it", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark"];
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/video/links": LINKS,
      "POST /memberships/m1/video-link": { ...LINKS[0], token: "tok-new" },
    });
    await renderScreen(<GroupLinksScreen />);
    await fireEvent.press(await screen.findByTestId("link-new-m1"));
    // Nothing is cut off before the question is answered.
    expect(calls("POST", "/memberships/m1/video-link")).toHaveLength(0);
    expect(
      screen.getByText("The old link stops working at once. Send the student the new one."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("link-new-confirm"));
    expect(await screen.findByTestId("link-renewed")).toHaveTextContent(
      "Sardor Karimov has a new link; the old one no longer works.",
    );
    expect(screen.getByTestId("link-address-m1")).toHaveTextContent(
      "https://kampus.center/class/tok-new",
    );
    expect(screen.getByTestId("link-address-m2")).toHaveTextContent(
      "https://kampus.center/class/tok-2",
    );
  });

  it("texts everybody their link and says how it went", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark", "sms.send"];
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/video/links": LINKS,
      "POST /groups/g1/video/sms": { sent: 1, failed: 0, skipped: 1 },
    });
    await renderScreen(<GroupLinksScreen />);
    const text = await screen.findByTestId("links-sms-text");
    expect(text.props.value).toBe("{studentName}, your video lesson link: {link}");
    await fireEvent.changeText(text, "  {studentName}, dars havolasi: {link}  ");
    await fireEvent.press(screen.getByTestId("links-sms-send"));
    expect(await screen.findByTestId("links-sms-result")).toHaveTextContent(
      "Sent 1, failed 0, skipped 1 without a phone number.",
    );
    expect(sentBody(calls("POST", "/groups/g1/video/sms")[0]![1])).toEqual({
      text: "{studentName}, dars havolasi: {link}",
    });
  });

  it("shows the server's word on a text without the link in it", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark", "sms.send"];
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/video/links": LINKS,
      "POST /groups/g1/video/sms": () =>
        answer(422, {
          error: {
            code: "VALIDATION",
            message: "errors.validation",
            fields: { text: ["validation.linkPlaceholder"] },
          },
        }),
    });
    await renderScreen(<GroupLinksScreen />);
    await fireEvent.changeText(await screen.findByTestId("links-sms-text"), "Dars bugun");
    await fireEvent.press(screen.getByTestId("links-sms-send"));
    expect(await screen.findByText("The text must contain {link}.")).toBeOnTheScreen();
    expect(screen.queryByTestId("links-sms-result")).toBeNull();
  });

  it("says a group without students has no links", async () => {
    mockPermissions = ["groups.view", "groups.attendance.mark", "sms.send"];
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/video/links": [] });
    await renderScreen(<GroupLinksScreen />);
    expect(await screen.findByText("The group has no current students.")).toBeOnTheScreen();
    expect(screen.queryByTestId("links-share-all")).toBeNull();
    expect(screen.queryByTestId("links-sms")).toBeNull();
  });
});

describe("the rest of a lesson", () => {
  const TODAY_LESSON: TodayLesson = {
    id: "l1",
    groupId: "g1",
    groupName: "GE-Morning A1",
    courseName: "General English",
    color: null,
    date: "2026-11-03",
    startTime: "19:30",
    endTime: "21:00",
    roomName: "Room 101",
    topic: null,
    suggestedTopic: null,
    isExtra: false,
    teacherNames: [],
    members: [],
    present: 0,
    marked: 0,
    homework: null,
  };
  const PLAN = {
    courseId: "c1",
    courseName: "General English",
    total: 2,
    done: 0,
    topics: [
      { id: "t1", sortOrder: 1, title: "Greetings" },
      { id: "t2", sortOrder: 2, title: "Numbers" },
    ],
  };
  const patches = () => calls("PATCH", "/lessons/l1").map(([, init]) => sentBody(init));

  it("saves the note for the students when the field is left, and clears it when emptied", async () => {
    let row = { ...LESSON };
    serve({
      "GET /groups/g1/lessons": () => ({ ...MONTH, lessons: [row] }),
      "GET /groups/g1/syllabus": { ...PLAN, topics: [] },
      "PATCH /lessons/l1": (_url: string, init?: RequestInit) => {
        row = { ...row, ...(sentBody(init) as object) };
        return undefined;
      },
    });
    await renderScreen(<LessonExtras lesson={TODAY_LESSON} canMark />);
    const note = await screen.findByTestId("student-note");
    // No plan, no choice of its topics.
    expect(screen.queryByTestId("plan-topic")).toBeNull();
    await fireEvent.changeText(note, "  Bring the workbook  ");
    await fireEvent(note, "blur");
    await waitFor(() => expect(patches()).toEqual([{ studentNote: "Bring the workbook" }]));
    await waitFor(() =>
      expect(screen.getByTestId("student-note").props.value).toBe("Bring the workbook"),
    );
    // Left as it is: nothing is sent again.
    await fireEvent(screen.getByTestId("student-note"), "blur");
    expect(patches()).toHaveLength(1);
    await fireEvent.changeText(screen.getByTestId("student-note"), "");
    await fireEvent(screen.getByTestId("student-note"), "blur");
    await waitFor(() => expect(patches().at(-1)).toEqual({ studentNote: null }));
  });

  it("saves the lesson's link and the topic chosen from the plan", async () => {
    serve({
      "GET /groups/g1/lessons": MONTH,
      "GET /groups/g1/syllabus": PLAN,
      "PATCH /lessons/l1": undefined,
    });
    await renderScreen(<LessonExtras lesson={TODAY_LESSON} canMark />);
    const link = await screen.findByTestId("lesson-link");
    await fireEvent.changeText(link, "https://example.org/unit-3");
    await fireEvent(link, "blur");
    await waitFor(() =>
      expect(patches()).toEqual([{ attachmentUrl: "https://example.org/unit-3" }]),
    );
    await fireEvent.press(await screen.findByTestId("plan-topic"));
    expect(await screen.findByTestId("plan-topic-option-t2")).toHaveTextContent("2. Numbers");
    await fireEvent.press(screen.getByTestId("plan-topic-option-t2"));
    await waitFor(() => expect(patches().at(-1)).toEqual({ courseTopicId: "t2" }));
  });

  it("takes the plan's topic off again", async () => {
    serve({
      "GET /groups/g1/lessons": { ...MONTH, lessons: [{ ...LESSON, courseTopicId: "t1" }] },
      "GET /groups/g1/syllabus": PLAN,
      "PATCH /lessons/l1": undefined,
    });
    await renderScreen(<LessonExtras lesson={TODAY_LESSON} canMark />);
    await fireEvent.press(await screen.findByTestId("plan-topic"));
    await fireEvent.press(await screen.findByTestId("plan-topic-option-none"));
    await waitFor(() => expect(patches()).toEqual([{ courseTopicId: null }]));
  });

  it("says why a change was refused", async () => {
    serve({
      "GET /groups/g1/lessons": MONTH,
      "GET /groups/g1/syllabus": PLAN,
      "PATCH /lessons/l1": () =>
        answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    });
    await renderScreen(<LessonExtras lesson={TODAY_LESSON} canMark />);
    const note = await screen.findByTestId("student-note");
    await fireEvent.changeText(note, "Bring the workbook");
    await fireEvent(note, "blur");
    expect(await screen.findByTestId("lesson-extras-problem")).toHaveTextContent(
      "You do not have permission to do this.",
    );
  });

  it("shows the note, unchangeable, to someone who does not mark the lesson", async () => {
    serve({
      "GET /groups/g1/lessons": {
        ...MONTH,
        lessons: [{ ...LESSON, studentNote: "Bring the workbook" }],
      },
    });
    await renderScreen(<LessonExtras lesson={TODAY_LESSON} canMark={false} />);
    expect(await screen.findByTestId("student-note-shown")).toHaveTextContent(
      /Note for the students.*Bring the workbook/,
    );
    expect(screen.queryByTestId("lesson-extras")).toBeNull();
    expect(calls("GET", "/groups/g1/syllabus")).toHaveLength(0);
  });

  it("shows what the students thought of the lesson, and asks only when somebody rated it", async () => {
    serve({
      "GET /groups/g1/lessons": {
        ...MONTH,
        lessons: [{ ...LESSON, rating: { average: 4.5, count: 2 } }],
      },
      "GET /lessons/l1/ratings": {
        lessonId: "l1",
        average: 4.5,
        rows: [
          {
            membershipId: "m1",
            fullName: "Sardor Karimov",
            rating: 5,
            comment: "Clear and fun",
            at: "2026-11-03T16:10:00.000Z",
          },
          {
            membershipId: "m2",
            fullName: "Aziza Karimova",
            rating: 4,
            comment: null,
            at: "2026-11-04T05:00:00.000Z",
          },
        ],
      },
    });
    await renderScreen(<LessonExtras lesson={TODAY_LESSON} canMark={false} />);
    expect(await screen.findByTestId("lesson-ratings-average")).toHaveTextContent("4.5");
    expect(screen.getByTestId("lesson-rating-m1")).toHaveTextContent(
      /Sardor Karimov.*Clear and fun/,
    );
    expect(screen.getByLabelText("5 stars")).toBeOnTheScreen();
    expect(screen.getByLabelText("4 stars")).toBeOnTheScreen();
    clearClients();

    fetchMock.mockClear();
    serve({ "GET /groups/g1/lessons": MONTH });
    await renderScreen(<LessonExtras lesson={TODAY_LESSON} canMark={false} />);
    await waitFor(() => expect(calls("GET", "/groups/g1/lessons")).toHaveLength(1));
    expect(calls("GET", "/lessons/l1/ratings")).toHaveLength(0);
  });
});
