import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Staff, TeacherInput } from "./office-catalog";
import type { Page } from "./types";

/*
 * Staff and roles for the office (A-244): the site's Settings → Staff and
 * Settings → Roles. The calls those two pages make.
 */

export interface RoleCount {
  code: string;
  name: string;
  count: number;
}

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  /** Comes with Kampus: its permissions can change, it cannot be deleted. */
  isSystem: boolean;
  isActive: boolean;
  /** Permission codes; `*` is everything. */
  permissions: string[];
  userCount: number;
}

export interface RoleInput {
  name: string;
  isActive: boolean;
  permissions: string[];
}

/** What the staff form sends: the teacher form's fields and the person's roles. */
export interface StaffInput extends TeacherInput {
  /** Left out when someone changes their own card: nobody changes their own roles. */
  roleCodes?: string[];
}

export const staffKeys = {
  all: ["staff"] as const,
  list: (role: string | null, archived: boolean, q: string) =>
    ["staff", "list", role, archived, q] as const,
  counts: (archived: boolean) => ["staff", "counts", archived] as const,
  roles: ["roles"] as const,
};

export const STAFF_PAGE = 30;

/** Everyone who signs in, by name, thirty at a time; one role's people when a role is given. */
export function useStaffList(role: string | null, archived: boolean, q: string) {
  return useInfiniteQuery({
    queryKey: staffKeys.list(role, archived, q),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const parts = ["sort=fullName:asc", `pageSize=${STAFF_PAGE}`, `page=${pageParam}`];
      if (role) parts.push(`role=${encodeURIComponent(role)}`);
      if (archived) parts.push("archived=true");
      if (q) parts.push(`q=${encodeURIComponent(q)}`);
      return api<Page<Staff>>(`/staff?${parts.join("&")}`, { signal });
    },
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

/** How many people hold each role: the figures on the role chips. */
export function useStaffRoleCounts(archived: boolean) {
  return useQuery({
    queryKey: staffKeys.counts(archived),
    queryFn: ({ signal }) =>
      api<RoleCount[]>(`/staff/role-counts${archived ? "?archived=true" : ""}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: staffKeys.roles,
    queryFn: ({ signal }) => api<RoleRow[]>("/roles", { signal }),
    enabled,
  });
}

/**
 * After a person changed: the staff lists and counts, the roles (they carry
 * how many people hold them), the teachers' lists, and the groups' choices.
 */
function useStaffChanged() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: staffKeys.all }),
      client.invalidateQueries({ queryKey: staffKeys.roles }),
      client.invalidateQueries({ queryKey: ["teachers"] }),
      client.invalidateQueries({ queryKey: ["groups"] }),
    ]);
}

export function useSaveStaff(id: string | null) {
  const changed = useStaffChanged();
  return useMutation({
    mutationFn: (input: StaffInput) =>
      id
        ? api<Staff>(`/staff/${id}`, { method: "PATCH", body: input })
        : api<Staff>("/staff", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

/** Archives the person: they are signed out and leave the lists; their history stays. */
export function useArchiveStaff() {
  const changed = useStaffChanged();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/staff/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

/** Ends every sign-in of the person, on every device. */
export function useStaffSignOutEverywhere(id: string) {
  return useMutation({
    mutationFn: () => api<{ revoked: number }>(`/staff/${id}/sign-out-all`, { method: "POST" }),
  });
}

/**
 * A role saved, or with `input: null` deleted. What a role allows decides what
 * everyone holding it sees, the person signed in too, so everything is read again.
 */
export function useRoleStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: { id: string | null; input: RoleInput | null }) => {
      if (!step.input) return api<unknown>(`/roles/${step.id}`, { method: "DELETE" });
      return step.id
        ? api<unknown>(`/roles/${step.id}`, { method: "PATCH", body: step.input })
        : api<unknown>("/roles", { method: "POST", body: step.input });
    },
    onSuccess: () => client.invalidateQueries(),
  });
}
