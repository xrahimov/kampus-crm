import { useQuery } from "@tanstack/react-query";

import { api, type PickedFile } from "@/lib/api";

import { uploadDocument } from "./group-pages";
import type {
  GroupGradebook,
  GroupHomework,
  GroupHomeworkTask,
  GroupNote,
  RubricCriterion,
  StreamPost,
} from "./types";

/*
 * The rest of a group's pages on the teacher's side (A-217): homework, the
 * class stream, the gradebook and the notes. The same calls the site's group
 * page makes, behind the session.
 */

export const staffGroupKeys = {
  homework: (groupId: string) => ["group", groupId, "homework"] as const,
  stream: (groupId: string) => ["group", groupId, "stream"] as const,
  gradebook: (groupId: string) => ["group", groupId, "gradebook"] as const,
  notes: (groupId: string) => ["group", groupId, "notes"] as const,
};

/* ----- homework ----- */

export function useGroupHomework(groupId: string) {
  return useQuery({
    queryKey: staffGroupKeys.homework(groupId),
    queryFn: ({ signal }) => api<GroupHomework>(`/groups/${groupId}/homework`, { signal }),
  });
}

/** What a task is made of. `file` is a new file from this device; without one `attachmentUrl` stays. */
export interface TaskInput {
  text: string;
  linkUrl: string | null;
  attachmentUrl: string | null;
  file: PickedFile | null;
  dueDate: string | null;
  speaking: boolean;
}

async function taskBody(input: TaskInput) {
  const attachmentUrl = input.file ? (await uploadDocument(input.file)).url : input.attachmentUrl;
  return {
    text: input.text,
    linkUrl: input.linkUrl,
    attachmentUrl,
    dueDate: input.dueDate,
    speaking: input.speaking,
  };
}

/** Sets or replaces the homework of one lesson. */
export async function saveLessonHomework(
  lessonId: string,
  input: TaskInput,
): Promise<GroupHomeworkTask> {
  return api<GroupHomeworkTask>(`/lessons/${lessonId}/homework`, {
    method: "PUT",
    body: await taskBody(input),
  });
}

/** A project for the whole group with a name of its own, not tied to a lesson. */
export async function createAssignment(
  groupId: string,
  input: TaskInput & { title: string },
): Promise<GroupHomeworkTask> {
  return api<GroupHomeworkTask>(`/groups/${groupId}/homework`, {
    method: "POST",
    body: { ...(await taskBody(input)), title: input.title, rubric: [] },
  });
}

/** Changes an assignment; its rubric is sent back as it was. */
export async function updateAssignment(
  id: string,
  input: TaskInput & { title: string; rubric: RubricCriterion[] },
): Promise<GroupHomeworkTask> {
  return api<GroupHomeworkTask>(`/homework/${id}`, {
    method: "PUT",
    body: { ...(await taskBody(input)), title: input.title, rubric: input.rubric },
  });
}

export function deleteHomework(id: string): Promise<void> {
  return api<void>(`/homework/${id}`, { method: "DELETE" });
}

/* ----- the class stream ----- */

export function useGroupStream(groupId: string) {
  return useQuery({
    queryKey: staffGroupKeys.stream(groupId),
    queryFn: ({ signal }) => api<StreamPost[]>(`/groups/${groupId}/stream`, { signal }),
  });
}

export async function createStreamPost(
  groupId: string,
  input: { body: string; file: PickedFile | null; pinned: boolean },
): Promise<StreamPost> {
  const attachmentUrl = input.file ? (await uploadDocument(input.file)).url : null;
  return api<StreamPost>(`/groups/${groupId}/stream`, {
    method: "POST",
    body: { body: input.body, attachmentUrl, pinned: input.pinned },
  });
}

/** Pins, unpins, closes or opens comments: the text goes back as it is. */
export function updateStreamPost(
  post: Pick<StreamPost, "id" | "body">,
  change: { pinned?: boolean; locked?: boolean },
): Promise<StreamPost> {
  return api<StreamPost>(`/stream/${post.id}`, {
    method: "PUT",
    body: { body: post.body, ...change },
  });
}

export function deleteStreamPost(id: string): Promise<void> {
  return api<void>(`/stream/${id}`, { method: "DELETE" });
}

export function addStaffComment(postId: string, body: string): Promise<StreamPost> {
  return api<StreamPost>(`/stream/${postId}/comments`, { method: "POST", body: { body } });
}

export function deleteStaffComment(commentId: string): Promise<void> {
  return api<void>(`/stream/comments/${commentId}`, { method: "DELETE" });
}

/* ----- gradebook and notes ----- */

export function useGroupGradebook(groupId: string) {
  return useQuery({
    queryKey: staffGroupKeys.gradebook(groupId),
    queryFn: ({ signal }) => api<GroupGradebook>(`/groups/${groupId}/gradebook`, { signal }),
  });
}

export function useGroupNotes(groupId: string) {
  return useQuery({
    queryKey: staffGroupKeys.notes(groupId),
    queryFn: ({ signal }) => api<GroupNote[]>(`/groups/${groupId}/notes`, { signal }),
  });
}

export function addGroupNote(groupId: string, text: string): Promise<GroupNote> {
  return api<GroupNote>(`/groups/${groupId}/notes`, { method: "POST", body: { text } });
}
