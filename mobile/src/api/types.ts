/*
 * The shapes /api/v1 answers with, as far as the app reads them. They mirror
 * the DTOs of the server's services (src/server/services/**), written out here
 * so the app compiles on its own, without the server's code or its database
 * client. When a service's DTO changes, the matching type here changes with it.
 */

export type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "NOT_MARKED";
export type MembershipStatus = "NEW" | "TRIAL" | "ACTIVE" | "FROZEN" | "ARCHIVED" | "GRADUATED";
export type GroupStatus = "ACTIVE" | "ARCHIVED" | "TRIAL" | "FROZEN";

/* ----- Today (today.service.ts) ----- */

export interface TodayMember {
  membershipId: string;
  studentId: string;
  fullName: string;
  status: MembershipStatus;
  attendance: AttendanceStatus;
  comment: string | null;
  /** Positive = credit, negative = debt; null when the person may not see money. */
  balance: number | null;
}

export interface TodayHomework {
  id: string;
  text: string;
  dueDate: string | null;
  submitted: number;
  toCheck: number;
}

export interface TodayLesson {
  id: string;
  groupId: string;
  groupName: string;
  courseName: string;
  color: string | null;
  date: string;
  startTime: string;
  endTime: string;
  roomName: string | null;
  topic: string | null;
  suggestedTopic: { id: string; title: string } | null;
  isExtra: boolean;
  teacherNames: string[];
  members: TodayMember[];
  present: number;
  marked: number;
  homework: TodayHomework | null;
}

export interface NextLesson {
  id: string;
  groupId: string;
  groupName: string;
  date: string;
  startTime: string;
  endTime: string;
  roomName: string | null;
}

export interface TodayDebtor {
  studentId: string;
  fullName: string;
  groupId: string;
  groupName: string;
  amount: number;
}

export interface Today {
  date: string;
  /** The day the server considers today (the centre's day, not the phone's). */
  today: string;
  lessons: TodayLesson[];
  next: NextLesson | null;
  debtors: TodayDebtor[];
  debtorCount: number;
  debtTotal: number;
  canMark: boolean;
  canSeeBalances: boolean;
}

/* ----- Groups (groups.service.ts, lessons.service.ts) ----- */

export interface GroupSlot {
  /** 1 = Monday … 7 = Sunday. */
  weekday: number;
  startTime: string;
  endTime: string;
  roomName: string | null;
}

export interface Group {
  id: string;
  branchName: string;
  name: string;
  courseName: string;
  courseColor: string | null;
  slots: GroupSlot[];
  teachers: Array<{ userId: string; fullName: string; role: "MAIN" | "ASSISTANT" | "CO_TEACHER" }>;
  startDate: string;
  endDate: string;
  status: GroupStatus;
  activeStudents: number;
  lessonsHeld: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface GridLesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  topic: string | null;
  courseTopicTitle: string | null;
  isExtra: boolean;
  attendance: Record<string, { status: AttendanceStatus; comment: string | null }>;
  grades: Record<string, { score: number; comment: string | null }>;
  studentNote: string | null;
}

export interface GridMember {
  membershipId: string;
  studentId: string;
  fullName: string;
  status: MembershipStatus;
  average: number | null;
}

export interface MonthGrid {
  month: string;
  lessons: GridLesson[];
  members: GridMember[];
}

/* ----- Homework checking (checking-queue.service.ts) ----- */

export interface CheckingItem {
  homeworkId: string;
  membershipId: string;
  studentId: string;
  fullName: string;
  groupId: string;
  groupName: string;
  lessonDate: string | null;
  lessonTopic: string | null;
  title: string | null;
  text: string;
  linkUrl: string | null;
  speaking: boolean;
  note: string | null;
  attachmentUrl: string | null;
  submittedAt: string;
}

export interface CheckingQueue {
  items: CheckingItem[];
  total: number;
}

/* ----- Video lessons (video.service.ts) ----- */

export interface VideoRoom {
  id: string;
  groupId: string;
  groupName: string;
  lessonId: string | null;
  status: "LIVE" | "ENDED";
  startedAt: string;
  startedByName: string;
  online: Array<{ id: string; displayName: string }>;
}

export interface GroupVideo {
  /** Video lessons are switched on for this centre. */
  enabled: boolean;
  room: VideoRoom | null;
  todayLesson: { id: string; date: string; startTime: string; endTime: string } | null;
}

/* ----- Students and parents (student-home.service.ts, portal.service.ts) ----- */

export interface StudentHomeGroup {
  membershipId: string;
  /** The personal page of this membership: the key to everything about it. */
  token: string;
  groupName: string;
  courseName: string;
  teachers: string[];
  status: MembershipStatus;
  nextLesson: { date: string; startTime: string; endTime: string } | null;
  balance: number;
  nextPaymentDate: string | null;
  unreadNews: number;
  /** A video lesson is on right now. */
  live: boolean;
}

export interface StudentHomeHomework {
  id: string;
  groupName: string;
  lessonDate: string | null;
  title: string | null;
  dueDate: string | null;
  text: string;
  returned: boolean;
  token: string;
}

export interface StudentHomeProfile {
  studentId: string;
  fullName: string;
  relation: "SELF" | "CHILD";
  organizationName: string;
  groups: StudentHomeGroup[];
  homework: StudentHomeHomework[];
}

export interface StudentHome {
  account: { id: string; name: string; phone: string | null; hasPassword: boolean };
  profiles: StudentHomeProfile[];
  signedInWith: "PASSWORD" | "TELEGRAM";
}

export interface PortalLesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  topic: string | null;
  attendance: AttendanceStatus | null;
  grade: number | null;
  gradeComment: string | null;
  studentNote: string | null;
}

export interface Portal {
  student: { fullName: string; coins: number };
  group: { name: string; courseName: string; teachers: string[]; endDate: string };
  nextLesson: Pick<PortalLesson, "id" | "date" | "startTime" | "endTime" | "topic"> | null;
  lessons: PortalLesson[];
  stats: { lessonsHeld: number; attendancePercent: number | null; gradeAverage: number | null };
  money: {
    monthlyPrice: number;
    balance: number;
    nextPaymentDate: string | null;
    payments: Array<{
      id: string;
      paidAt: string;
      amount: number;
      effectiveMonth: string;
      method: string | null;
    }>;
  };
  packages: { purchased: number; used: number; lessonsLeft: number } | null;
}
