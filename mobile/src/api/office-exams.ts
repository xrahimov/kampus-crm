import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { ExamStatus } from "./types";

/*
 * Exams for the office (A-235): the list with its two kinds, an exam's form,
 * its grading sheet and, for a mock exam, who is registered. The same calls
 * the site's Exams page and an exam's own page make.
 */

export const EXAM_TYPES = ["GROUP", "MOCK"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];
export const EXAM_STATUSES = ["NOT_STARTED", "FINISHED"] as const;

export interface Exam {
  id: string;
  branchId: string;
  branchName: string;
  type: ExamType;
  name: string;
  groupId: string | null;
  groupName: string | null;
  /** A mock exam: the groups it is for. */
  groups: Array<{ id: string; name: string }>;
  isRetake: boolean;
  date: string;
  startTime: string;
  endTime: string;
  examinerId: string | null;
  examinerName: string | null;
  roomId: string | null;
  roomName: string | null;
  gradingSystemId: string | null;
  gradingSystemName: string | null;
  passScore: number;
  maxScore: number;
  price: number;
  capacity: number | null;
  status: ExamStatus;
  /** A group exam: the students of the group; a mock exam: who is registered. */
  studentCount: number;
  gradedCount: number;
}

export interface ExamList {
  items: Exam[];
  /** How many of each kind there are under the same filters. */
  counts: Record<ExamType, number>;
}

export interface ExamFilters {
  type: ExamType;
  status: ExamStatus | "ALL";
  groupId: string | null;
  from: string | null;
  to: string | null;
}

export interface ExamOptions {
  groups: Array<{
    id: string;
    name: string;
    branchId: string;
    courseId: string;
    courseName: string;
    startDate: string;
    status: string;
  }>;
  courses: Array<{ id: string; name: string; branchId: string }>;
  rooms: Array<{ id: string; name: string; branchId: string }>;
  gradingSystems: Array<{ id: string; name: string }>;
  examiners: Array<{ id: string; fullName: string }>;
}

/** What the exam form sends; the kind decides which of the fields count. */
export interface ExamInput {
  type: ExamType;
  name: string;
  groupId: string | null;
  isRetake: boolean;
  groupIds: string[];
  price: number;
  capacity: number | null;
  date: string;
  startTime: string;
  endTime: string;
  examinerId: string | null;
  roomId: string | null;
  gradingSystemId: string | null;
  passScore: number;
  maxScore: number;
}

export interface SheetRow {
  studentId: string;
  fullName: string;
  phone: string | null;
  groupName: string | null;
  score: number | null;
  isPresent: boolean;
  comment: string | null;
  /** The grading level the score falls in; null on a custom scale. */
  level: string | null;
  passed: boolean | null;
}

export interface ExamSheet {
  exam: Exam;
  rows: SheetRow[];
}

export interface SheetMark {
  studentId: string;
  score: number | null;
  isPresent: boolean;
  comment: string | null;
}

export interface ExamCandidate {
  id: string;
  fullName: string;
  phone: string | null;
  groupName: string;
}

export const examKeys = {
  all: ["exams"] as const,
  list: (filters: ExamFilters) => ["exams", "list", filters] as const,
  options: ["exams", "options"] as const,
  sheet: (id: string) => ["exams", "sheet", id] as const,
  // Not under "exams": a search is not asked again because an exam changed.
  candidates: (id: string, q: string) => ["exam-candidates", id, q] as const,
};

export function useExamList(filters: ExamFilters) {
  return useQuery({
    queryKey: examKeys.list(filters),
    queryFn: ({ signal }) => {
      const parts = [`type=${filters.type}`];
      if (filters.status !== "ALL") parts.push(`status=${filters.status}`);
      if (filters.groupId) parts.push(`groupId=${filters.groupId}`);
      if (filters.from) parts.push(`from=${filters.from}`);
      if (filters.to) parts.push(`to=${filters.to}`);
      return api<ExamList>(`/exams?${parts.join("&")}`, { signal });
    },
    placeholderData: (previous) => previous,
  });
}

/** The groups, courses, rooms, grading systems and examiners an exam form picks from. */
export function useExamOptions(enabled = true) {
  return useQuery({
    queryKey: examKeys.options,
    queryFn: ({ signal }) => api<ExamOptions>("/exams/options", { signal }),
    enabled,
  });
}

/** One exam with the students to grade. */
export function useExamSheet(id: string) {
  return useQuery({
    queryKey: examKeys.sheet(id),
    queryFn: ({ signal }) => api<ExamSheet>(`/exams/${id}/results`, { signal }),
  });
}

/** After an exam changed: every exam list, its own page, and the exams of a group. */
function useExamsChanged() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: examKeys.all }),
      client.invalidateQueries({ queryKey: ["group"] }),
      client.invalidateQueries({ queryKey: ["exam"] }),
    ]);
}

export function useSaveExam(id: string | null) {
  const changed = useExamsChanged();
  return useMutation({
    mutationFn: (input: ExamInput) =>
      id
        ? api<Exam>(`/exams/${id}`, { method: "PATCH", body: input })
        : api<Exam>("/exams", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useDeleteExam() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/exams/${id}`, { method: "DELETE" }),
    // Everything about exams is asked again, except the page of the one that is gone.
    onSuccess: (_nothing, id) =>
      Promise.all([
        client.invalidateQueries({
          queryKey: examKeys.all,
          predicate: (query) => !(query.queryKey[1] === "sheet" && query.queryKey[2] === id),
        }),
        client.invalidateQueries({ queryKey: ["group"] }),
        client.invalidateQueries({ queryKey: ["exam"] }),
      ]),
  });
}

/** Finishes an exam, or opens a finished one again. */
export function useExamStatus() {
  const changed = useExamsChanged();
  return useMutation({
    mutationFn: ({ id, finished }: { id: string; finished: boolean }) =>
      api<Exam>(`/exams/${id}/${finished ? "finish" : "reopen"}`, { method: "POST" }),
    onSuccess: changed,
  });
}

export function useSaveMarks(id: string) {
  const changed = useExamsChanged();
  return useMutation({
    mutationFn: (results: SheetMark[]) =>
      api<SheetRow[]>(`/exams/${id}/results`, { method: "PUT", body: { results } }),
    onSuccess: changed,
  });
}

/** Students who may still be registered for a mock exam, by name or phone. */
export function useExamCandidates(id: string, q: string) {
  return useQuery({
    queryKey: examKeys.candidates(id, q),
    queryFn: ({ signal }) =>
      api<ExamCandidate[]>(`/exams/${id}/candidates?q=${encodeURIComponent(q)}`, { signal }),
    enabled: q.length >= 2,
    gcTime: 0,
  });
}

export function useRegisterForExam(id: string) {
  const changed = useExamsChanged();
  return useMutation({
    mutationFn: (studentId: string) =>
      api<SheetRow[]>(`/exams/${id}/registrations`, { method: "POST", body: { studentId } }),
    onSuccess: changed,
  });
}

export function useUnregisterFromExam(id: string) {
  const changed = useExamsChanged();
  return useMutation({
    mutationFn: (studentId: string) =>
      api<void>(`/exams/${id}/registrations?studentId=${studentId}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}
