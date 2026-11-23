import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ChatMessage,
  CourseProgress,
  ExerciseAnswer,
  GroupChat,
  LessonRating,
  PortalAnnouncement,
  PortalBadge,
  PortalChat,
  PortalCourse,
  PortalExercise,
  PortalExerciseResult,
  PortalGradebook,
  PortalMaterial,
  PortalTest,
  PortalTestResult,
  PortalTestRun,
  PortalVocab,
  StreamPost,
} from "./types";

/*
 * What a student or parent does on a group's pages beyond homework (A-213):
 * materials, the group chat, tests and self-check exercises. Every call is
 * the personal page's own: the membership token in the path is the key, and
 * no session travels with it.
 */

const base = (token: string) => `/public/class/${encodeURIComponent(token)}`;

export const portalKeys = {
  materials: (token: string) => ["student", "materials", token] as const,
  chat: (token: string) => ["student", "chat", token] as const,
  tests: (token: string) => ["student", "tests", token] as const,
  exercise: (token: string, id: string) => ["student", "exercise", token, id] as const,
  news: (token: string) => ["student", "news", token] as const,
  stream: (token: string) => ["student", "stream", token] as const,
  course: (token: string) => ["student", "course", token] as const,
  progress: (token: string) => ["student", "progress", token] as const,
  vocab: (token: string) => ["student", "vocab", token] as const,
  gradebook: (token: string) => ["student", "gradebook", token] as const,
  badges: (token: string) => ["student", "badges", token] as const,
};

/** A read of one of the personal page's lists. */
function usePortalList<T>(key: readonly unknown[], path: string) {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api<T>(path, { signal, anonymous: true }),
  });
}

/** The group's files, links and lesson recordings. */
export function usePortalMaterials(token: string) {
  return useQuery({
    queryKey: portalKeys.materials(token),
    queryFn: ({ signal }) =>
      api<PortalMaterial[]>(`${base(token)}/materials`, { signal, anonymous: true }),
  });
}

/** Tells the server where the student is in a recording, so another device continues there. */
export function saveMaterialProgress(
  token: string,
  materialId: string,
  positionSec: number,
  durationSec: number | null,
): Promise<void> {
  return api<void>(`${base(token)}/materials/${materialId}/progress`, {
    method: "POST",
    body: { positionSec, durationSec },
    anonymous: true,
  });
}

/** The whole chat with the teachers' names; also where the unread count comes from. */
export function usePortalChat(token: string) {
  return useQuery({
    queryKey: portalKeys.chat(token),
    queryFn: ({ signal }) => api<PortalChat>(`${base(token)}/chat`, { signal, anonymous: true }),
  });
}

/** The whole chat, asked for again by an open chat that has no message yet. */
export function fetchChat(token: string): Promise<GroupChat> {
  return api<GroupChat>(`${base(token)}/chat`, { anonymous: true });
}

/** Messages newer than `after`. */
export function fetchChatAfter(token: string, after: string): Promise<GroupChat> {
  return api<GroupChat>(`${base(token)}/chat?after=${encodeURIComponent(after)}`, {
    anonymous: true,
  });
}

export function sendChatMessage(token: string, text: string): Promise<ChatMessage> {
  return api<ChatMessage>(`${base(token)}/chat`, {
    method: "POST",
    body: { text },
    anonymous: true,
  });
}

export function markChatRead(token: string): Promise<unknown> {
  return api<unknown>(`${base(token)}/chat/read`, { method: "POST", anonymous: true });
}

/** The tests the group was given, with what the student already took. */
export function usePortalTests(token: string) {
  return useQuery({
    queryKey: portalKeys.tests(token),
    queryFn: ({ signal }) => api<PortalTest[]>(`${base(token)}/tests`, { signal, anonymous: true }),
  });
}

/** Opens a test: its questions, and the clock starts on the server if it has one. */
export function openTest(token: string, testId: string): Promise<PortalTestRun> {
  return api<PortalTestRun>(`${base(token)}/tests/${testId}`, { anonymous: true });
}

/** Hands in the answers: question id to the chosen option's index. */
export function handInTest(
  token: string,
  testId: string,
  answers: Record<string, number>,
): Promise<PortalTestResult> {
  return api<PortalTestResult>(`${base(token)}/tests/${testId}`, {
    method: "POST",
    body: { answers },
    anonymous: true,
  });
}

/** One exercise without its answer key. */
export function usePortalExercise(token: string, exerciseId: string) {
  return useQuery({
    queryKey: portalKeys.exercise(token, exerciseId),
    queryFn: ({ signal }) =>
      api<PortalExercise>(`${base(token)}/exercises/${exerciseId}`, { signal, anonymous: true }),
  });
}

/** One go at an exercise: scored on the server, the key comes back. */
export function checkExercise(
  token: string,
  exerciseId: string,
  answers: Record<string, ExerciseAnswer>,
): Promise<PortalExerciseResult> {
  return api<PortalExerciseResult>(`${base(token)}/exercises/${exerciseId}`, {
    method: "POST",
    body: { answers },
    anonymous: true,
  });
}

/* ----- The rest of a group's page (A-215) ----- */

/** The centre's notices for this student, newest first. */
export function usePortalNews(token: string) {
  return usePortalList<PortalAnnouncement[]>(
    portalKeys.news(token),
    `${base(token)}/announcements`,
  );
}

/** The student opened these notices. */
export function markNewsRead(token: string, ids: string[]): Promise<unknown> {
  return api<unknown>(`${base(token)}/announcements`, {
    method: "POST",
    body: { ids },
    anonymous: true,
  });
}

/** The group's stream: the teacher's posts with everyone's comments. */
export function usePortalStream(token: string) {
  return usePortalList<StreamPost[]>(portalKeys.stream(token), `${base(token)}/stream`);
}

/** A comment under a post; the post comes back with it. */
export function addStreamComment(token: string, postId: string, body: string): Promise<StreamPost> {
  return api<StreamPost>(`${base(token)}/stream/${postId}/comments`, {
    method: "POST",
    body: { body },
    anonymous: true,
  });
}

/** Takes back the student's own comment; the post comes back without it. */
export function deleteStreamComment(token: string, commentId: string): Promise<StreamPost> {
  return api<StreamPost>(`${base(token)}/stream/comments/${commentId}`, {
    method: "DELETE",
    anonymous: true,
  });
}

/** The course's topics with what the student may open. */
export function usePortalCourse(token: string) {
  return usePortalList<PortalCourse>(portalKeys.course(token), `${base(token)}/course`);
}

/** The student's own progress through the course. */
export function usePortalProgress(token: string) {
  return usePortalList<CourseProgress>(portalKeys.progress(token), `${base(token)}/progress`);
}

/** The flashcards: figures and the next cards due. */
export function usePortalVocab(token: string) {
  return usePortalList<PortalVocab>(portalKeys.vocab(token), `${base(token)}/vocab`);
}

/** One flashcard answered; the new figures come back. */
export function reviewWord(token: string, wordId: string, known: boolean): Promise<PortalVocab> {
  return api<PortalVocab>(`${base(token)}/vocab/${wordId}`, {
    method: "POST",
    body: { known },
    anonymous: true,
  });
}

/** The student's grade in the course, part by part. */
export function usePortalGradebook(token: string) {
  return usePortalList<PortalGradebook>(portalKeys.gradebook(token), `${base(token)}/gradebook`);
}

/** Every badge, earned or still locked. */
export function usePortalBadges(token: string) {
  return usePortalList<PortalBadge[]>(portalKeys.badges(token), `${base(token)}/badges`);
}

/** The student's one-to-five rating of a lesson that is over, with an optional line. */
export function rateLesson(
  token: string,
  lessonId: string,
  rating: number,
  comment: string | null,
): Promise<LessonRating> {
  return api<LessonRating>(`${base(token)}/lessons/${lessonId}/rating`, {
    method: "POST",
    body: { rating, comment },
    anonymous: true,
  });
}
