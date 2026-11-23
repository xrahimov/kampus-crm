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
  /** This student's rating of the lesson, when given (A-168). */
  rating: LessonRating | null;
  /** The lesson is over and the student was not absent, so they may rate it. */
  canRate: boolean;
}

export interface LessonRating {
  rating: number;
  comment: string | null;
}

export interface Portal {
  student: { fullName: string; coins: number; timeZone: string | null };
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
  packages: {
    purchased: number;
    used: number;
    lessonsLeft: number;
    /** Packages the centre sells for this group. */
    offers: Array<{ id: string; name: string; lessons: number; price: number }>;
  } | null;
  exams: Array<{
    id: string;
    name: string;
    date: string;
    score: number | null;
    maxScore: number;
    passed: boolean | null;
    level: string | null;
    isPresent: boolean;
  }>;
  tests: Array<{
    id: string;
    testName: string;
    subject: string;
    score: number;
    maxScore: number;
    percent: number;
    submittedAt: string;
  }>;
}

/* ----- A student's homework (homework.service.ts, PortalHomeworkDto) ----- */

export type HomeworkAnswerStatus = "SUBMITTED" | "ACCEPTED" | "RETURNED";

export interface PortalHomework {
  id: string;
  lessonDate: string | null;
  lessonTopic: string | null;
  /** An assignment's name; a lesson's homework has none. */
  title: string | null;
  rubric: Array<{ name: string; max: number }>;
  maxScore: number | null;
  text: string;
  linkUrl: string | null;
  /** Already an address the student may open: /api/v1/public/class/<token>/files/… */
  attachmentUrl: string | null;
  dueDate: string | null;
  /** The answer is spoken: the student records it. */
  speaking: boolean;
  exercises: PortalExerciseSummary[];
  submission: {
    status: HomeworkAnswerStatus;
    note: string | null;
    attachmentUrl: string | null;
    submittedAt: string;
    teacherComment: string | null;
    teacherAudioUrl: string | null;
    rubricScores: number[] | null;
    score: number | null;
  } | null;
}

/* ----- A group's materials (materials.service.ts, MaterialDto as a student gets it) ----- */

export type MaterialKind = "FILE" | "LINK" | "RECORDING";

export interface PortalMaterial {
  id: string;
  lessonId: string | null;
  lessonDate: string | null;
  lessonTopic: string | null;
  kind: MaterialKind;
  title: string;
  /** A file's address is already one the student may open; a link is the link itself. */
  url: string;
  size: number | null;
  durationSec: number | null;
  /** A recording's streaming copy, once the server has made one. */
  hlsUrl: string | null;
  /** Where the student stopped watching a recording, in seconds. */
  resumeSec: number | null;
}

/** A material as staff see it (materials.service.ts): who added it, who watched it. */
export interface GroupMaterial extends PortalMaterial {
  /** A recording: how many students opened it, and how many watched it to the end. */
  watched: { started: number; finished: number } | null;
  createdByName: string | null;
  createdAt: string;
}

export interface GroupMaterials {
  items: GroupMaterial[];
  /** Lessons a material can be tied to: past ones and the next two weeks, newest first. */
  lessons: Array<{ id: string; date: string; topic: string | null }>;
}

/* ----- The group chat (group-chat.service.ts) ----- */

export interface ChatMessage {
  id: string;
  text: string;
  at: string;
  source: "WEB" | "TELEGRAM";
  author: { kind: "STAFF" | "STUDENT"; name: string };
  mine: boolean;
}

export interface GroupChat {
  messages: ChatMessage[];
  /** Messages by others since the reader last opened the chat. */
  unread: number;
}

export interface PortalChat extends GroupChat {
  teachers: string[];
}

/* ----- Tests on the student's side (portal-tests.service.ts) ----- */

export interface PortalTest {
  id: string;
  name: string;
  subject: string;
  questionCount: number;
  totalPoints: number;
  timeLimitMinutes: number | null;
  passPercent: number;
  deadline: string | null;
  available: boolean;
  startedAt: string | null;
  secondsLeft: number | null;
  attempt: {
    score: number;
    maxScore: number;
    percent: number;
    passed: boolean;
    submittedAt: string;
  } | null;
}

export interface PortalTestRun {
  id: string;
  name: string;
  subject: string;
  timeLimitMinutes: number | null;
  passPercent: number;
  startedAt: string;
  /** Seconds left as the server sees it; null without a time limit. */
  secondsLeft: number | null;
  questions: Array<{ id: string; text: string; options: string[]; points: number }>;
}

export interface PortalTestResult {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  coins: number;
}

/* ----- Self-check exercises (exercises.service.ts) ----- */

export type PortalExerciseItem =
  | { kind: "CHOICE"; prompt: string; options: string[]; multiple: boolean }
  | { kind: "TRUE_FALSE"; prompt: string }
  | { kind: "GAP"; prompt: string; gaps: number }
  | { kind: "MATCH"; prompt: string; lefts: string[]; rights: string[] }
  | { kind: "ORDER"; prompt: string; pieces: string[] }
  | { kind: "SHORT"; prompt: string };

export interface ExerciseBest {
  score: number;
  maxScore: number;
  percent: number;
}

export interface PortalExerciseSummary {
  id: string;
  title: string;
  itemCount: number;
  attempts: number;
  best: ExerciseBest | null;
}

export interface PortalExercise extends PortalExerciseSummary {
  items: PortalExerciseItem[];
}

/** One item's answer, by its kind: indexes, true or false, a list of words, or one word. */
export type ExerciseAnswer = number[] | boolean | string[] | string;

export interface PortalExerciseResult {
  score: number;
  maxScore: number;
  percent: number;
  items: Array<{ correct: boolean; points: number; max: number; key: string[] }>;
  best: ExerciseBest;
  attempts: number;
}

/* ----- News and the class stream (announcements.service.ts, stream.service.ts) ----- */

export interface PortalAnnouncement {
  id: string;
  title: string;
  body: string;
  /** The group, branch or centre it was posted to. */
  from: string;
  createdAt: string;
  read: boolean;
}

export interface StreamComment {
  id: string;
  body: string;
  author: string;
  byStaff: boolean;
  /** The reader's own comment. */
  mine: boolean;
  createdAt: string;
}

export interface StreamPost {
  id: string;
  body: string;
  attachmentUrl: string | null;
  pinned: boolean;
  /** The teacher closed comments on this post. */
  locked: boolean;
  author: string | null;
  createdAt: string;
  comments: StreamComment[];
}

/* ----- The course on the student's side (topic-content.service.ts, course-progress.service.ts) ----- */

export interface TopicBlock {
  id: string;
  kind: "TEXT" | "VIDEO" | "FILE" | "LINK";
  title: string;
  body: string | null;
  url: string | null;
}

export interface PortalTopic {
  id: string;
  sortOrder: number;
  title: string;
  open: boolean;
  /** Blocks of an open topic; empty while locked. */
  blocks: TopicBlock[];
  /** The lesson that covered it, when one did. */
  coveredOn: string | null;
  /** The day a locked topic opens, when the teacher set one. */
  opensOn: string | null;
  exercises: PortalExerciseSummary[];
}

export interface PortalCourse {
  courseName: string;
  total: number;
  open: number;
  topics: PortalTopic[];
}

export interface CourseProgress {
  /** Complete topics over all topics; null when the course has no syllabus. */
  percent: number | null;
  topicsTotal: number;
  topicsComplete: number;
  exercisesTotal: number;
  exercisesDone: number;
  scorePercent: number | null;
  attendancePercent: number | null;
  topics: Array<{
    topicId: string;
    exercisesTotal: number;
    exercisesDone: number;
    complete: boolean;
  }>;
}

/* ----- Flashcards (vocab.service.ts) ----- */

export interface VocabCard {
  id: string;
  term: string;
  translation: string;
  example: string | null;
  topicTitle: string;
}

export interface PortalVocab {
  /** Words of the topics open to the student. */
  total: number;
  learned: number;
  /** Due now, including words never seen. */
  due: number;
  /** Days in a row practised. */
  streak: number;
  /** The next cards to practise, at most 20. */
  cards: VocabCard[];
}

/* ----- Results (gradebook.service.ts, badges.service.ts) ----- */

export type GradebookCategory = "lessons" | "homework" | "exercises" | "tests" | "exams";

export interface PortalGradebook {
  courseName: string;
  categories: Array<{
    key: GradebookCategory;
    weight: number;
    /** Mean of the category's items in percent; null without items. */
    percent: number | null;
  }>;
  /** Weighted over the categories that have items; null when none has. */
  final: number | null;
  /** The level of the grading scale the final grade falls into. */
  level: string | null;
}

export type BadgeCode =
  | "firstHomework"
  | "homework10"
  | "streak10"
  | "perfectMonth"
  | "exercises10"
  | "exerciseAce"
  | "testAce"
  | "coins100"
  | "words50"
  | "vocabStreak7";

export interface PortalBadge {
  code: BadgeCode;
  /** When it was earned; null while it is still locked. */
  earnedAt: string | null;
  groupName: string | null;
}

/* ----- The schedule on the student's side (reschedule.service.ts, video.service.ts) ----- */

export interface WeeklyTime {
  /** 1 is Monday. */
  weekday: number;
  startTime: string;
  endTime: string;
}

/** What the personal link says about the group (ClassPageDto): its weekly times, in the student's zone when they set one. */
export interface ClassPage {
  organizationName: string;
  groupName: string;
  studentName: string;
  enabled: boolean;
  roomId: string | null;
  schedule: WeeklyTime[];
  timeZone: string | null;
  localSchedule: WeeklyTime[] | null;
}

export interface LessonTime {
  date: string;
  startTime: string;
  endTime: string;
}

export interface PortalSchedule {
  rules: {
    /** The centre allows it and the group has one student. */
    enabled: boolean;
    hours: number;
    workStart: string;
    workEnd: string;
    stepMinutes: number;
    bookingLimit: number;
    bookedAhead: number;
  };
  upcoming: Array<
    LessonTime & {
      id: string;
      topic: string | null;
      /** Still inside the window: the student may move or cancel it. */
      canChange: boolean;
      /** When the window closes, as an instant. */
      deadline: string;
    }
  >;
  /** Lessons taken off without a new time; the student may pick one. */
  cancelled: Array<{
    dayOffId: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    /** The teacher's reason, or `@student.moved` / `@student.cancelled`. */
    reason: string;
  }>;
  /** The teacher keeps booking hours: `slots` are their free times over two weeks. */
  hasAvailability: boolean;
  slots: LessonTime[];
}

/* ----- Paying online (online-payments.service.ts) ----- */

export type PayProvider = "PAYME" | "CLICK";

export interface PayOptions {
  /** Providers the centre switched on, in the order to show them. */
  providers: PayProvider[];
  suggestedAmount: number;
  suggestedMonth: string;
  months: string[];
}

export interface PaymentStatus {
  id: string;
  provider: PayProvider;
  status: "PENDING" | "PAID" | "CANCELLED";
  amount: number;
  effectiveMonth: string;
}

/* ----- Telegram, the invite code, certificates ----- */

export interface PortalTelegram {
  /** Opens the centre's bot with the student's code; null when the bot is not set up. */
  link: string | null;
  chats: Array<{ chatId: string; name: string | null; linkedAt: string }>;
}

export interface PortalReferral {
  code: string;
  link: string | null;
  joined: number;
}

export interface PortalCertificate {
  id: string;
  number: string;
  title: string;
  level: string | null;
  issuedAt: string;
  /** The public page anyone may open to check it. */
  url: string;
}
