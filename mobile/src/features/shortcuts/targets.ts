import type { Href } from "expo-router";

import type { StudentHome, StudentHomeGroup, Today } from "@/api/types";

import { centreMoment } from "./snapshot";

/*
 * Where a shortcut leads (A-273). "Start my lesson" is said to Siri, pressed on
 * the home screen or asked of Gemini long after the shortcut was made, so it
 * cannot carry a lesson's address. It carries a wish; the app turns the wish
 * into a screen when it opens, from what the server says at that moment.
 */

export const SHORTCUTS = ["next-lesson", "start-lesson", "homework"] as const;
export type Shortcut = (typeof SHORTCUTS)[number];

export function isShortcut(value: unknown): value is Shortcut {
  return typeof value === "string" && (SHORTCUTS as readonly string[]).includes(value);
}

/** A teacher: the lesson that is on or comes next today, else the next one, else the day's list. */
export function staffTarget(what: Shortcut, today: Today, now: number): Href {
  if (what === "homework") return "/staff/checking";
  const current = [...today.lessons]
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .find((lesson) => centreMoment(lesson.date, lesson.endTime) > now);
  const lesson = current ?? today.next;
  if (!lesson) return "/staff";
  return { pathname: "/staff/lesson/[id]", params: { id: lesson.id, date: lesson.date } };
}

function soonest(groups: StudentHomeGroup[]): StudentHomeGroup | null {
  let best: StudentHomeGroup | null = null;
  let bestAt = Infinity;
  for (const group of groups) {
    if (!group.nextLesson) continue;
    const at = centreMoment(group.nextLesson.date, group.nextLesson.startTime);
    if (at < bestAt) {
      best = group;
      bestAt = at;
    }
  }
  return best;
}

/** A student or parent: the lesson room when one is on, the group's page, or the task that waits. */
export function studentTarget(what: Shortcut, home: StudentHome): Href {
  const groups = home.profiles.flatMap((profile) => profile.groups);
  if (what === "homework") {
    const task = home.profiles.flatMap((profile) => profile.homework)[0];
    if (!task) return "/student";
    return {
      pathname: "/student/homework/[token]",
      params: { token: task.token, focus: task.id },
    };
  }
  if (what === "start-lesson") {
    const live = groups.find((group) => group.live);
    if (live) return { pathname: "/student/room/[token]", params: { token: live.token } };
  }
  const next = soonest(groups);
  if (!next) return "/student";
  return { pathname: "/student/class/[token]", params: { token: next.token } };
}
