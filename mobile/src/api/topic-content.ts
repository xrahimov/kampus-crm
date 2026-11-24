import type { ExerciseItem } from "@kampus/lib/validation/exercises";
import type { TopicBlockKindInput } from "@kampus/lib/validation/topic-content";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * What a topic of a course plan carries for the students to work through on
 * their own (A-263): the blocks they read and watch (A-157), the self-check
 * exercises (A-158, on a homework too) and the words of the trainer (A-165).
 * The server says who may change each: the office, or a teacher of the course.
 */

export const topicKeys = {
  content: (topicId: string) => ["topic", topicId, "content"] as const,
  words: (topicId: string) => ["topic", topicId, "words"] as const,
  exercises: (anchor: ExerciseAnchor) =>
    ["exercises", anchor.topicId ?? null, anchor.homeworkId ?? null] as const,
  exercise: (id: string) => ["exercise", id] as const,
  results: (id: string) => ["exercise", id, "results"] as const,
};

/* ----- the blocks ----- */

export interface StaffTopicBlock {
  id: string;
  sortOrder: number;
  kind: TopicBlockKindInput;
  title: string;
  body: string | null;
  url: string | null;
  size: number | null;
}

export interface TopicContent {
  topicId: string;
  title: string;
  courseId: string;
  courseName: string;
  blocks: StaffTopicBlock[];
  canEdit: boolean;
}

/** A block as it is sent: the order is the order of the list. */
export type TopicBlockInput = Pick<StaffTopicBlock, "kind" | "title" | "body" | "url">;

export function useTopicContent(topicId: string) {
  return useQuery({
    queryKey: topicKeys.content(topicId),
    queryFn: ({ signal }) => api<TopicContent>(`/topics/${topicId}/content`, { signal }),
  });
}

/** Replaces the topic's blocks. Every group's plan counts them, so the plans are read again. */
export function useSaveTopicContent(topicId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (blocks: TopicBlockInput[]) =>
      api<TopicContent>(`/topics/${topicId}/content`, { method: "PUT", body: { blocks } }),
    onSuccess: (saved) => {
      client.setQueryData(topicKeys.content(topicId), saved);
      void client.invalidateQueries({
        predicate: (query) => query.queryKey[0] === "group" && query.queryKey[2] === "plan",
      });
    },
  });
}

/* ----- the words of the trainer ----- */

export interface TopicWord {
  id: string;
  term: string;
  translation: string;
  example: string | null;
}

export interface TopicWords {
  topicId: string;
  title: string;
  canEdit: boolean;
  words: TopicWord[];
}

/** A word as it is sent; the example may be left out. */
export interface TopicWordInput {
  term: string;
  translation: string;
  example?: string | null;
}

export function useTopicWords(topicId: string) {
  return useQuery({
    queryKey: topicKeys.words(topicId),
    queryFn: ({ signal }) => api<TopicWords>(`/topics/${topicId}/words`, { signal }),
  });
}

export function useSaveTopicWords(topicId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (words: TopicWordInput[]) =>
      api<TopicWords>(`/topics/${topicId}/words`, { method: "PUT", body: { words } }),
    onSuccess: (saved) => client.setQueryData(topicKeys.words(topicId), saved),
  });
}

/* ----- self-check exercises, on a topic or on a homework ----- */

/** Where an exercise belongs: one of the two, never both. */
export interface ExerciseAnchor {
  topicId?: string;
  homeworkId?: string;
}

export interface StaffExercise {
  id: string;
  topicId: string | null;
  homeworkId: string | null;
  title: string;
  items: ExerciseItem[];
  maxScore: number;
  /** Students who tried it at least once, among the groups the person sees. */
  attempted: number;
  createdByName: string | null;
  updatedAt: string;
}

export interface ExerciseList {
  items: StaffExercise[];
  canEdit: boolean;
}

export interface ExerciseResultRow {
  studentId: string;
  fullName: string;
  groupName: string;
  attempts: number;
  bestScore: number;
  maxScore: number;
  bestPercent: number;
  lastAt: string;
}

export function useExercises(anchor: ExerciseAnchor) {
  const query = anchor.topicId
    ? `topicId=${encodeURIComponent(anchor.topicId)}`
    : `homeworkId=${encodeURIComponent(anchor.homeworkId ?? "")}`;
  return useQuery({
    queryKey: topicKeys.exercises(anchor),
    queryFn: ({ signal }) => api<ExerciseList>(`/exercises?${query}`, { signal }),
  });
}

/** One exercise, to change it; nothing is asked for a new one. */
export function useExercise(id: string | null) {
  return useQuery({
    queryKey: topicKeys.exercise(id ?? ""),
    queryFn: ({ signal }) => api<StaffExercise>(`/exercises/${id}`, { signal }),
    enabled: id !== null,
  });
}

export function useExerciseResults(id: string | null) {
  return useQuery({
    queryKey: topicKeys.results(id ?? ""),
    queryFn: ({ signal }) => api<ExerciseResultRow[]>(`/exercises/${id}/results`, { signal }),
    enabled: id !== null,
  });
}

/** Adds an exercise where it belongs, or changes the title and items of one there is. */
export function useSaveExercise(id: string | null, anchor: ExerciseAnchor) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; items: ExerciseItem[] }) =>
      id
        ? api<StaffExercise>(`/exercises/${id}`, { method: "PUT", body: input })
        : api<StaffExercise>("/exercises", { method: "POST", body: { ...input, ...anchor } }),
    onSuccess: (saved) => {
      client.setQueryData(topicKeys.exercise(saved.id), saved);
      return client.invalidateQueries({ queryKey: ["exercises"] });
    },
  });
}

export function useDeleteExercise() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/exercises/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["exercises"] }),
  });
}
