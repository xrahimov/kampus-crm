/*
 * A full copy of a centre's SOFF CRM (A-189): the raw JSON export of each branch
 * (the read-only GET responses of the old system, saved as one file per branch)
 * is turned here into one clean snapshot that `soff-export-apply.ts` writes into
 * a Kampus organisation.
 *
 * This file is pure: no database, no imports that run. It can be run on its own
 * against the real export to check the counts before anything is written.
 */

// --- The snapshot ---------------------------------------------------------------

export type SnapGender = "MALE" | "FEMALE";
export type SnapMembershipStatus = "NEW" | "ACTIVE" | "FROZEN" | "ARCHIVED" | "GRADUATED";

export interface SnapBranch {
  ext: string;
  name: string;
}

export interface SnapStaff {
  ext: string;
  fullName: string;
  phone: string | null;
  gender: SnapGender;
  birthDate: string | null;
  hireDate: string | null;
  archived: boolean;
  /** Role names of the old system, lower case ("teacher", "admin", ...). */
  roles: string[];
  branchExts: string[];
  salary: { method: "PERCENT" | "MONTHLY" | "PER_LESSON" | "PER_STUDENT"; value: number } | null;
}

export interface SnapCourse {
  ext: string;
  branchExt: string;
  name: string;
  price: number;
  durationMonths: number;
  description: string | null;
  color: string | null;
}

export interface SnapRoom {
  ext: string;
  branchExt: string;
  name: string;
  capacity: number;
}

export interface SnapSlot {
  weekday: number;
  startTime: string;
  endTime: string;
  roomExt: string | null;
}

export interface SnapGroupTeacher {
  staffExt: string;
  since: string;
  shareType: "PERCENT" | "PER_LESSON" | "PER_STUDENT";
  shareValue: number;
}

export interface SnapGroup {
  ext: string;
  branchExt: string;
  name: string;
  /** Names the group carried before, newest first: an earlier copy may know it by one of them. */
  previousNames: string[];
  courseExt: string;
  status: "ACTIVE" | "FROZEN" | "ARCHIVED";
  startDate: string;
  endDate: string;
  slots: SnapSlot[];
  teachers: SnapGroupTeacher[];
}

export interface SnapStudent {
  /** `<branch>:<old id>`: a student of two branches is one record in each. */
  ext: string;
  branchExt: string;
  oldId: string;
  fullName: string;
  phone: string | null;
  gender: SnapGender;
  birthDate: string | null;
  archived: boolean;
  createdAt: string | null;
  parents: Array<{ fullName: string; phone: string }>;
  comments: Array<{ ext: string; text: string; author: string | null; createdAt: string | null }>;
}

export interface SnapMembership {
  /** `<group>:<old student id>`: every stay of the student in the group, folded into one. */
  ext: string;
  groupExt: string;
  studentExt: string;
  status: SnapMembershipStatus;
  joinedAt: string;
  leftAt: string | null;
  customPrice: number | null;
  /** Positive = the student has money, negative = the student owes. */
  balance: number;
  /** The old system's next payment day: everything before it is inside `balance`. */
  billingFrom: string | null;
  frozenAt: string | null;
  leaveReason: string | null;
  note: string | null;
}

export interface SnapPayment {
  ext: string;
  studentExt: string;
  branchExt: string;
  groupName: string | null;
  /** Negative for money given back. */
  amount: number;
  paidAt: string;
  method: string | null;
  comment: string | null;
}

export interface SnapLesson {
  groupExt: string;
  date: string;
  marks: Array<{
    studentExt: string;
    status: "PRESENT" | "ABSENT" | "EXCUSED";
    comment: string | null;
  }>;
}

export interface SnapLeadBoard {
  ext: string;
  branchExt: string;
  name: string;
  columns: string[];
}

export interface SnapLead {
  ext: string;
  branchExt: string;
  boardExt: string;
  column: string;
  fullName: string;
  phones: string[];
  source: string | null;
  status: "NEW" | "CONTACTED" | "LOST";
  temperature: "HOT" | "WARM" | "COLD" | null;
  days: "ODD" | "EVEN" | "OTHER" | null;
  lessonTime: string | null;
  teacherExt: string | null;
  comment: string | null;
  archived: boolean;
  createdAt: string | null;
}

export type SnapFinanceType = "EXPENSE" | "INCOME" | "ADVANCE" | "MARKETING" | "BONUS" | "PENALTY";

export interface SnapFinanceRow {
  ext: string;
  branchExt: string;
  type: SnapFinanceType;
  category: string | null;
  amount: number;
  date: string;
  comment: string | null;
  staffExt: string | null;
  method: string | null;
}

export interface SnapExam {
  ext: string;
  branchExt: string;
  groupExt: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  passScore: number;
  maxScore: number;
  examinerExt: string | null;
  roomExt: string | null;
  finished: boolean;
}

export interface SoffSnapshot {
  format: "soff-snapshot/1";
  /** The day the copy was taken, in the centre's time. */
  exportedAt: string;
  branches: SnapBranch[];
  paymentMethods: string[];
  leaveReasons: string[];
  leadSources: string[];
  staff: SnapStaff[];
  courses: SnapCourse[];
  rooms: SnapRoom[];
  groups: SnapGroup[];
  students: SnapStudent[];
  memberships: SnapMembership[];
  payments: SnapPayment[];
  lessons: SnapLesson[];
  leadBoards: SnapLeadBoard[];
  leads: SnapLead[];
  finance: SnapFinanceRow[];
  exams: SnapExam[];
  /** Things the copy could not place cleanly; counts only, never a person's data. */
  warnings: string[];
}

// --- Reading untyped JSON --------------------------------------------------------

type Json = unknown;
type Rec = Record<string, Json>;

function rec(value: Json): Rec {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

/** A list, whether the response was a bare array or wrapped in `results` / `response` / `result`. */
function list(value: Json): Json[] {
  if (Array.isArray(value)) return value;
  const r = rec(value);
  for (const key of ["results", "response", "result", "students"]) {
    if (Array.isArray(r[key])) return r[key];
  }
  return [];
}

function str(value: Json): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function num(value: Json): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function date(value: Json): string | null {
  const s = str(value);
  return s && ISO_DATE.test(s) ? s.slice(0, 10) : null;
}

/** "14:00:00" → "14:00". */
function time(value: Json): string | null {
  const s = str(value);
  const m = s ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : null;
}

function timestamp(value: Json): string | null {
  const s = str(value);
  if (!s || !ISO_DATE.test(s)) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

export function soffPhone(value: Json): string | null {
  const s = str(value);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  return digits.length >= 7 ? `+${digits}` : null;
}

function gender(value: Json): SnapGender {
  return str(value)?.toLowerCase() === "female" ? "FEMALE" : "MALE";
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The centre works in Tashkent time (UTC+5, no daylight saving). */
function tashkentDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 5 * 3_600_000).toISOString().slice(0, 10);
}

const WEEKDAYS: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const STATUS_RANK: Record<string, number> = { active: 0, new: 1, frozen: 2, archive: 3 };

// --- Normalising -----------------------------------------------------------------

interface BranchFile {
  branch: string;
  data: Rec;
}

interface Stay {
  id: string;
  group: string;
  student: string;
  status: string;
  added: string | null;
  deleted: string | null;
  balance: number | null;
  pairBalance: number | null;
  personalAmount: number | null;
  frozenNote: string | null;
  graduated: boolean;
  nextPayment: string | null;
}

/**
 * Turns the export files of every branch (and any supplement files) into one snapshot.
 * Files may come in any order; a record met twice (a student of two branches, the
 * expense list that every branch file repeats) is taken once.
 */
export function normalizeSoffExports(files: Json[]): SoffSnapshot {
  const warnings: string[] = [];
  const warn = (text: string) => {
    if (!warnings.includes(text)) warnings.push(text);
  };

  const mains: BranchFile[] = [];
  const extraGroupStudents = new Map<string, Rec>();
  let exportedAt: string | null = null;
  for (const file of files) {
    const f = rec(file);
    const format = str(f.format);
    if (format === "soff-export/1") {
      const data = rec(f.data);
      mains.push({ branch: str(f.branch) ?? str(data.branch) ?? "", data });
      for (const stamp of [f.exportedAt, data.finishedAt, data.repairedAt, data.startedAt]) {
        const day = str(stamp) ? tashkentDay(str(stamp)!) : null;
        if (day && (!exportedAt || day > exportedAt)) exportedAt = day;
      }
    } else if (format === "soff-export-supplement/1") {
      for (const [group, lists] of Object.entries(rec(f.groupStudents))) {
        extraGroupStudents.set(group, { ...rec(extraGroupStudents.get(group)), ...rec(lists) });
      }
    } else {
      throw new Error(`Not a SOFF export file (format ${format ?? "missing"})`);
    }
  }
  if (mains.length === 0) throw new Error("No SOFF export file given");
  if (!exportedAt) throw new Error("The export files carry no date");
  mains.sort((a, b) => Number(a.branch) - Number(b.branch));
  if (new Set(mains.map((m) => m.branch)).size !== mains.length) {
    throw new Error("Two export files are for the same branch");
  }

  // Branches, payment methods, catalogues ------------------------------------------
  const branchNames = new Map<string, string>();
  for (const { data } of mains) {
    for (const b of list(data.branches)) {
      const id = str(rec(b).id);
      const name = str(rec(b).name);
      if (id && name) branchNames.set(id, name);
    }
  }
  const branches: SnapBranch[] = mains.map(({ branch }) => {
    const name = branchNames.get(branch);
    if (!name) throw new Error(`Branch ${branch} has no name in the export`);
    return { ext: branch, name };
  });
  const branchSet = new Set(branches.map((b) => b.ext));

  const methodNames = new Map<string, string>();
  const leaveReasons = new Set<string>();
  const sourceNames = new Map<string, string>();
  for (const { data } of mains) {
    for (const p of list(data.paymentTypes)) {
      const id = str(rec(p).id);
      const name = str(rec(p).name);
      if (id && name) methodNames.set(id, name);
    }
    for (const r of list(data.leftReasons)) {
      const name = str(rec(r).reason_text);
      if (name) leaveReasons.add(name);
    }
    for (const s of list(rec(data.leads).sources)) {
      const id = str(rec(s).id);
      const name = str(rec(s).name);
      if (id && name) sourceNames.set(id, name);
    }
  }

  // Staff ---------------------------------------------------------------------------
  const staff = new Map<string, SnapStaff>();
  for (const { branch, data } of mains) {
    for (const [key, archived] of [
      ["employeesActive", false],
      ["employeesArchive", true],
    ] as const) {
      for (const raw of list(data[key])) {
        const e = rec(raw);
        const ext = str(e.id);
        const fullName = str(e.first_name);
        if (!ext || !fullName) continue;
        const inBranches = list(e.branches)
          .filter((b) => rec(b).exists === true)
          .map((b) => str(rec(b).id))
          .filter((id): id is string => id !== null && branchSet.has(id));
        const known = staff.get(ext);
        if (known) {
          for (const b of inBranches) if (!known.branchExts.includes(b)) known.branchExts.push(b);
          // Active in any branch file means active.
          if (!archived) known.archived = false;
          continue;
        }
        const amount = num(e.amount) ?? 0;
        const percentage = num(e.percentage) ?? 0;
        const lessonAmount = num(e.lesson_amount) ?? 0;
        const perStudent = num(e.per_student) ?? 0;
        const salary: SnapStaff["salary"] =
          e.is_fixed_salary === true && amount > 0
            ? { method: "MONTHLY", value: amount }
            : percentage > 0
              ? { method: "PERCENT", value: percentage }
              : lessonAmount > 0
                ? { method: "PER_LESSON", value: lessonAmount }
                : perStudent > 0
                  ? { method: "PER_STUDENT", value: perStudent }
                  : null;
        staff.set(ext, {
          ext,
          fullName,
          phone: soffPhone(e.phone),
          gender: gender(e.gender),
          birthDate: date(e.birth_date),
          hireDate: date(e.activated_at),
          archived,
          roles: list(e.roles_list)
            .map((r) => str(r)?.toLowerCase())
            .filter((r): r is string => !!r),
          branchExts: inBranches.length > 0 ? inBranches : [branch],
          salary,
        });
      }
    }
  }

  // Courses and rooms ---------------------------------------------------------------
  const courses = new Map<string, SnapCourse>();
  const rooms = new Map<string, SnapRoom>();
  for (const { branch, data } of mains) {
    for (const raw of list(data.courses)) {
      const c = rec(raw);
      const id = str(c.id);
      const name = str(c.name);
      if (!id || !name) continue;
      courses.set(`${branch}:${id}`, {
        ext: `${branch}:${id}`,
        branchExt: branch,
        name,
        price: num(c.price) ?? 0,
        durationMonths: Math.max(1, Math.round(num(c.month_duration) ?? 1)),
        description: str(c.description),
        color: /^#[0-9a-fA-F]{6}$/.test(str(c.color) ?? "") ? str(c.color) : null,
      });
    }
    for (const raw of list(data.rooms)) {
      const r = rec(raw);
      const id = str(r.id);
      const name = str(r.name);
      if (!id || !name) continue;
      const roomBranch = str(rec(r.branch).id) ?? branch;
      rooms.set(id, {
        ext: id,
        branchExt: branchSet.has(roomBranch) ? roomBranch : branch,
        name,
        capacity: Math.max(1, Math.round(num(r.capacity) ?? 1)),
      });
    }
  }

  // Groups --------------------------------------------------------------------------
  const groups = new Map<string, SnapGroup>();
  const groupRaw = new Map<string, { branch: string; raw: Rec; listRow: Rec }>();
  for (const { branch, data } of mains) {
    const listRows = new Map(list(data.groups).map((g) => [str(rec(g).id) ?? "", rec(g)]));
    for (const [ext, value] of Object.entries(rec(data.group))) {
      const raw = rec(value);
      const detail = rec(raw.detail);
      const listRow = listRows.get(ext) ?? {};
      const name = str(detail.name) ?? str(listRow.name);
      const startDate = date(detail.start_date) ?? date(listRow.start_date);
      const endDate = date(detail.end_date) ?? date(listRow.end_date);
      if (!name || !startDate || !endDate) {
        warn("A group without a name or dates was left out");
        continue;
      }
      groupRaw.set(ext, { branch, raw, listRow });

      const courseId = str(rec(detail.course_data).id);
      let courseExt = `${branch}:${courseId ?? "none"}`;
      if (!courses.has(courseExt)) {
        // A course that was deleted in the old system but still has groups.
        courseExt = `${branch}:g${ext}`;
        courses.set(courseExt, {
          ext: courseExt,
          branchExt: branch,
          name: str(rec(detail.course_data).name) ?? name,
          price: num(detail.monthly_amount) ?? num(listRow.price) ?? 0,
          durationMonths: Math.max(1, Math.round(num(detail.month_duration) ?? 1)),
          description: null,
          color: null,
        });
      }

      const slots: SnapSlot[] = [];
      for (const d of list(detail.day_of_week).length
        ? list(detail.day_of_week)
        : list(listRow.day_of_week)) {
        const day = rec(d);
        const weekday = WEEKDAYS[str(day.day_of_week)?.toLowerCase() ?? ""];
        const startTime = time(day.start_at) ?? time(detail.start_at);
        const endTime = time(day.end_at) ?? time(detail.end_at);
        if (!weekday || !startTime || !endTime) continue;
        if (slots.some((s) => s.weekday === weekday)) continue;
        const roomId = str(day.room) ?? str(rec(day.room_data).id) ?? str(rec(detail.room_data).id);
        if (roomId && !rooms.has(roomId)) {
          const roomName = str(rec(day.room_data).name) ?? str(rec(detail.room_data).name);
          if (roomName)
            rooms.set(roomId, { ext: roomId, branchExt: branch, name: roomName, capacity: 1 });
        }
        slots.push({
          weekday,
          startTime,
          endTime,
          roomExt: roomId && rooms.has(roomId) ? roomId : null,
        });
      }
      slots.sort((a, b) => a.weekday - b.weekday);

      const teachers: SnapGroupTeacher[] = [];
      for (const t of list(detail.teachers)) {
        const row = rec(t);
        const staffExt = str(row.teacher);
        if (!staffExt || !staff.has(staffExt) || teachers.some((x) => x.staffExt === staffExt)) {
          continue;
        }
        const percent = num(row.salary_percentage) ?? num(detail.salary_percentage) ?? 0;
        const perLesson = num(row.salary_lesson_amount) ?? num(detail.salary_lesson_amount) ?? 0;
        const perStudent = num(row.salary_per_student) ?? num(detail.salary_per_student) ?? 0;
        teachers.push({
          staffExt,
          since: date(row.start_date) ?? startDate,
          ...(perLesson > 0
            ? { shareType: "PER_LESSON" as const, shareValue: perLesson }
            : perStudent > 0
              ? { shareType: "PER_STUDENT" as const, shareValue: perStudent }
              : { shareType: "PERCENT" as const, shareValue: Math.min(100, Math.max(0, percent)) }),
        });
      }
      if (teachers.length === 0) {
        const staffExt = str(rec(detail.teacher_data).id) ?? str(listRow.teacher);
        if (staffExt && staff.has(staffExt)) {
          teachers.push({ staffExt, since: startDate, shareType: "PERCENT", shareValue: 0 });
        }
      }

      const previousNames: string[] = [];
      const history = list(raw.history)
        .map(rec)
        .filter((h) => str(h.field_changed) === "name")
        .sort((a, b) => (str(b.changed_at) ?? "").localeCompare(str(a.changed_at) ?? ""));
      for (const h of history) {
        const old = str(h.old_value);
        if (old && old !== name && !previousNames.includes(old)) previousNames.push(old);
      }

      const status = (str(detail.status) ?? str(listRow.status) ?? "active").toLowerCase();
      groups.set(ext, {
        ext,
        branchExt: branch,
        name,
        previousNames,
        courseExt,
        status: status === "archived" ? "ARCHIVED" : status === "frozen" ? "FROZEN" : "ACTIVE",
        startDate,
        endDate: endDate < startDate ? startDate : endDate,
        slots,
        teachers,
      });
    }
  }

  // Students ------------------------------------------------------------------------
  const students = new Map<string, SnapStudent>();
  const details = new Map<string, Rec>();
  for (const { data } of mains) {
    for (const [id, d] of Object.entries(rec(data.studentDetail))) {
      if (!details.has(id) && Object.keys(rec(d)).length > 0) details.set(id, rec(d));
    }
  }
  function studentOf(branch: string, id: string, listRow: Rec | null): SnapStudent | null {
    const ext = `${branch}:${id}`;
    const known = students.get(ext);
    if (known) return known;
    const detail = details.get(id) ?? {};
    const fullName = str(listRow?.first_name) ?? str(detail.first_name);
    if (!fullName) return null;
    const phone = soffPhone(listRow?.phone ?? detail.phone);
    const parents: SnapStudent["parents"] = [];
    // A parent often shares the student's own number; an extra number is kept only when it is new.
    const addParent = (name: Json, rawPhone: Json, extra: boolean) => {
      const parentPhone = soffPhone(rawPhone);
      if (!parentPhone || (extra && parentPhone === phone)) return;
      if (parents.some((p) => p.phone === parentPhone)) return;
      parents.push({ fullName: str(name) ?? fullName, phone: parentPhone });
    };
    for (const p of list(detail.parent_data).length
      ? list(detail.parent_data)
      : list(listRow?.parents)) {
      addParent(rec(p).first_name, rec(p).phone, false);
    }
    for (const p of list(detail.extra_phones)) addParent(rec(p).first_name, rec(p).phone, true);
    const comments: SnapStudent["comments"] = [];
    for (const c of list(detail.comments)) {
      const text = str(rec(c).description);
      const commentId = str(rec(c).id);
      if (!text || !commentId) continue;
      comments.push({
        ext: `${branch}:${commentId}`,
        text,
        author: str(rec(c).current_user),
        createdAt: timestamp(rec(c).created_at),
      });
    }
    const student: SnapStudent = {
      ext,
      branchExt: branch,
      oldId: id,
      fullName,
      phone,
      gender: gender(listRow?.gender ?? detail.gender),
      birthDate: date(listRow?.birth_date ?? detail.birth_date),
      archived: listRow ? str(listRow.status) === "archive" : true,
      createdAt: timestamp(detail.created_at),
      parents,
      comments,
    };
    students.set(ext, student);
    return student;
  }
  const nextPayment = new Map<string, string>();
  const studentBalance = new Map<string, number>();
  for (const { branch, data } of mains) {
    for (const raw of list(data.studentsBranch)) {
      const s = rec(raw);
      const id = str(s.id);
      if (!id) continue;
      if (!studentOf(branch, id, s)) warn("A student without a name was left out");
      studentBalance.set(`${branch}:${id}`, num(s.balance) ?? 0);
      for (const st of list(s.student_status)) {
        const stayId = str(rec(st).id);
        const np = date(rec(st).next_payment);
        if (stayId && np) nextPayment.set(stayId, np);
      }
    }
  }

  // Stays in groups, folded into one membership per group and student ------------------
  const stays = new Map<string, Stay>();
  const graduates = new Set<string>();
  for (const [group, { raw }] of groupRaw) {
    const lists = { ...rec(raw.students), ...rec(extraGroupStudents.get(group)) };
    for (const [listName, value] of Object.entries(lists)) {
      for (const item of list(value)) {
        const row = rec(item);
        const id = str(row.id);
        const student = str(rec(row.student).id);
        if (!id || !student) continue;
        if (listName === "graduates") graduates.add(id);
        if (stays.has(id)) continue;
        stays.set(id, {
          id,
          group,
          student,
          status: (str(row.status) ?? "archive").toLowerCase(),
          added: date(row.added_at) ?? date(rec(row.student).added_at),
          deleted: date(row.deleted_at) ?? date(rec(row.student).deleted_at),
          balance: num(row.student_group_balance),
          pairBalance: null,
          personalAmount: num(rec(rec(row.student).personal_amount).amount),
          frozenNote: str(rec(row.frozen_description).description),
          graduated: false,
          nextPayment: null,
        });
      }
    }
  }
  let unknownGroupStays = 0;
  for (const [student, detail] of details) {
    for (const item of list(detail.groups)) {
      const row = rec(item);
      const id = str(row.id);
      const group = str(rec(row.group_data).id);
      if (!id || !group || stays.has(id)) continue;
      if (!groups.has(group)) {
        unknownGroupStays += 1;
        continue;
      }
      stays.set(id, {
        id,
        group,
        student,
        status: (str(row.status) ?? "archive").toLowerCase(),
        added: date(row.added_at),
        deleted: date(row.deleted_at),
        balance: null,
        pairBalance: num(rec(row.group_data).balance),
        personalAmount: null,
        frozenNote: null,
        graduated: false,
        nextPayment: null,
      });
    }
  }
  if (unknownGroupStays > 0) {
    warn(
      `${unknownGroupStays} stays in groups that no longer exist in the old system were left out`,
    );
  }
  for (const stay of stays.values()) {
    stay.graduated = graduates.has(stay.id);
    stay.nextPayment = nextPayment.get(stay.id) ?? null;
  }

  const left = new Map<
    string,
    { date: string | null; reason: string | null; note: string | null }
  >();
  for (const { data } of mains) {
    for (const raw of list(data.leftStudents)) {
      const l = rec(raw);
      const stayId = str(rec(l.old_group_student).id);
      if (!stayId) continue;
      const leftDate = date(l.left_date);
      const known = left.get(stayId);
      if (known && (known.date ?? "") >= (leftDate ?? "")) continue;
      const reason = str(l.left_reason);
      const description = str(l.description);
      left.set(stayId, {
        date: leftDate,
        reason,
        note: description && description !== reason ? description : null,
      });
    }
  }

  // Attendance, also the fallback for a missing leave date ---------------------------
  const lessonMarks = new Map<string, Map<string, SnapLesson["marks"][number]>>();
  const lastSeen = new Map<string, string>();
  for (const [group, { raw }] of groupRaw) {
    const branch = groups.get(group)!.branchExt;
    for (const month of Object.values(rec(raw.months))) {
      for (const part of Object.values(rec(rec(month).attendance))) {
        for (const studentRow of list(part)) {
          for (const item of list(rec(studentRow).attendance)) {
            const a = rec(item);
            const day = date(a.date);
            const student = str(a.student);
            if (!day || !student || typeof a.is_available !== "boolean") continue;
            const key = `${group}|${day}`;
            const marks = lessonMarks.get(key) ?? new Map<string, SnapLesson["marks"][number]>();
            lessonMarks.set(key, marks);
            const notes = [a.late === true ? "Kechikdi" : null, str(a.description)].filter(Boolean);
            marks.set(student, {
              studentExt: `${branch}:${student}`,
              status: a.is_available
                ? "PRESENT"
                : a.is_reason_absent === true
                  ? "EXCUSED"
                  : "ABSENT",
              comment: notes.length ? notes.join(". ") : null,
            });
            const pair = `${group}:${student}`;
            if ((lastSeen.get(pair) ?? "") < day) lastSeen.set(pair, day);
          }
        }
      }
    }
  }

  const pairs = new Map<string, Stay[]>();
  for (const stay of stays.values()) {
    const key = `${stay.group}:${stay.student}`;
    pairs.set(key, [...(pairs.get(key) ?? []), stay]);
  }
  const memberships: SnapMembership[] = [];
  for (const [ext, rows] of pairs) {
    const group = groups.get(rows[0]!.group)!;
    const student = studentOf(group.branchExt, rows[0]!.student, null);
    if (!student) {
      warn("A group member without a student record was left out");
      continue;
    }
    rows.sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
        (b.added ?? "").localeCompare(a.added ?? "") ||
        Number(b.id) - Number(a.id),
    );
    const main = rows[0]!;
    const status: SnapMembershipStatus =
      main.status === "active"
        ? "ACTIVE"
        : main.status === "new"
          ? "NEW"
          : main.status === "frozen"
            ? "FROZEN"
            : main.graduated
              ? "GRADUATED"
              : "ARCHIVED";
    const joinedAt = main.added ?? rows.map((r) => r.added).find(Boolean) ?? group.startDate;
    const gone = status === "ARCHIVED" || status === "GRADUATED";
    const leftInfo = left.get(main.id);
    let leftAt: string | null = null;
    if (gone) {
      leftAt = main.deleted ?? leftInfo?.date ?? lastSeen.get(ext) ?? joinedAt;
      if (leftAt < joinedAt) leftAt = joinedAt;
      if (leftAt > exportedAt) leftAt = exportedAt;
    }
    const listed = rows.filter((r) => r.balance !== null);
    const balance = listed.length
      ? listed.reduce((sum, r) => sum + (r.balance ?? 0), 0)
      : (rows.find((r) => r.pairBalance !== null)?.pairBalance ?? 0);
    const course = courses.get(group.courseExt);
    const customPrice =
      main.personalAmount !== null && course && main.personalAmount !== course.price
        ? main.personalAmount
        : null;
    const notes: string[] = [];
    const earlier = rows
      .slice(1)
      .filter((r) => r.added)
      .sort((a, b) => (a.added ?? "").localeCompare(b.added ?? ""))
      .map((r) => `${r.added}${r.deleted && r.status === "archive" ? ` – ${r.deleted}` : ""}`);
    if (earlier.length) notes.push(`Avval ham shu guruhda bo'lgan: ${earlier.join("; ")}`);
    if (main.frozenNote && status === "FROZEN") notes.push(`Muzlatish sababi: ${main.frozenNote}`);
    if (gone && leftInfo?.note) notes.push(leftInfo.note);
    memberships.push({
      ext,
      groupExt: group.ext,
      studentExt: student.ext,
      status,
      joinedAt,
      leftAt,
      customPrice,
      balance: Math.round(balance * 100) / 100,
      billingFrom: gone
        ? addDays(leftAt!, 1)
        : status === "NEW"
          ? null
          : (main.nextPayment ?? `${addDays(`${exportedAt.slice(0, 7)}-28`, 4).slice(0, 7)}-01`),
      frozenAt: status === "FROZEN" ? exportedAt : null,
      leaveReason: gone ? (leftInfo?.reason ?? null) : null,
      note: notes.length ? notes.join(". ") : null,
    });
  }

  // The balances must add up to what the old system shows per student.
  const perStudent = new Map<string, number>();
  for (const m of memberships) {
    perStudent.set(m.studentExt, (perStudent.get(m.studentExt) ?? 0) + m.balance);
  }
  let balanceMismatch = 0;
  for (const [ext, expected] of studentBalance) {
    if (Math.abs((perStudent.get(ext) ?? 0) - expected) > 1) balanceMismatch += 1;
  }
  if (balanceMismatch > 0) {
    warn(
      `${balanceMismatch} students' group balances do not add up to the balance on their card in the old system`,
    );
  }

  const memberKeys = new Set(memberships.map((m) => m.ext));
  const lessons: SnapLesson[] = [];
  let marksWithoutMember = 0;
  for (const [key, marks] of lessonMarks) {
    const [groupExt, day] = key.split("|") as [string, string];
    const kept = [...marks.entries()].filter(([student]) =>
      memberKeys.has(`${groupExt}:${student}`),
    );
    marksWithoutMember += marks.size - kept.length;
    if (kept.length) lessons.push({ groupExt, date: day, marks: kept.map(([, mark]) => mark) });
  }
  if (marksWithoutMember > 0) {
    warn(`${marksWithoutMember} attendance marks belong to nobody in the group and were left out`);
  }
  lessons.sort((a, b) => a.groupExt.localeCompare(b.groupExt) || a.date.localeCompare(b.date));

  // Payments ------------------------------------------------------------------------
  const payments = new Map<string, SnapPayment>();
  let paymentsWithoutStudent = 0;
  const addPayment = (raw: Json, fileBranch: string, refund: boolean) => {
    const p = rec(raw);
    const id = str(p.id);
    const student = str(p.student);
    const paidAt = date(p.payment_date) ?? date(p.created_at);
    const amount = num(p.amount);
    if (!id || !student || !paidAt || amount === null) return;
    const ext = refund ? `r${id}` : id;
    if (payments.has(ext)) return;
    const group = str(p.group);
    const branchExt = (group && groups.get(group)?.branchExt) || fileBranch;
    if (!studentOf(branchExt, student, null)) {
      paymentsWithoutStudent += 1;
      return;
    }
    const bonus = num(p.bonus) ?? 0;
    const refunded = num(p.refund_amount) ?? 0;
    const admin = str(p.admin);
    const notes = [
      refund ? "Qaytarilgan pul" : null,
      str(p.description),
      bonus > 0 ? `Bonus: ${bonus}` : null,
      !refund && refunded > 0 ? `Qaytarilgan: ${refunded}` : null,
      admin ? `Qabul qildi: ${admin}` : null,
    ].filter(Boolean);
    payments.set(ext, {
      ext,
      studentExt: `${branchExt}:${student}`,
      branchExt,
      groupName: str(p.group_name),
      amount: refund ? -Math.abs(amount) : amount,
      paidAt,
      method: str(p.payment_type_name) ?? methodNames.get(str(p.payment_type) ?? "") ?? null,
      comment: notes.length ? notes.join(". ") : null,
    });
  };
  for (const { branch, data } of mains) {
    for (const perStudentList of Object.values(rec(data.studentPayments))) {
      for (const p of list(perStudentList)) addPayment(p, branch, false);
    }
    for (const p of list(data.payments)) addPayment(p, branch, false);
  }
  for (const { branch, data } of mains) {
    for (const p of list(data.paymentsReport)) {
      const row = rec(p);
      if (str(row.condition) !== "refund") continue;
      // The report covers every branch: keep a refund with the branch of its group.
      const group = str(row.group);
      if (group && groups.has(group) ? groups.get(group)!.branchExt === branch : true) {
        addPayment(p, branch, true);
      }
    }
  }
  if (paymentsWithoutStudent > 0) {
    warn(`${paymentsWithoutStudent} payments have no student in the export and were left out`);
  }

  // Leads ---------------------------------------------------------------------------
  const leadBoards = new Map<string, SnapLeadBoard>();
  const leads = new Map<string, SnapLead>();
  let leadsWithoutBoard = 0;
  for (const { branch, data } of mains) {
    const rawLeads = rec(data.leads);
    const departments = new Map<string, { name: string; order: number }>();
    const columnOf = new Map<string, { board: string; name: string; order: number }>();
    for (const d of [...list(rawLeads.departments), ...list(rawLeads.departmentsInactive)]) {
      const dep = rec(d);
      const id = str(dep.id);
      if (!id) continue;
      if (!departments.has(id)) {
        departments.set(id, { name: str(dep.name) ?? `Board ${id}`, order: num(dep.order) ?? 0 });
      }
      for (const c of list(dep.children)) {
        const child = rec(c);
        const childId = str(child.id);
        if (childId && !columnOf.has(childId)) {
          columnOf.set(childId, {
            board: id,
            name: str(child.name) ?? "Leads",
            order: num(child.order) ?? 0,
          });
        }
      }
    }
    for (const [id, value] of Object.entries(rec(rawLeads.byDepartment))) {
      list(rec(value).columns).forEach((c, index) => {
        const child = rec(c);
        const childId = str(child.id);
        if (childId && !columnOf.has(childId) && departments.has(id)) {
          columnOf.set(childId, { board: id, name: str(child.name) ?? "Leads", order: index });
        }
      });
    }
    const boardNames = new Set<string>();
    const boardOf = (departmentId: string): SnapLeadBoard => {
      const ext = `${branch}:${departmentId}`;
      const known = leadBoards.get(ext);
      if (known) return known;
      const base = departments.get(departmentId)!.name;
      let name = base;
      for (let n = 2; boardNames.has(name.toLowerCase()); n += 1) name = `${base} ${n}`;
      boardNames.add(name.toLowerCase());
      const columns = [...columnOf.values()]
        .filter((c) => c.board === departmentId)
        .sort((a, b) => a.order - b.order)
        .map((c) => c.name);
      const board: SnapLeadBoard = { ext, branchExt: branch, name, columns: [...new Set(columns)] };
      leadBoards.set(ext, board);
      return board;
    };
    for (const value of Object.values(rec(rawLeads.byDepartment))) {
      for (const raw of [...list(rec(value).active), ...list(rec(value).inactive)]) {
        const l = rec(raw);
        const id = str(l.id);
        const fullName = str(l.first_name);
        if (!id || !fullName || leads.has(id)) continue;
        const column = columnOf.get(str(l.department) ?? "");
        if (!column) {
          leadsWithoutBoard += 1;
          continue;
        }
        const board = boardOf(column.board);
        const phones = [
          soffPhone(l.phone),
          ...list(l.extra_phones).map((p) => soffPhone(rec(p).phone)),
        ]
          .filter((p): p is string => p !== null)
          .filter((p, index, all) => all.indexOf(p) === index);
        const status = (str(l.status) ?? "new").toLowerCase();
        const dayType = list(l.lesson_day_type).map((d) => str(d)?.toLowerCase())[0];
        const temperature = (str(l.temperature) ?? "").toLowerCase();
        const teacherExt = str(l.teacher);
        const courseName = courses.get(`${branch}:${str(l.course) ?? ""}`)?.name;
        const notes = [
          str(l.last_description),
          courseName ? `Kurs: ${courseName}` : null,
          status === "enrolled" ? "Guruhga qo'shilgan" : null,
          status === "test_period" ? "Sinov darsida" : null,
        ].filter(Boolean);
        leads.set(id, {
          ext: id,
          branchExt: branch,
          boardExt: board.ext,
          column: column.name,
          fullName,
          phones,
          source: sourceNames.get(str(l.source) ?? "") ?? null,
          status: status === "rejected" ? "LOST" : status === "new" ? "NEW" : "CONTACTED",
          temperature:
            temperature === "hot"
              ? "HOT"
              : temperature === "warm"
                ? "WARM"
                : temperature === "cold"
                  ? "COLD"
                  : null,
          days: dayType
            ? dayType.startsWith("odd")
              ? "ODD"
              : dayType.startsWith("even")
                ? "EVEN"
                : "OTHER"
            : null,
          lessonTime: time(l.lesson_time),
          teacherExt: teacherExt && staff.has(teacherExt) ? teacherExt : null,
          comment: notes.length ? notes.join(". ") : null,
          archived: l.is_active !== true,
          createdAt: timestamp(l.created_at),
        });
      }
    }
  }
  if (leadsWithoutBoard > 0)
    warn(`${leadsWithoutBoard} leads sit in no known column and were left out`);

  // Finance -------------------------------------------------------------------------
  const finance = new Map<string, SnapFinanceRow>();
  const categoryHome = new Map<string, { branch: string; kind: "EXPENSE" | "INCOME" }>();
  const marketingBranch = new Map<string, string>();
  for (const { branch, data } of mains) {
    const f = rec(data.finance);
    for (const [kind, key] of [
      ["EXPENSE", "budgetExpense"],
      ["INCOME", "budgetIncome"],
    ] as const) {
      for (const month of Object.values(rec(f[key]))) {
        for (const c of list(month)) {
          const id = str(rec(c).id);
          if (id && !categoryHome.has(id)) categoryHome.set(id, { branch, kind });
        }
      }
    }
    for (const m of list(f.marketing)) {
      const id = str(rec(m).id);
      if (id) marketingBranch.set(id, branch);
    }
    for (const detail of Object.values(rec(f.marketingDetail))) {
      const row = rec(Array.isArray(detail) ? detail[0] : detail);
      const id = str(row.id);
      const home = str(row.branch);
      if (id && home && branchSet.has(home)) marketingBranch.set(id, home);
    }
    for (const [type, key] of [
      ["ADVANCE", "prepayments"],
      ["BONUS", "bonus"],
      ["PENALTY", "fines"],
    ] as const) {
      for (const raw of list(f[key])) {
        const row = rec(raw);
        const id = str(row.id);
        const amount = num(row.amount);
        const day = date(row.date) ?? date(row.created_at);
        if (!id || amount === null || !day) continue;
        const ext = `${type}:${id}`;
        if (finance.has(ext)) continue;
        const staffExt = str(row.employee);
        finance.set(ext, {
          ext,
          branchExt: branch,
          type,
          category: null,
          amount: Math.abs(amount),
          date: day,
          comment: str(row.description),
          staffExt: staffExt && staff.has(staffExt) ? staffExt : null,
          method: methodNames.get(str(row.payment_type) ?? "") ?? null,
        });
      }
    }
  }
  let homelessExpenses = 0;
  for (const { data } of mains) {
    for (const [categoryId, value] of Object.entries(rec(rec(data.finance).expenseByCategory))) {
      const categoryName = str(rec(value).category) ?? `Category ${categoryId}`;
      for (const raw of list(value)) {
        const row = rec(raw);
        const id = str(row.id);
        const amount = num(row.amount);
        const day = date(row.date);
        if (!id || amount === null || !day) continue;
        const ext = `ROW:${id}`;
        if (finance.has(ext)) continue;
        const marketing = marketingBranch.get(id);
        const home = categoryHome.get(categoryId);
        if (!marketing && !home) homelessExpenses += 1;
        finance.set(ext, {
          ext,
          branchExt: marketing ?? home?.branch ?? branches[0]!.ext,
          type: marketing ? "MARKETING" : (home?.kind ?? "EXPENSE"),
          category: marketing ? null : categoryName,
          amount: Math.abs(amount),
          date: day,
          comment: str(row.description),
          staffExt: null,
          method: methodNames.get(str(row.payment_type) ?? "") ?? null,
        });
      }
    }
  }
  if (homelessExpenses > 0) {
    warn(
      `${homelessExpenses} expense rows sit in a category of no branch and were put on ${branches[0]!.name}`,
    );
  }

  // Exams ---------------------------------------------------------------------------
  const exams = new Map<string, SnapExam>();
  for (const { branch, data } of mains) {
    for (const raw of list(data.examList)) {
      const e = rec(raw);
      const id = str(e.id);
      const groupExt = str(rec(e.group).id);
      const day = date(e.date);
      if (!id || !day || !groupExt || !groups.has(groupExt) || exams.has(id)) continue;
      const examiner = str(e.examer);
      const room = str(e.room);
      const max = num(e.max_score) ?? 100;
      exams.set(id, {
        ext: id,
        branchExt: groups.get(groupExt)?.branchExt ?? branch,
        groupExt,
        name: str(e.title) ?? "Imtihon",
        date: day,
        startTime: time(e.start_at) ?? "09:00",
        endTime: time(e.end_at) ?? time(e.start_at) ?? "10:00",
        passScore: Math.min(num(e.min_score) ?? 0, max),
        maxScore: max,
        examinerExt: examiner && staff.has(examiner) ? examiner : null,
        roomExt: room && rooms.has(room) ? room : null,
        finished: day < exportedAt,
      });
    }
  }

  const usedCourses = new Set([...groups.values()].map((g) => g.courseExt));
  return {
    format: "soff-snapshot/1",
    exportedAt,
    branches,
    paymentMethods: [...new Set(methodNames.values())],
    leaveReasons: [...leaveReasons],
    leadSources: [...new Set(sourceNames.values())],
    staff: [...staff.values()],
    courses: [...courses.values()].filter((c) => usedCourses.has(c.ext) || !c.ext.includes(":g")),
    rooms: [...rooms.values()],
    groups: [...groups.values()],
    students: [...students.values()],
    memberships,
    payments: [...payments.values()],
    lessons,
    leadBoards: [...leadBoards.values()],
    leads: [...leads.values()],
    finance: [...finance.values()],
    exams: [...exams.values()],
    warnings,
  };
}

/** Counts of a snapshot, per branch where that helps: what a dry run prints first. */
export function summarizeSnapshot(snapshot: SoffSnapshot): Record<string, unknown> {
  const perBranch = snapshot.branches.map((b) => {
    const studentExts = new Set(
      snapshot.students.filter((s) => s.branchExt === b.ext).map((s) => s.ext),
    );
    const mine = snapshot.memberships.filter((m) => studentExts.has(m.studentExt));
    const byStudent = new Map<string, number>();
    for (const m of mine)
      byStudent.set(m.studentExt, (byStudent.get(m.studentExt) ?? 0) + m.balance);
    const owing = [...byStudent.values()].filter((v) => v < -0.5);
    const credit = [...byStudent.values()].filter((v) => v > 0.5);
    const groups = snapshot.groups.filter((g) => g.branchExt === b.ext);
    const groupExts = new Set(groups.map((g) => g.ext));
    const lessons = snapshot.lessons.filter((l) => groupExts.has(l.groupExt));
    const count = (status: string) => mine.filter((m) => m.status === status).length;
    return {
      branch: b.name,
      students: studentExts.size,
      studentsArchived: snapshot.students.filter((s) => s.branchExt === b.ext && s.archived).length,
      parents: snapshot.students
        .filter((s) => s.branchExt === b.ext)
        .reduce((n, s) => n + s.parents.length, 0),
      comments: snapshot.students
        .filter((s) => s.branchExt === b.ext)
        .reduce((n, s) => n + s.comments.length, 0),
      groups: groups.length,
      memberships: mine.length,
      membershipsByStatus: {
        ACTIVE: count("ACTIVE"),
        NEW: count("NEW"),
        FROZEN: count("FROZEN"),
        ARCHIVED: count("ARCHIVED"),
        GRADUATED: count("GRADUATED"),
      },
      payments: snapshot.payments.filter((p) => p.branchExt === b.ext).length,
      lessons: lessons.length,
      attendanceMarks: lessons.reduce((n, l) => n + l.marks.length, 0),
      leads: snapshot.leads.filter((l) => l.branchExt === b.ext).length,
      finance: snapshot.finance.filter((f) => f.branchExt === b.ext).length,
      exams: snapshot.exams.filter((e) => e.branchExt === b.ext).length,
      owing: { students: owing.length, total: Math.round(owing.reduce((a, v) => a + v, 0)) },
      credit: { students: credit.length, total: Math.round(credit.reduce((a, v) => a + v, 0)) },
    };
  });
  return {
    exportedAt: snapshot.exportedAt,
    staff: snapshot.staff.length,
    staffArchived: snapshot.staff.filter((s) => s.archived).length,
    courses: snapshot.courses.length,
    rooms: snapshot.rooms.length,
    perBranch,
    warnings: snapshot.warnings,
  };
}
