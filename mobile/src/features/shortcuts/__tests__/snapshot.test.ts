import type { StudentHome, Today, TodayLesson } from "@/api/types";

import { centreMoment, MAX_TASKS, staffSnapshot, studentSnapshot } from "../snapshot";
import { isShortcut, staffTarget, studentTarget } from "../targets";

/*
 * The note Siri and Gemini answer from, and where a shortcut leads (A-273).
 * Hours are the centre's: 19:30 in Tashkent is 14:30 in universal time.
 */

function lesson(change: Partial<TodayLesson>): TodayLesson {
  return {
    id: "l1",
    groupId: "g1",
    groupName: "English A1",
    courseName: "English",
    color: null,
    date: "2026-11-26",
    startTime: "19:30",
    endTime: "21:00",
    roomName: "Room 3",
    topic: null,
    suggestedTopic: null,
    isExtra: false,
    teacherNames: [],
    members: [],
    present: 0,
    marked: 0,
    homework: null,
    ...change,
  };
}

function day(change: Partial<Today> = {}): Today {
  return {
    date: "2026-11-26",
    today: "2026-11-26",
    lessons: [],
    next: null,
    debtors: [],
    debtorCount: 0,
    debtTotal: 0,
    canMark: true,
    canSeeBalances: false,
    ...change,
  };
}

function home(change: Partial<StudentHome["profiles"][number]>[] = [{}]): StudentHome {
  return {
    account: { id: "a1", name: "Dana", phone: null, hasPassword: true },
    signedInWith: "PASSWORD",
    profiles: change.map((profile, index) => ({
      studentId: `s${index + 1}`,
      fullName: `Child ${index + 1}`,
      relation: "SELF",
      organizationName: "Centre",
      groups: [],
      homework: [],
      ...profile,
    })),
  };
}

const group = (change: Partial<StudentHome["profiles"][number]["groups"][number]>) => ({
  membershipId: "m1",
  token: "tok-1",
  groupName: "English A1",
  courseName: "English",
  teachers: [],
  status: "ACTIVE" as const,
  nextLesson: null,
  balance: 0,
  nextPaymentDate: null,
  unreadNews: 0,
  live: false,
  ...change,
});

const NOW = Date.parse("2026-11-26T12:00:00Z");

describe("the note for Siri and Gemini", () => {
  it("reads a lesson's hour as Tashkent's clock", () => {
    expect(new Date(centreMoment("2026-11-26", "19:30")).toISOString()).toBe(
      "2026-11-26T14:30:00.000Z",
    );
  });

  it("holds a teacher's lessons of the day and the first one after it, in order", () => {
    const note = staffSnapshot(
      day({
        lessons: [
          lesson({ id: "late", startTime: "19:30", endTime: "21:00" }),
          lesson({ id: "early", startTime: "09:00", endTime: "10:30", roomName: null }),
        ],
        next: {
          id: "tomorrow",
          groupId: "g2",
          groupName: "SAT",
          date: "2026-11-27",
          startTime: "20:00",
          endTime: "21:00",
          roomName: null,
        },
      }),
      4,
      NOW,
    );
    expect(note.kind).toBe("staff");
    expect(note.savedAt).toBe(NOW);
    expect(note.toCheck).toBe(4);
    expect(note.lessons.map((l) => l.id)).toEqual(["early", "late", "tomorrow"]);
    expect(note.lessons[1]).toMatchObject({ title: "English A1", place: "Room 3", live: false });
    expect(note.lessons[0]?.place).toBeNull();
    expect(note.homework).toEqual([]);
  });

  it("does not list the next lesson twice when it is one of today's", () => {
    const one = lesson({ id: "same" });
    const note = staffSnapshot(
      day({
        lessons: [one],
        next: {
          id: "same",
          groupId: "g1",
          groupName: "English A1",
          date: one.date,
          startTime: one.startTime,
          endTime: one.endTime,
          roomName: null,
        },
      }),
      null,
      NOW,
    );
    expect(note.lessons).toHaveLength(1);
  });

  it("holds a student's next lessons and waiting homework, without their personal links", () => {
    const note = studentSnapshot(
      home([
        {
          groups: [
            group({
              live: true,
              nextLesson: { date: "2026-11-26", startTime: "19:30", endTime: "21:00" },
            }),
            group({ membershipId: "m2", token: "tok-2", groupName: "No lessons yet" }),
          ],
          homework: [
            {
              id: "h1",
              groupName: "English A1",
              lessonDate: "2026-11-24",
              title: null,
              dueDate: "2026-11-28",
              text: "Exercise 4 on page 31.\nThen learn the words.",
              returned: false,
              token: "tok-1",
            },
          ],
        },
      ]),
      NOW,
    );
    expect(note.kind).toBe("student");
    expect(note.toCheck).toBeNull();
    expect(note.lessons).toEqual([
      {
        id: "m1",
        title: "English A1",
        place: null,
        startsAt: centreMoment("2026-11-26", "19:30"),
        endsAt: centreMoment("2026-11-26", "21:00"),
        live: true,
      },
    ]);
    expect(note.homework).toEqual([
      { id: "s1-h1", title: "Exercise 4 on page 31.", due: "2026-11-28" },
    ]);
    expect(JSON.stringify(note)).not.toContain("tok-");
  });

  it("says whose lesson it is when a parent has several children, and keeps the list short", () => {
    const tasks = Array.from({ length: MAX_TASKS + 5 }, (_, index) => ({
      id: `h${index}`,
      groupName: "English A1",
      lessonDate: null,
      title: `Task ${index}`,
      dueDate: null,
      text: "",
      returned: false,
      token: "tok-1",
    }));
    const note = studentSnapshot(
      home([
        {
          groups: [
            group({ nextLesson: { date: "2026-11-27", startTime: "10:00", endTime: "11:00" } }),
          ],
        },
        { homework: tasks },
      ]),
      NOW,
    );
    expect(note.lessons[0]?.title).toBe("Child 1: English A1");
    expect(note.homework).toHaveLength(MAX_TASKS);
    expect(note.homework[0]?.title).toBe("Child 2: Task 0");
  });
});

describe("where a shortcut leads", () => {
  it("knows its three wishes and nothing else", () => {
    expect(isShortcut("next-lesson")).toBe(true);
    expect(isShortcut("start-lesson")).toBe(true);
    expect(isShortcut("homework")).toBe(true);
    expect(isShortcut("settings")).toBe(false);
    expect(isShortcut(undefined)).toBe(false);
  });

  it("takes a teacher to the lesson that is on or comes next today", () => {
    const today = day({
      lessons: [
        lesson({ id: "over", startTime: "09:00", endTime: "10:30" }),
        lesson({ id: "evening", startTime: "19:30", endTime: "21:00" }),
      ],
    });
    // 12:00 universal time is 17:00 in Tashkent: the morning lesson is over.
    expect(staffTarget("start-lesson", today, NOW)).toEqual({
      pathname: "/staff/lesson/[id]",
      params: { id: "evening", date: "2026-11-26" },
    });
    expect(staffTarget("next-lesson", today, NOW)).toEqual(staffTarget("start-lesson", today, NOW));
  });

  it("takes a teacher to the next lesson when today's are over, or to the day when there is none", () => {
    const over = lesson({ id: "over", startTime: "09:00", endTime: "10:30" });
    const next = {
      id: "n1",
      groupId: "g2",
      groupName: "SAT",
      date: "2026-11-27",
      startTime: "20:00",
      endTime: "21:00",
      roomName: null,
    };
    expect(staffTarget("next-lesson", day({ lessons: [over], next }), NOW)).toEqual({
      pathname: "/staff/lesson/[id]",
      params: { id: "n1", date: "2026-11-27" },
    });
    expect(staffTarget("next-lesson", day({ lessons: [over] }), NOW)).toBe("/staff");
    expect(staffTarget("homework", day(), NOW)).toBe("/staff/checking");
  });

  it("takes a student into the lesson room only while a lesson is on", () => {
    const soon = group({
      membershipId: "m2",
      token: "tok-2",
      nextLesson: { date: "2026-11-27", startTime: "10:00", endTime: "11:00" },
    });
    const later = group({
      nextLesson: { date: "2026-11-28", startTime: "10:00", endTime: "11:00" },
    });
    const quiet = home([{ groups: [later, soon] }]);
    expect(studentTarget("start-lesson", quiet)).toEqual({
      pathname: "/student/class/[token]",
      params: { token: "tok-2" },
    });
    const live = home([{ groups: [{ ...later, live: true }, soon] }]);
    expect(studentTarget("start-lesson", live)).toEqual({
      pathname: "/student/room/[token]",
      params: { token: "tok-1" },
    });
    // "My next lesson" shows the group's page even while another lesson is on.
    expect(studentTarget("next-lesson", live)).toEqual({
      pathname: "/student/class/[token]",
      params: { token: "tok-2" },
    });
  });

  it("takes a student to the task that waits, or home when nothing does", () => {
    const task = {
      id: "h1",
      groupName: "English A1",
      lessonDate: null,
      title: "Essay",
      dueDate: null,
      text: "",
      returned: false,
      token: "tok-1",
    };
    expect(studentTarget("homework", home([{ homework: [task] }]))).toEqual({
      pathname: "/student/homework/[token]",
      params: { token: "tok-1", focus: "h1" },
    });
    expect(studentTarget("homework", home())).toBe("/student");
    expect(studentTarget("next-lesson", home())).toBe("/student");
  });
});
