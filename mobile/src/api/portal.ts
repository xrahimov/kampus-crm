import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ChatMessage,
  ExerciseAnswer,
  GroupChat,
  PortalChat,
  PortalExercise,
  PortalExerciseResult,
  PortalMaterial,
  PortalTest,
  PortalTestResult,
  PortalTestRun,
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
};

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
