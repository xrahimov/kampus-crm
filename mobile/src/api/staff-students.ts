import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  Page,
  StudentComment,
  StudentDetail,
  StudentProgress,
  StudentRow,
  StudentTests,
} from "./types";

/*
 * Students on the teacher's side, in the app (A-220): the list a teacher may
 * see (the server keeps it to their own groups) and one student's page. The
 * same calls the site's Students pages make, behind the staff sign-in.
 */

export const studentKeys = {
  list: (q: string, filters: StudentFilters = {}) => ["students", "list", q, filters] as const,
  one: (id: string) => ["students", id] as const,
  progress: (id: string) => ["students", id, "progress"] as const,
  tests: (id: string) => ["students", id, "tests"] as const,
  comments: (id: string) => ["students", id, "comments"] as const,
};

/** How many students one request brings. */
export const STUDENTS_PAGE = 30;

/** What the office narrows the list by (A-231), the site's filters over the list. */
export interface StudentFilters {
  paymentStatus?: "DUE_SOON" | "DEBTOR" | "NOT_DEBTOR" | "OVERPAID";
  groupStatus?: "ACTIVE" | "NEW" | "FROZEN" | "LEFT_AFTER_TRIAL" | "NO_GROUP";
  archived?: boolean;
  courseId?: string;
  groupId?: string;
  teacherId?: string;
}

export const PAYMENT_STATUS_FILTERS = ["DUE_SOON", "DEBTOR", "NOT_DEBTOR", "OVERPAID"] as const;
export const GROUP_STATUS_FILTERS = [
  "ACTIVE",
  "NEW",
  "FROZEN",
  "LEFT_AFTER_TRIAL",
  "NO_GROUP",
] as const;

/** How many filters are set: the number on the Filters button. */
export function countFilters(filters: StudentFilters): number {
  return Object.values(filters).filter((value) => value !== undefined && value !== false).length;
}

function filterQuery(filters: StudentFilters): string {
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => `&${key}=${encodeURIComponent(String(value))}`)
    .join("");
}

/** The students by name, a page at a time; `q` looks in names and phone numbers. */
export function useStudents(q: string, filters: StudentFilters = {}) {
  return useInfiniteQuery({
    queryKey: studentKeys.list(q, filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<Page<StudentRow>>(
        `/students?sort=fullName:asc&pageSize=${STUDENTS_PAGE}&page=${pageParam}${
          q ? `&q=${encodeURIComponent(q)}` : ""
        }${filterQuery(filters)}`,
        { signal },
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    // The list stays while the next search loads.
    placeholderData: (old) => old,
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: studentKeys.one(id),
    queryFn: ({ signal }) => api<StudentDetail>(`/students/${id}`, { signal }),
  });
}

export function useStudentProgress(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentKeys.progress(id),
    queryFn: ({ signal }) => api<StudentProgress>(`/students/${id}/progress`, { signal }),
    enabled,
  });
}

export function useStudentTests(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentKeys.tests(id),
    queryFn: ({ signal }) => api<StudentTests>(`/students/${id}/test-results`, { signal }),
    enabled,
  });
}

export function useStudentComments(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentKeys.comments(id),
    queryFn: ({ signal }) => api<StudentComment[]>(`/students/${id}/comments`, { signal }),
    enabled,
  });
}

/** A note about the student that belongs to no one group. */
export function addCommentOnStudent(id: string, text: string): Promise<StudentComment> {
  return api<StudentComment>(`/students/${id}/comments`, { method: "POST", body: { text } });
}
