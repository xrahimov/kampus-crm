import { api } from "@/lib/api";

/*
 * Attendance by badge (A-139, in the app A-264): a student's badge code marks
 * them present. The server picks the lesson: the one named, else the student's
 * lesson of the day (the one under way, else the next one).
 */

/** What the server made of a badge. */
export type ScanStatus =
  /** Marked present now. */
  | "marked"
  /** Was present already. */
  | "already"
  /** A real badge, but no lesson today, or not this lesson's group. */
  | "noLesson"
  /** Not a Kampus badge, or a student this person may not see. */
  | "unknown";

export interface ScanResult {
  status: ScanStatus;
  studentId: string | null;
  studentName: string | null;
  groupName: string | null;
  /** The marked lesson's hours, as "19:30–21:30". */
  lessonTime: string | null;
  lessonId: string | null;
}

export function scanBadge(code: string, lessonId: string | null): Promise<ScanResult> {
  return api<ScanResult>("/attendance/scan", {
    method: "POST",
    body: { code, ...(lessonId ? { lessonId } : {}) },
  });
}
