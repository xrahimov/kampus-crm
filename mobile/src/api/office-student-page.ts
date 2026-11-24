import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { StudentFilters } from "./staff-students";
import type { Page } from "./types";

/*
 * The rest of a student's page for the office (A-240): the SMS sent to them,
 * their calls, what was done with their record, the parents, the family with
 * its shared discount and the parents' page, who signs in as them, the extra
 * information and the blacklist. The calls the site's student page makes.
 *
 * Every key starts with "students", so whatever changes a student refreshes
 * these too.
 */

export type SmsStatus = "QUEUED" | "SENT" | "FAILED";
export type SmsRecipientType = "STUDENT" | "PARENT" | "STAFF" | "LEAD" | "OTHER";

export interface SmsLogRow {
  id: string;
  recipientType: SmsRecipientType;
  recipientName: string;
  phone: string;
  text: string;
  status: SmsStatus;
  /** Null when the system sent it. */
  sentByName: string | null;
  /** The automatic message it was, when it was one. */
  event: string | null;
  error: string | null;
  createdAt: string;
}

/** Who a message goes to; the server finds the phones. */
export type SmsTarget =
  | { kind: "student"; studentId: string }
  | { kind: "parents"; studentId: string }
  | { kind: "group"; groupId: string }
  | { kind: "students"; studentIds: string[] }
  /** Everyone the Students list shows under its search and filters. */
  | ({ kind: "studentFilter"; q?: string } & StudentFilters)
  | { kind: "leads"; leadIds: string[] }
  | { kind: "leadColumn"; columnId: string };

export interface SmsCount {
  count: number;
  skipped: number;
  /** A few of the names, to see who it is going to. */
  sample: string[];
}

export interface SmsTemplate {
  id: string;
  categoryName: string;
  text: string;
}

export interface SmsResult {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  /** "fake" when the centre has no SMS gateway: recorded, not delivered. */
  adapter: string;
}

export type CallStatus = "ANSWERED" | "MISSED" | "BUSY" | "FAILED";

export interface CallRow {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: CallStatus;
  fromPhone: string;
  toPhone: string;
  staffName: string | null;
  durationSeconds: number;
  startedAt: string;
}

export interface StudentHistoryRow {
  id: string;
  /** Such as "payment.create"; the words are under students.history.actions. */
  action: string;
  actorName: string | null;
  at: string;
  details: Record<string, unknown>;
}

export interface FamilyMember {
  id: string;
  fullName: string;
  isArchived: boolean;
  /** The names of the groups they are in now. */
  groups: string[];
}

export interface Family {
  id: string;
  name: string;
  discountPercent: number;
  note: string | null;
  members: FamilyMember[];
}

export interface StudentAccess {
  linkId: string;
  /** Whose record the Telegram account is on: the student's own or a parent's. */
  who: { kind: "STUDENT" } | { kind: "PARENT"; name: string };
  telegramName: string;
  telegramUsername: string | null;
  via: "PHONE" | "CODE" | "STAFF";
  linkedAt: string;
  lastSeenAt: string | null;
  /** How many devices are signed in; 0 is signed out everywhere. */
  devices: number;
}

export const studentPageKeys = {
  sms: (id: string) => ["students", id, "sms"] as const,
  calls: (id: string) => ["students", id, "calls"] as const,
  history: (id: string) => ["students", id, "history"] as const,
  family: (id: string) => ["students", id, "family"] as const,
  familyPage: (id: string) => ["students", id, "family", "page"] as const,
  access: (id: string) => ["students", id, "access"] as const,
};

export function useStudentSms(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentPageKeys.sms(id),
    queryFn: ({ signal }) => api<SmsLogRow[]>(`/students/${id}/sms`, { signal }),
    enabled,
  });
}

export function useStudentCalls(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentPageKeys.calls(id),
    queryFn: ({ signal }) => api<CallRow[]>(`/students/${id}/calls`, { signal }),
    enabled,
  });
}

/** What was done with the student's record, newest first, a page at a time. */
export function useStudentHistory(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: studentPageKeys.history(id),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<Page<StudentHistoryRow>>(`/students/${id}/history?page=${pageParam}&pageSize=20`, {
        signal,
      }),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled,
  });
}

/** The student's family, or null when no brother or sister is linked. */
export function useStudentFamily(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentPageKeys.family(id),
    queryFn: ({ signal }) => api<Family | null>(`/students/${id}/family`, { signal }),
    enabled,
  });
}

export function useStudentAccess(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentPageKeys.access(id),
    queryFn: ({ signal }) => api<StudentAccess[]>(`/students/${id}/access`, { signal }),
    enabled,
  });
}

/** How many phones a message would reach, before it is written. */
export function useSmsCount(target: SmsTarget | null) {
  return useQuery({
    queryKey: ["sms", "count", target] as const,
    queryFn: ({ signal }) =>
      api<SmsCount>("/sms/count", { method: "POST", body: { target }, signal }),
    enabled: target !== null,
    gcTime: 0,
  });
}

export function useSmsTemplates(enabled: boolean) {
  return useQuery({
    queryKey: ["sms", "templates"] as const,
    queryFn: ({ signal }) => api<SmsTemplate[]>("/sms-templates", { signal }),
    enabled,
    staleTime: 60_000,
  });
}

export function useSendSms() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { target: SmsTarget; text: string }) =>
      api<SmsResult>("/sms/send", { method: "POST", body: input }),
    onSuccess: (_result, { target }) =>
      "studentId" in target
        ? client.invalidateQueries({ queryKey: studentPageKeys.sms(target.studentId) })
        : undefined,
  });
}

/** Rings the student through the centre's telephony: the staff member's phone first. */
export function useStartCall(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (phone: string) =>
      api<CallRow & { adapter: string }>(`/students/${id}/call`, {
        method: "POST",
        body: { phone },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: studentPageKeys.calls(id) }),
  });
}

/** Everything about one student is read again. */
function useStudentChanged(id: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["students", id] });
}

export function useAddParent(id: string) {
  const changed = useStudentChanged(id);
  return useMutation({
    mutationFn: (input: { fullName: string; phone: string }) =>
      api<unknown>(`/students/${id}/parents`, { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useRemoveParent(id: string) {
  const changed = useStudentChanged(id);
  return useMutation({
    mutationFn: (parentId: string) => api<void>(`/parents/${parentId}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

/** "Add extra information": a named line on the student's card. */
export function useAddField(id: string) {
  const changed = useStudentChanged(id);
  return useMutation({
    mutationFn: (input: { name: string; value: string | null }) =>
      api<unknown>(`/students/${id}/custom-fields`, { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useRemoveField(id: string) {
  const changed = useStudentChanged(id);
  return useMutation({
    mutationFn: (fieldId: string) => api<void>(`/custom-fields/${fieldId}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

/** Onto the blacklist (no group takes them) or off it. */
export function useBlacklist(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) =>
      api<unknown>(`/students/${id}/blacklist`, { method: "POST", body: { value } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["students"] }),
  });
}

export interface SiblingInput {
  studentId: string;
  /** Only when neither student has a family yet. */
  name?: string;
  discountPercent?: number;
}

/** What is done to the family: a brother or sister joins, its name and discount change, this student leaves. */
export type FamilyStep =
  | { do: "link"; input: SiblingInput }
  | {
      do: "edit";
      familyId: string;
      input: { name: string; discountPercent: number; note: string | null };
    }
  | { do: "leave" };

export function useFamilyStep(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: FamilyStep): Promise<unknown> => {
      switch (step.do) {
        case "link":
          return api(`/students/${id}/family/link`, { method: "POST", body: step.input });
        case "edit":
          return api(`/families/${step.familyId}`, { method: "PATCH", body: step.input });
        case "leave":
          return api(`/students/${id}/family`, { method: "DELETE" });
      }
    },
    // A family is several students: their prices and pages all change.
    onSuccess: () => client.invalidateQueries({ queryKey: ["students"] }),
  });
}

/** The family's one link for the parents; null when the student has no family. */
export function useFamilyPage(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentPageKeys.familyPage(id),
    queryFn: ({ signal }) => api<{ url: string } | null>(`/students/${id}/family/page`, { signal }),
    enabled,
    gcTime: 0,
  });
}

/** A new link; the old one stops working at once. */
export function useRenewFamilyPage(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ url: string } | null>(`/students/${id}/family/page`, { method: "POST" }),
    onSuccess: (page) => client.setQueryData(studentPageKeys.familyPage(id), page),
  });
}

/** Signs a Telegram account out on every device, or takes its access away. */
export function useAccessStep(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: { do: "signOut" | "unlink"; linkId: string }) =>
      step.do === "signOut"
        ? api<unknown>(`/students/${id}/access/${step.linkId}/sign-out`, { method: "POST" })
        : api<unknown>(`/students/${id}/access/${step.linkId}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: studentPageKeys.access(id) }),
  });
}
