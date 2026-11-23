import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Page, StudentRow } from "./types";

/*
 * People the office has to answer or call (A-232): those who signed in with
 * Telegram before the centre had their number (sign-in requests), and the
 * students who stopped coming (absences). The same calls the site makes.
 */

export type JoinDoor = "STUDENT" | "STAFF";
export type JoinTab = "PENDING" | "DECLINED";

export interface JoinRequest {
  id: string;
  door: JoinDoor;
  phone: string;
  fullName: string;
  note: string | null;
  branchId: string | null;
  branchName: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
}

export interface JoinRequests {
  items: JoinRequest[];
  /** Whose requests this person may answer. */
  doors: JoinDoor[];
}

export type JoinApproval =
  | {
      mode: "newStudent";
      fullName: string;
      branchId: string;
      gender: "MALE" | "FEMALE";
      groupId: string | null;
    }
  | { mode: "student"; studentId: string }
  | { mode: "parent"; studentId: string; fullName: string }
  | {
      mode: "newStaff";
      fullName: string;
      branchId: string;
      gender: "MALE" | "FEMALE";
      roleCode: string;
    };

export interface Role {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export const ABSENCE_FILTERS = ["OPEN", "NO_CONTACT", "CLOSED", "ALL"] as const;
export type AbsenceFilter = (typeof ABSENCE_FILTERS)[number];
export const ABSENCE_REASONS = ["STREAK", "SILENT"] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];
export const ABSENCE_OUTCOMES = ["NO_ANSWER", "WILL_RETURN", "ILL", "LEAVING", "OTHER"] as const;
export type AbsenceOutcome = (typeof ABSENCE_OUTCOMES)[number];
export type AbsenceChannel = "CALL" | "TELEGRAM" | "SMS" | "VISIT" | "NOTE";

export interface AbsenceCase {
  id: string;
  membershipId: string;
  studentId: string;
  studentName: string;
  phone: string | null;
  parentPhone: string | null;
  groupId: string;
  groupName: string;
  teacher: string | null;
  branchId: string;
  branchName: string;
  status: "OPEN" | "CLOSED";
  reason: AbsenceReason;
  /** Lessons missed in a row, or held without a present mark. */
  missed: number;
  sinceAt: string;
  days: number;
  lastPresentAt: string | null;
  openedAt: string;
  lastContactAt: string | null;
  lastChannel: AbsenceChannel | null;
  lastOutcome: AbsenceOutcome | null;
  lastContactBy: string | null;
  closedAt: string | null;
  closedReason: "RETURNED" | "LEFT" | "CLEARED" | null;
  hasTelegram: boolean;
}

export interface AbsenceContact {
  id: string;
  channel: AbsenceChannel;
  outcome: AbsenceOutcome | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type AbsencePage = Page<AbsenceCase> & {
  summary: { open: number; noContact: number; streak: number; silent: number };
  rules: { streak: number | null; silentDays: number | null };
};

export interface AbsenceFilters {
  status: AbsenceFilter;
  reason: AbsenceReason | null;
  branchId: string | null;
  q: string;
}

export const followUpKeys = {
  joinRequests: (tab: JoinTab) => ["join-requests", tab] as const,
  roles: ["roles"] as const,
  studentSearch: (q: string) => ["students", "pick", q] as const,
  absences: (filters: AbsenceFilters) => ["absences", "list", filters] as const,
  absenceContacts: (id: string) => ["absences", "contacts", id] as const,
};

export function useJoinRequests(tab: JoinTab, enabled = true) {
  return useQuery({
    queryKey: followUpKeys.joinRequests(tab),
    queryFn: ({ signal }) => api<JoinRequests>(`/join-requests?status=${tab}`, { signal }),
    enabled,
    // Someone without the right to answer gets a refusal: no reason to ask again.
    retry: false,
  });
}

/** The roles a new member of staff may get. */
export function useRoles(enabled: boolean) {
  return useQuery({
    queryKey: followUpKeys.roles,
    queryFn: ({ signal }) => api<Role[]>("/roles", { signal }),
    enabled,
  });
}

/** A few students by name or phone, to put a number on a card that is already there. */
export function useStudentSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: followUpKeys.studentSearch(q),
    queryFn: ({ signal }) =>
      api<Page<StudentRow>>(
        `/students?sort=fullName:asc&pageSize=8&q=${encodeURIComponent(q)}`,
        { signal },
      ),
    enabled: enabled && q.length >= 2,
    placeholderData: (previous) => previous,
  });
}

function useJoinChanged() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["join-requests"] }),
      client.invalidateQueries({ queryKey: ["students"] }),
    ]);
}

/** Lets a waiting person in, as someone new or as someone the centre already has. */
export function useApproveJoin() {
  const changed = useJoinChanged();
  return useMutation({
    mutationFn: (what: { id: string; approval: JoinApproval }) =>
      api(`/join-requests/${what.id}/approve`, { method: "POST", body: what.approval }),
    onSuccess: changed,
  });
}

export function useDeclineJoin() {
  const changed = useJoinChanged();
  return useMutation({
    mutationFn: (id: string) => api(`/join-requests/${id}/decline`, { method: "POST" }),
    onSuccess: changed,
  });
}

/** The students who stopped coming, longest away first, a page at a time. */
export function useAbsences(filters: AbsenceFilters) {
  return useInfiniteQuery({
    queryKey: followUpKeys.absences(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const parts = [`status=${filters.status}`, `page=${pageParam}`];
      if (filters.reason) parts.push(`reason=${filters.reason}`);
      if (filters.branchId) parts.push(`branchId=${filters.branchId}`);
      if (filters.q) parts.push(`q=${encodeURIComponent(filters.q)}`);
      return api<AbsencePage>(`/absences?${parts.join("&")}`, { signal });
    },
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

export function useAbsenceContacts(id: string | null) {
  return useQuery({
    queryKey: followUpKeys.absenceContacts(id ?? ""),
    queryFn: ({ signal }) => api<AbsenceContact[]>(`/absences/${id}/contacts`, { signal }),
    enabled: id !== null,
  });
}

export function useLogAbsenceContact(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      channel: AbsenceChannel;
      outcome: AbsenceOutcome | null;
      note: string | null;
    }) => api<AbsenceContact>(`/absences/${id}/contacts`, { method: "POST", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["absences"] }),
  });
}
