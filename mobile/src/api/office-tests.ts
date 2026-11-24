import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Page, TestAttempt, TestStatus } from "./types";

/*
 * Tests and the question bank for the office (A-250): the site's Settings →
 * Tests with a test's own page. The calls those pages make.
 */

export const TEST_STATUSES: TestStatus[] = ["DRAFT", "ACTIVE", "CLOSED"];
/** A question has two to six answers to choose from (the site's MIN_OPTIONS, MAX_OPTIONS). */
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const QUESTION_PAGE = 20;

export interface OfficeTest {
  id: string;
  name: string;
  subject: string;
  timeLimitMinutes: number | null;
  passPercent: number;
  /** "2026-12-01", or null when the test has no last day. */
  deadline: string | null;
  status: TestStatus;
  groups: Array<{ id: string; name: string }>;
  questionCount: number;
  totalPoints: number;
  attemptCount: number;
  /** Average percent over all submissions; null without any. */
  accuracy: number | null;
  createdAt: string;
}

export interface TestQuestion {
  questionId: string;
  subject: string;
  topic: string;
  text: string;
  options: string[];
  correctIndex: number;
  points: number;
}

export interface TestCandidate {
  studentId: string;
  fullName: string;
  groupId: string;
  groupName: string;
}

/** One test with its questions, everyone's submissions and who may still hand one in. */
export interface OfficeTestDetail extends OfficeTest {
  questions: TestQuestion[];
  attempts: TestAttempt[];
  candidates: TestCandidate[];
}

export interface TestList {
  items: OfficeTest[];
  kpis: { total: number; active: number; attempts: number; accuracy: number | null };
}

export interface TestFilters {
  status: TestStatus | null;
  subject: string | null;
  /** Newest first. */
  recent: boolean;
}

/** What the test form chooses from. */
export interface TestOptions {
  groups: Array<{ id: string; name: string; branchId: string }>;
  questions: Array<{ id: string; subject: string; topic: string; text: string }>;
  subjects: string[];
}

export interface TestInput {
  name: string;
  subject: string;
  timeLimitMinutes: number | null;
  passPercent: number;
  deadline: string | null;
  status: TestStatus;
  groupIds: string[];
  questions: Array<{ questionId: string; points: number }>;
}

export interface AttemptInput {
  studentId: string;
  groupId: string;
  /** The answer chosen for each question, by the question's id; a question left out is unanswered. */
  answers: Record<string, number>;
  durationSeconds: number | null;
}

export interface Question {
  id: string;
  subject: string;
  topic: string;
  text: string;
  options: string[];
  correctIndex: number;
  usedInTests: number;
  createdAt: string;
}

export interface QuestionInput {
  subject: string;
  topic: string;
  text: string;
  options: string[];
  correctIndex: number;
}

export interface QuestionFilters {
  q: string;
  subject: string | null;
  topic: string | null;
}

export interface QuestionBankOptions {
  subjects: string[];
  topics: Array<{ subject: string; topic: string }>;
}

/*
 * Everything sits under "office-tests": a saved question changes the bank, the
 * form's choices and the tests that use it, so one change asks for all of it anew.
 */
const ROOT = "office-tests";
export const officeTestKeys = {
  all: [ROOT] as const,
  list: (filters: TestFilters) => [ROOT, "list", filters] as const,
  one: (id: string) => [ROOT, "one", id] as const,
  options: [ROOT, "options"] as const,
  bank: (filters: QuestionFilters) => [ROOT, "bank", filters] as const,
  bankOptions: [ROOT, "bank-options"] as const,
};

function useTestsChanged() {
  const client = useQueryClient();
  return () => {
    // A group's page lists its tests, and opens their results, too.
    void client.invalidateQueries({ queryKey: ["test"] });
    void client.invalidateQueries({
      predicate: (query) => query.queryKey[0] === "group" && query.queryKey[2] === "tests",
    });
    return client.invalidateQueries({ queryKey: officeTestKeys.all });
  };
}

export function useTests(filters: TestFilters) {
  const query = [
    filters.status ? `status=${filters.status}` : null,
    filters.subject ? `subject=${encodeURIComponent(filters.subject)}` : null,
    filters.recent ? "recent=1" : null,
  ]
    .filter(Boolean)
    .join("&");
  return useQuery({
    queryKey: officeTestKeys.list(filters),
    queryFn: ({ signal }) => api<TestList>(`/tests${query ? `?${query}` : ""}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

export function useTestOptions(enabled = true) {
  return useQuery({
    queryKey: officeTestKeys.options,
    queryFn: ({ signal }) => api<TestOptions>("/tests/options", { signal }),
    enabled,
  });
}

export function useOfficeTest(id: string) {
  return useQuery({
    queryKey: officeTestKeys.one(id),
    queryFn: ({ signal }) => api<OfficeTestDetail>(`/tests/${id}`, { signal }),
  });
}

/** Creates a test (no id) or changes one. */
export function useSaveTest() {
  const changed = useTestsChanged();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: TestInput }) =>
      id
        ? api<OfficeTest>(`/tests/${id}`, { method: "PATCH", body: input })
        : api<OfficeTest>("/tests", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useDeleteTest() {
  const changed = useTestsChanged();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tests/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

/** Draft to active to closed, and open again. */
export function useTestStatus(id: string) {
  const changed = useTestsChanged();
  return useMutation({
    mutationFn: (status: TestStatus) =>
      api<OfficeTest>(`/tests/${id}/status`, { method: "POST", body: { status } }),
    onSuccess: changed,
  });
}

/** A student's answers, entered by staff; the server scores them. */
export function useRecordAttempt(id: string) {
  const changed = useTestsChanged();
  return useMutation({
    mutationFn: (input: AttemptInput) =>
      api<TestAttempt>(`/tests/${id}/attempts`, { method: "POST", body: input }),
    onSuccess: changed,
  });
}

/** The question bank, a page at a time; the rows on screen stay while other filters are asked for. */
export function useQuestions(filters: QuestionFilters) {
  return useInfiniteQuery({
    queryKey: officeTestKeys.bank(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const parts = [`sort=createdAt:desc`, `pageSize=${QUESTION_PAGE}`, `page=${pageParam}`];
      if (filters.q) parts.push(`q=${encodeURIComponent(filters.q)}`);
      if (filters.subject) parts.push(`subject=${encodeURIComponent(filters.subject)}`);
      if (filters.topic) parts.push(`topic=${encodeURIComponent(filters.topic)}`);
      return api<Page<Question>>(`/question-bank?${parts.join("&")}`, { signal });
    },
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

export function useQuestionBankOptions() {
  return useQuery({
    queryKey: officeTestKeys.bankOptions,
    queryFn: ({ signal }) => api<QuestionBankOptions>("/question-bank/options", { signal }),
  });
}

/** Adds a question (no id), changes one, or deletes it (no input). */
export function useQuestionStep() {
  const changed = useTestsChanged();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string | null;
      input: QuestionInput | null;
    }): Promise<unknown> => {
      if (!id) return api<Question>("/question-bank", { method: "POST", body: input });
      if (!input) return api<void>(`/question-bank/${id}`, { method: "DELETE" });
      return api<Question>(`/question-bank/${id}`, { method: "PATCH", body: input });
    },
    onSuccess: changed,
  });
}
