import type { StudentHome, Today } from "@/api/types";

/*
 * What Siri and Gemini may say without opening Kampus (A-273). They cannot ask
 * the server: a spoken question is answered in a second or two, by a small
 * piece of native code that runs while the app's JavaScript is asleep. So the
 * app leaves a short note on the device every time it loads the day: the
 * coming lessons and the homework that waits. The note holds names and hours
 * only, never a sign-in token or a personal link, and it is wiped at sign-out.
 */

export type ShortcutKind = "staff" | "student";

export interface ShortcutLesson {
  id: string;
  /** The group's name, with the child's name before it when a parent has several children. */
  title: string;
  /** The room, when the centre gave the lesson one. */
  place: string | null;
  /** Start and end as moments (milliseconds), so the phone can say them in its own clock. */
  startsAt: number;
  endsAt: number;
  /** A video lesson is on right now (students only; the server tells). */
  live: boolean;
}

export interface ShortcutTask {
  id: string;
  title: string;
  /** The day the answer is due, "2026-11-28", when the teacher set one. */
  due: string | null;
}

export interface ShortcutSnapshot {
  kind: ShortcutKind;
  /** When the note was written, so an old one is not taken for today's truth. */
  savedAt: number;
  lessons: ShortcutLesson[];
  /** A student's tasks that wait for an answer. */
  homework: ShortcutTask[];
  /** A teacher's count of answers that wait to be checked; null when not known. */
  toCheck: number | null;
}

/** The note stays small: it lives in the phone's settings store, not in a database. */
export const MAX_LESSONS = 20;
export const MAX_TASKS = 10;
const TITLE_LENGTH = 80;

/** A lesson's hour as a moment. The centres' clock is Tashkent's: UTC+5, no summer time. */
export function centreMoment(date: string, time: string): number {
  return Date.parse(`${date.slice(0, 10)}T${time.slice(0, 5)}:00+05:00`);
}

function short(text: string): string {
  const line = text.trim().split(/\s*\n\s*/)[0] ?? "";
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
}

function inOrder(lessons: ShortcutLesson[]): ShortcutLesson[] {
  return lessons
    .filter((lesson) => Number.isFinite(lesson.startsAt) && Number.isFinite(lesson.endsAt))
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, MAX_LESSONS);
}

/** A teacher's note: today's lessons, the first one after today, and the answers to check. */
export function staffSnapshot(today: Today, toCheck: number | null, now: number): ShortcutSnapshot {
  const lessons: ShortcutLesson[] = today.lessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.groupName,
    place: lesson.roomName,
    startsAt: centreMoment(lesson.date, lesson.startTime),
    endsAt: centreMoment(lesson.date, lesson.endTime),
    live: false,
  }));
  const next = today.next;
  if (next && !lessons.some((lesson) => lesson.id === next.id)) {
    lessons.push({
      id: next.id,
      title: next.groupName,
      place: next.roomName,
      startsAt: centreMoment(next.date, next.startTime),
      endsAt: centreMoment(next.date, next.endTime),
      live: false,
    });
  }
  return { kind: "staff", savedAt: now, lessons: inOrder(lessons), homework: [], toCheck };
}

/** A student's or parent's note: each group's next lesson and the homework not handed in. */
export function studentSnapshot(home: StudentHome, now: number): ShortcutSnapshot {
  const several = home.profiles.length > 1;
  const lessons: ShortcutLesson[] = [];
  const homework: ShortcutTask[] = [];
  for (const profile of home.profiles) {
    const named = (text: string) => (several ? `${profile.fullName}: ${text}` : text);
    for (const group of profile.groups) {
      if (!group.nextLesson) continue;
      lessons.push({
        id: group.membershipId,
        title: named(group.groupName),
        place: null,
        startsAt: centreMoment(group.nextLesson.date, group.nextLesson.startTime),
        endsAt: centreMoment(group.nextLesson.date, group.nextLesson.endTime),
        live: group.live,
      });
    }
    for (const item of profile.homework) {
      homework.push({
        id: `${profile.studentId}-${item.id}`,
        title: named(short(item.title ?? item.text) || item.groupName),
        due: item.dueDate ? item.dueDate.slice(0, 10) : null,
      });
    }
  }
  return {
    kind: "student",
    savedAt: now,
    lessons: inOrder(lessons),
    homework: homework.slice(0, MAX_TASKS),
    toCheck: null,
  };
}
