import type { NextRequest } from "next/server";

import { AppError } from "@/server/errors/app-error";
import { parseListQuery, type ParsedList } from "@/server/http/list-query";

import type { Actor } from "@/server/rbac/authorize";
import { getMonthGrid } from "@/server/services/groups/lessons.service";
import { listMembers } from "@/server/services/groups/memberships.service";
import type { GroupDto } from "@/server/services/groups/groups.service";
import type { LeadDto } from "@/server/services/leads/leads.service";
import type { PayrollRunDto } from "@/server/services/finance/payroll.service";
import type { StaffDto } from "@/server/services/staff/staff.service";
import type { TeacherRowDto } from "@/server/services/staff/teachers.service";
import type { PaymentDto } from "@/server/services/students/payments.service";
import type { StudentRowDto } from "@/server/services/students/students.service";

import { exportTranslator, type Translator } from "./locale";
import {
  buildWorkbook,
  readFirstSheet,
  XLSX_TYPE,
  xlsxResponse,
  type ExcelCell,
  type ExcelColumn,
} from "./workbook";

/*
 * The EXCEL buttons of the reference (EXP §§2, 4, 5, 6, 8, 9, 10; A-24). Each
 * function flattens DTOs the list services already produce, so an export
 * shows exactly what the screen shows, with the same permissions and scope.
 */

type Row = Record<string, ExcelCell>;

export async function sendWorkbook(
  request: NextRequest,
  file: string,
  sheet: string,
  columns: Array<ExcelColumn<Row>>,
  rows: Row[],
): Promise<Response> {
  return xlsxResponse(await buildWorkbook(sheet, columns, rows), `${file}.xlsx`);
}

/** Header labels from `excel.columns.*`; a column key doubles as the label key. */
export function columns(t: Translator, keys: string[], widths: Record<string, number> = {}) {
  return keys.map((key) => ({
    key,
    header: t(`excel.columns.${key}`),
    width: widths[key],
  })) as Array<ExcelColumn<Row>>;
}

export { exportTranslator };

const list = (xs: Array<string | null | undefined>) => xs.filter(Boolean).join(", ");

export function studentRows(t: Translator, students: StudentRowDto[]): Row[] {
  return students.map((s, i) => ({
    index: i + 1,
    fullName: s.fullName,
    phone: s.phone,
    groups: list(s.groups.map((g) => g.groupName)),
    courses: list([...new Set(s.groups.map((g) => g.courseName))]),
    teachers: list([...new Set(s.groups.map((g) => g.teacherName))]),
    membershipStatus: list(s.groups.map((g) => t(`groups.memberStatuses.${g.status}`))),
    balance: s.balance,
    nextPaymentDate: s.nextPaymentDate,
    gradeAverage: s.gradeAverage,
    createdAt: s.createdAt.slice(0, 10),
  }));
}
export const STUDENT_COLUMNS = [
  "index",
  "fullName",
  "phone",
  "groups",
  "courses",
  "teachers",
  "membershipStatus",
  "balance",
  "nextPaymentDate",
  "gradeAverage",
  "createdAt",
];

export function groupRows(t: Translator, groups: GroupDto[]): Row[] {
  return groups.map((g, i) => ({
    index: i + 1,
    name: g.name,
    course: g.courseName,
    teachers: list(g.teachers.map((x) => x.fullName)),
    pattern: t(`groups.patterns.${g.weekdayPattern}`),
    time: list([...new Set(g.slots.map((s) => `${s.startTime}–${s.endTime}`))]),
    room: list([...new Set(g.slots.map((s) => s.roomName))]),
    students: g.activeStudents,
    price: g.coursePrice,
    startDate: g.startDate,
    endDate: g.endDate,
    status: t(`groups.statuses.${g.status}`),
    branch: g.branchName,
  }));
}
export const GROUP_COLUMNS = [
  "index",
  "name",
  "course",
  "teachers",
  "pattern",
  "time",
  "room",
  "students",
  "price",
  "startDate",
  "endDate",
  "status",
  "branch",
];

export async function memberRows(
  actor: Actor,
  t: Translator,
  groupId: string,
  archived: boolean,
): Promise<Row[]> {
  const members = await listMembers(actor, groupId, { archived });
  return members.map((m, i) => ({
    index: i + 1,
    fullName: m.fullName,
    phone: m.phone,
    membershipStatus: t(`groups.memberStatuses.${m.status}`),
    joinedAt: m.joinedAt,
    leftAt: m.leftAt,
    customPrice: m.customPrice,
    balance: m.balance,
    note: m.note,
  }));
}
export const MEMBER_COLUMNS = [
  "index",
  "fullName",
  "phone",
  "membershipStatus",
  "joinedAt",
  "leftAt",
  "customPrice",
  "balance",
  "note",
];

/** DAVOMAT / BAHO grid of one month: a student per row, a lesson date per column. */
export async function gridExport(
  actor: Actor,
  t: Translator,
  groupId: string,
  month: string,
  kind: "attendance" | "grades",
): Promise<{ columns: Array<ExcelColumn<Row>>; rows: Row[] }> {
  const grid = await getMonthGrid(actor, groupId, month);
  const marks: Record<string, string> = {
    PRESENT: t("excel.marks.present"),
    ABSENT: t("excel.marks.absent"),
    EXCUSED: t("excel.marks.excused"),
    NOT_MARKED: "",
  };
  const cols: Array<ExcelColumn<Row>> = [
    { key: "index", header: t("excel.columns.index"), width: 6 },
    { key: "fullName", header: t("excel.columns.fullName"), width: 28 },
    { key: "membershipStatus", header: t("excel.columns.membershipStatus"), width: 14 },
    ...grid.lessons.map((l) => ({ key: `l:${l.id}`, header: l.date.slice(5), width: 8 })),
    ...(kind === "grades"
      ? [{ key: "average", header: t("excel.columns.gradeAverage"), width: 10 }]
      : [
          { key: "present", header: t("excel.marks.present"), width: 8 },
          { key: "absent", header: t("excel.marks.absent"), width: 8 },
        ]),
  ];
  const rows: Row[] = grid.members.map((m, i) => {
    const row: Row = {
      index: i + 1,
      fullName: m.fullName,
      membershipStatus: t(`groups.memberStatuses.${m.status}`),
    };
    let present = 0;
    let absent = 0;
    for (const l of grid.lessons) {
      if (kind === "attendance") {
        const status = l.attendance[m.membershipId]?.status ?? "NOT_MARKED";
        row[`l:${l.id}`] = marks[status] ?? "";
        if (status === "PRESENT") present += 1;
        if (status === "ABSENT") absent += 1;
      } else {
        row[`l:${l.id}`] = l.grades[m.membershipId]?.score ?? null;
      }
    }
    if (kind === "grades") row.average = m.average;
    else {
      row.present = present;
      row.absent = absent;
    }
    return row;
  });
  return { columns: cols, rows };
}

export function leadRows(t: Translator, leads: Array<LeadDto & { columnName: string }>): Row[] {
  return leads.map((l, i) => ({
    index: i + 1,
    column: l.columnName,
    fullName: l.fullName,
    phone: l.phones.join(", "),
    source: l.sourceName,
    teacher: l.teacherName,
    days: l.days ? t(`leads.days.${l.days}`) : null,
    time: l.lessonTime,
    status: t(`leads.statuses.${l.status}`),
    temperature: l.temperature ? t(`leads.temperatures.${l.temperature}`) : null,
    comment: l.comment,
    createdAt: l.createdAt.slice(0, 10),
    convertedAt: l.convertedAt ? l.convertedAt.slice(0, 10) : null,
  }));
}
export const LEAD_COLUMNS = [
  "index",
  "column",
  "fullName",
  "phone",
  "source",
  "teacher",
  "days",
  "time",
  "status",
  "temperature",
  "comment",
  "createdAt",
  "convertedAt",
];

export function staffRows(t: Translator, staff: StaffDto[]): Row[] {
  return staff.map((s, i) => ({
    index: i + 1,
    fullName: s.fullName,
    phone: s.phone,
    roles: list(s.roles.map((r) => r.name)),
    branch: list(s.branches.map((b) => b.name)),
    hireDate: s.hireDate,
    fixedSalary: s.fixedSalary,
    percentShare: s.percentShare,
    status: s.isArchived ? t("common.archived") : t("common.active"),
  }));
}
export const STAFF_COLUMNS = [
  "index",
  "fullName",
  "phone",
  "roles",
  "branch",
  "hireDate",
  "fixedSalary",
  "percentShare",
  "status",
];

export function teacherRows(t: Translator, teachers: TeacherRowDto[]): Row[] {
  return teachers.map((s, i) => ({
    index: i + 1,
    fullName: s.fullName,
    phone: s.phone,
    groups: list(s.groupNames),
    branch: list(s.branches.map((b) => b.name)),
    hireDate: s.hireDate,
    status: s.isArchived ? t("common.archived") : t("common.active"),
  }));
}
export const TEACHER_COLUMNS = [
  "index",
  "fullName",
  "phone",
  "groups",
  "branch",
  "hireDate",
  "status",
];

export function paymentRows(payments: PaymentDto[]): Row[] {
  return payments.map((p, i) => ({
    index: i + 1,
    paidAt: p.paidAt,
    effectiveMonth: p.effectiveMonth.slice(0, 7),
    fullName: p.studentName,
    group: p.groupName,
    amount: p.amount,
    refunded: p.refunded,
    bonus: p.bonus,
    method: p.methodName,
    receivedBy: p.receivedByName,
    comment: p.comment,
    createdAt: p.createdAt.slice(0, 16).replace("T", " "),
  }));
}
export const PAYMENT_COLUMNS = [
  "index",
  "paidAt",
  "effectiveMonth",
  "fullName",
  "group",
  "amount",
  "refunded",
  "bonus",
  "method",
  "receivedBy",
  "comment",
  "createdAt",
];

export function payrollRows(t: Translator, run: PayrollRunDto): Row[] {
  return run.lines.map((l, i) => ({
    index: i + 1,
    fullName: l.fullName,
    roles: l.roleName,
    fixed: l.fixed,
    percent: l.percent,
    perLesson: l.perLesson,
    perStudent: l.perStudent,
    bonus: l.bonus,
    penalty: l.penalty,
    advance: l.advance,
    net: l.net,
    status: t(`finance.payroll.lineStatuses.${l.status}`),
  }));
}
export const PAYROLL_COLUMNS = [
  "index",
  "fullName",
  "roles",
  "fixed",
  "percent",
  "perLesson",
  "perStudent",
  "bonus",
  "penalty",
  "advance",
  "net",
  "status",
];

/** The list query of the page the button sits on, widened to one page of everything. */
export function wholeList<F extends string>(
  params: URLSearchParams,
  options: { sortable: readonly F[]; defaultSort: { field: F; direction: "asc" | "desc" } },
): ParsedList<F> {
  const copy = new URLSearchParams(params);
  copy.delete("page");
  copy.delete("pageSize");
  copy.delete("locale");
  const parsed = parseListQuery(copy, options);
  return { ...parsed, page: 1, pageSize: EXPORT_LIMIT, skip: 0, take: EXPORT_LIMIT };
}
export const EXPORT_LIMIT = 5000;

/** The import template: translated header plus one example row. */
export async function templateResponse(
  t: Translator,
  file: string,
  keys: readonly string[],
  example: Row,
): Promise<Response> {
  const cols = columns(t, [...keys]);
  return xlsxResponse(
    await buildWorkbook(t("excel.templateSheet"), cols, [example]),
    `${file}.xlsx`,
  );
}

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

const CSV_TYPES = ["text/csv", "application/csv", "text/plain"];

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === delimiter) count += 1;
  }
  return count;
}

/**
 * A CSV export as rows of strings (A-110): comma, semicolon or tab separated,
 * whichever the first line uses most; quotes and doubled quotes honoured; a BOM
 * dropped. Other systems export CSV, and nobody should have to open it in Excel
 * first just to save it again.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const [best] = [",", ";", "\t"]
    .map((d) => [d, countOutsideQuotes(firstLine, d)] as const)
    .sort((a, b) => b[1] - a[1]);
  const delimiter = best && best[1] > 0 ? best[0] : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** UTF-8 when it is valid UTF-8, else the Windows-1251 of older Russian-locale exports. */
function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}

/** The uploaded spreadsheet (.xlsx) or CSV of an import form, as rows of strings. */
export async function sheetFromForm(form: FormData | null): Promise<string[][]> {
  const file = form?.get("file");
  if (!(file instanceof File)) throw AppError.validation({ file: ["validation.fileRequired"] });
  if (file.size > IMPORT_MAX_BYTES) {
    throw AppError.validation({ file: ["validation.importFileSize"] });
  }
  const isCsv =
    /\.csv$/i.test(file.name) || (!/\.xlsx$/i.test(file.name) && CSV_TYPES.includes(file.type));
  if (!isCsv && !/\.xlsx$/i.test(file.name) && file.type !== XLSX_TYPE) {
    throw AppError.validation({ file: ["validation.importFileType"] });
  }
  try {
    const bytes = await file.arrayBuffer();
    return isCsv ? parseCsv(decodeText(bytes)) : await readFirstSheet(bytes);
  } catch {
    throw AppError.validation({ file: ["validation.importFileType"] });
  }
}
