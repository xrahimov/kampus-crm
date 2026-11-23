import { useQuery } from "@tanstack/react-query";

import { api, apiForm, type PickedFile } from "@/lib/api";

import type { ChatMessage, GroupChat, GroupMaterial, GroupMaterials } from "./types";

/*
 * A group's chat and materials on the teacher's side (A-214): the same calls
 * the site's group page makes, behind the session.
 */

export const groupPageKeys = {
  chat: (groupId: string) => ["group", groupId, "chat"] as const,
  materials: (groupId: string) => ["group", groupId, "materials"] as const,
};

/** The whole chat; also where the unread count on the group's screen comes from. */
export function useGroupChat(groupId: string) {
  return useQuery({
    queryKey: groupPageKeys.chat(groupId),
    queryFn: ({ signal }) => api<GroupChat>(`/groups/${groupId}/chat`, { signal }),
  });
}

/** Messages newer than `after`, or everything when there is none yet. */
export function fetchGroupChat(groupId: string, after: string | null): Promise<GroupChat> {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  return api<GroupChat>(`/groups/${groupId}/chat${query}`);
}

export function sendGroupMessage(groupId: string, text: string): Promise<ChatMessage> {
  return api<ChatMessage>(`/groups/${groupId}/chat`, { method: "POST", body: { text } });
}

export function markGroupChatRead(groupId: string): Promise<unknown> {
  return api<unknown>(`/groups/${groupId}/chat/read`, { method: "POST" });
}

/** The group's files, links and recordings, with the lessons one can be tied to. */
export function useGroupMaterials(groupId: string) {
  return useQuery({
    queryKey: groupPageKeys.materials(groupId),
    queryFn: ({ signal }) => api<GroupMaterials>(`/groups/${groupId}/materials`, { signal }),
  });
}

/** Stores a file on the server and answers with the address to save with a record. */
export function uploadDocument(file: PickedFile): Promise<{ key: string; url: string }> {
  return apiForm<{ key: string; url: string }>("/uploads/documents", {}, file);
}

export function addGroupMaterial(
  groupId: string,
  input: { lessonId: string | null; kind: "FILE" | "LINK"; title: string; url: string },
): Promise<GroupMaterial> {
  return api<GroupMaterial>(`/groups/${groupId}/materials`, { method: "POST", body: input });
}

/** Uploads a file from this device and adds it to the group's materials. */
export async function addGroupFile(
  groupId: string,
  lessonId: string | null,
  title: string,
  file: PickedFile,
): Promise<GroupMaterial> {
  const stored = await uploadDocument(file);
  return addGroupMaterial(groupId, { lessonId, kind: "FILE", title, url: stored.url });
}

export function deleteMaterial(materialId: string): Promise<void> {
  return api<void>(`/materials/${materialId}`, { method: "DELETE" });
}
