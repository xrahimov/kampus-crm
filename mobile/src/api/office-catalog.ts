import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { keys } from "./hooks";
import type { GroupStatus, Page } from "./types";

/*
 * Teachers, courses and rooms for the office (A-234): what a centre sets up
 * once and then picks from in every group. The same calls the site's Teachers
 * page and its Settings → Courses and Rooms pages make.
 */

export const TEACHER_KINDS = ["teachers", "support"] as const;
export type TeacherKind = (typeof TEACHER_KINDS)[number];
/** The role a new person gets: fixed by the list they are added from, as on the site. */
export const TEACHER_KIND_ROLE: Record<TeacherKind, string> = {
  teachers: "TEACHER",
  support: "SUPPORT_TEACHER",
};

export const SALARY_METHODS = ["PERCENT", "MONTHLY", "PER_LESSON", "PER_STUDENT"] as const;
export type SalaryMethod = (typeof SALARY_METHODS)[number];
export type SalaryField = "percentShare" | "fixedSalary" | "perLessonFee" | "perStudentFee";
/** The amount that belongs to each way of paying a teacher. */
export const SALARY_AMOUNT_FIELD: Record<SalaryMethod, SalaryField> = {
  PERCENT: "percentShare",
  MONTHLY: "fixedSalary",
  PER_LESSON: "perLessonFee",
  PER_STUDENT: "perStudentFee",
};
export const GENDERS = ["MALE", "FEMALE"] as const;
export type Gender = (typeof GENDERS)[number];

export interface Staff {
  id: string;
  fullName: string;
  phone: string;
  gender: Gender;
  birthDate: string | null;
  hireDate: string | null;
  photoUrl: string | null;
  salaryMethod: SalaryMethod | null;
  fixedSalary: number | null;
  percentShare: number | null;
  perLessonFee: number | null;
  perStudentFee: number | null;
  isArchived: boolean;
  createdAt: string;
  roles: Array<{ code: string; name: string }>;
  branches: Array<{ id: string; name: string }>;
  signInCode: "OFF" | "TELEGRAM";
  /** The bot knows the person's chat: a sign-in code can reach them. */
  telegramLinked: boolean;
  mustChangePassword: boolean;
}

export interface TeacherRow extends Staff {
  /** Names of the groups the person teaches or supports. */
  groupNames: string[];
}

export interface TeacherGroup {
  id: string;
  name: string;
  courseName: string;
  status: GroupStatus;
  role: "MAIN" | "ASSISTANT" | "CO_TEACHER" | "SUPPORT";
  activeStudents: number;
  startDate: string;
  endDate: string;
}

export interface TeacherDetail extends Staff {
  stats: { courses: number; activeGroups: number; activeStudents: number };
  groups: TeacherGroup[];
}

/** What the teacher form sends. No password: a first sign-in is with a code from Telegram. */
export interface TeacherInput {
  fullName: string;
  phone: string;
  gender: Gender;
  birthDate: string | null;
  hireDate: string | null;
  /** The address `POST /uploads` answered with; null takes the photo off. */
  photoUrl: string | null;
  branchIds: string[];
  salaryMethod: SalaryMethod;
  fixedSalary: number | null;
  percentShare: number | null;
  perLessonFee: number | null;
  perStudentFee: number | null;
  /** Only when changing someone the bot can reach. */
  signInCode?: "OFF" | "TELEGRAM";
}

/** One stretch of a weekday (1 = Monday) open for 1:1 booking. */
export interface HoursWindow {
  weekday: number;
  startTime: string;
  endTime: string;
}
/** As on the server: three windows a day at most. */
export const HOURS_MAX = 21;

export const GRADE_PARTS = ["lessons", "homework", "exercises", "tests", "exams"] as const;
export type GradePart = (typeof GRADE_PARTS)[number];
export type GradeWeights = Record<GradePart, number>;
export const DEFAULT_GRADE_WEIGHTS: GradeWeights = {
  lessons: 30,
  homework: 30,
  exercises: 0,
  tests: 20,
  exams: 20,
};

export interface Course {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  description: string | null;
  price: number;
  durationMonths: number;
  gradingSystemId: string | null;
  gradingSystemName: string | null;
  color: string | null;
  /** Null means the centre's usual weights. */
  gradeWeights: GradeWeights | null;
  isArchived: boolean;
}

export interface CourseInput {
  branchId: string;
  name: string;
  /** Text, never null: the server reads an empty text as "no notes". */
  description: string;
  price: number;
  durationMonths: number;
  gradingSystemId: string | null;
  color: string | null;
  gradeWeights: GradeWeights;
}

export interface CourseTopic {
  id: string;
  sortOrder: number;
  title: string;
  note: string | null;
}

export interface Room {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  capacity: number;
}

export interface RoomInput {
  branchId: string;
  name: string;
  capacity: number;
}

export interface GradingSystem {
  id: string;
  name: string;
}

export const catalogKeys = {
  teachers: ["teachers"] as const,
  teacherList: (kind: TeacherKind, archived: boolean, q: string) =>
    ["teachers", "list", kind, archived, q] as const,
  teacher: (id: string) => ["teachers", "one", id] as const,
  hours: (userId: string) => ["teachers", "hours", userId] as const,
  courses: ["courses"] as const,
  courseList: (archived: boolean) => ["courses", "list", archived] as const,
  syllabus: (courseId: string) => ["courses", "syllabus", courseId] as const,
  rooms: ["rooms"] as const,
  gradingSystems: ["grading-systems"] as const,
};

export const TEACHERS_PAGE = 30;

export function useTeacherList(kind: TeacherKind, archived: boolean, q: string) {
  return useInfiniteQuery({
    queryKey: catalogKeys.teacherList(kind, archived, q),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const parts = [
        `tab=${kind}`,
        "sort=fullName:asc",
        `pageSize=${TEACHERS_PAGE}`,
        `page=${pageParam}`,
      ];
      if (archived) parts.push("archived=true");
      if (q) parts.push(`q=${encodeURIComponent(q)}`);
      return api<Page<TeacherRow>>(`/teachers?${parts.join("&")}`, { signal });
    },
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

export function useTeacher(id: string) {
  return useQuery({
    queryKey: catalogKeys.teacher(id),
    queryFn: ({ signal }) => api<TeacherDetail>(`/teachers/${id}`, { signal }),
  });
}

/** After a teacher changed: the lists, the person, and the choices a group form offers. */
function useTeachersChanged() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: catalogKeys.teachers }),
      client.invalidateQueries({ queryKey: keys.groups }),
    ]);
}

export function useSaveTeacher(kind: TeacherKind, id: string | null) {
  const changed = useTeachersChanged();
  return useMutation({
    mutationFn: (input: TeacherInput) =>
      id
        ? api<Staff>(`/teachers/${id}`, { method: "PATCH", body: input })
        : api<Staff>("/teachers", {
            method: "POST",
            body: { ...input, roleCodes: [TEACHER_KIND_ROLE[kind]] },
          }),
    onSuccess: changed,
  });
}

export function useArchiveTeacher() {
  const changed = useTeachersChanged();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/teachers/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

/** Ends every sign-in of the person, on every device. */
export function useSignOutEverywhere(id: string) {
  return useMutation({
    mutationFn: () => api<{ revoked: number }>(`/teachers/${id}/sign-out-all`, { method: "POST" }),
  });
}

export function useHours(userId: string, enabled = true) {
  return useQuery({
    queryKey: catalogKeys.hours(userId),
    queryFn: ({ signal }) => api<HoursWindow[]>(`/teachers/${userId}/availability`, { signal }),
    enabled,
  });
}

export function useSaveHours(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (windows: HoursWindow[]) =>
      api<HoursWindow[]>(`/teachers/${userId}/availability`, { method: "PUT", body: { windows } }),
    onSuccess: (saved) => client.setQueryData(catalogKeys.hours(userId), saved),
  });
}

/** Every course of the centre the person may see; a centre has a handful, so one page. */
export function useCourses(archived: boolean) {
  return useQuery({
    queryKey: catalogKeys.courseList(archived),
    queryFn: ({ signal }) =>
      api<Page<Course>>(`/courses?sort=name:asc&pageSize=100${archived ? "&archived=true" : ""}`, {
        signal,
      }),
  });
}

/** After a course or a room changed: its list and the choices a group form offers. */
function useCatalogChanged(key: readonly string[]) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: keys.groups }),
    ]);
}

export function useSaveCourse(id: string | null) {
  const changed = useCatalogChanged(catalogKeys.courses);
  return useMutation({
    mutationFn: (input: CourseInput) => {
      if (!id) return api<Course>("/courses", { method: "POST", body: input });
      const { branchId: _branchId, ...rest } = input;
      return api<Course>(`/courses/${id}`, { method: "PATCH", body: rest });
    },
    onSuccess: changed,
  });
}

export function useArchiveCourse() {
  const changed = useCatalogChanged(catalogKeys.courses);
  return useMutation({
    mutationFn: (id: string) => api<void>(`/courses/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

export function useSyllabus(courseId: string | null) {
  return useQuery({
    queryKey: catalogKeys.syllabus(courseId ?? ""),
    queryFn: ({ signal }) => api<CourseTopic[]>(`/courses/${courseId}/syllabus`, { signal }),
    enabled: courseId !== null,
    // The sheet fills its text from this once: always the server's latest when it opens.
    gcTime: 0,
  });
}

export function useSaveSyllabus(courseId: string) {
  return useMutation({
    mutationFn: (titles: string[]) =>
      api<CourseTopic[]>(`/courses/${courseId}/syllabus`, {
        method: "PUT",
        body: { topics: titles.map((title) => ({ title })) },
      }),
  });
}

export function useRooms() {
  return useQuery({
    queryKey: catalogKeys.rooms,
    queryFn: ({ signal }) => api<Page<Room>>("/rooms?sort=name:asc&pageSize=100", { signal }),
  });
}

export function useSaveRoom(id: string | null) {
  const changed = useCatalogChanged(catalogKeys.rooms);
  return useMutation({
    mutationFn: (input: RoomInput) => {
      if (!id) return api<Room>("/rooms", { method: "POST", body: input });
      const { branchId: _branchId, ...rest } = input;
      return api<Room>(`/rooms/${id}`, { method: "PATCH", body: rest });
    },
    onSuccess: changed,
  });
}

export function useDeleteRoom() {
  const changed = useCatalogChanged(catalogKeys.rooms);
  return useMutation({
    mutationFn: (id: string) => api<void>(`/rooms/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

export function useGradingSystems(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.gradingSystems,
    queryFn: ({ signal }) => api<{ items: GradingSystem[] }>("/grading-systems", { signal }),
    enabled,
  });
}
