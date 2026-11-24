import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { keys } from "./hooks";
import type {
  BillingMode,
  Group,
  GroupStatus,
  GroupTeacherRole,
  MembershipStatus,
  Page,
  ShareType,
  WeekdayPattern,
} from "./types";

/*
 * Groups for the office (A-233): the list with its filters, a new group and
 * its changes, the people who teach it, days off, and the students in it. The
 * same calls the site's Groups pages make; the two lists of choices (options,
 * timetable) the site reads on its pages and the app asks for.
 */

export const GROUP_STATUSES = ["ACTIVE", "TRIAL", "FROZEN", "ARCHIVED"] as const;
export const WEEKDAY_PATTERNS = ["EVEN", "ODD", "EVERY_DAY", "CUSTOM"] as const;
export const GROUP_TEACHER_ROLES = ["MAIN", "ASSISTANT", "CO_TEACHER"] as const;
export const SHARE_TYPES = ["PERCENT", "PER_LESSON", "PER_STUDENT"] as const;
export const BILLING_MODES = ["MONTHLY", "PACKAGES"] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** EVEN = Tue/Thu/Sat, ODD = Mon/Wed/Fri, EVERY_DAY = Mon to Sat (A-50), as on the server. */
const PATTERN_DAYS: Record<Exclude<WeekdayPattern, "CUSTOM">, number[]> = {
  EVEN: [2, 4, 6],
  ODD: [1, 3, 5],
  EVERY_DAY: [1, 2, 3, 4, 5, 6],
};

export function patternDays(pattern: WeekdayPattern, custom: number[]): number[] {
  return pattern === "CUSTOM" ? [...custom].sort((a, b) => a - b) : PATTERN_DAYS[pattern];
}

export interface GroupOptions {
  courses: Array<{ id: string; branchId: string; name: string; color: string | null }>;
  rooms: Array<{ id: string; branchId: string; name: string }>;
  gradingSystems: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; fullName: string; branchIds: string[] }>;
  /** The centre lets teachers change the times of their own groups (A-193). */
  teachersChangeTimes: boolean;
}

export interface GroupListFilters {
  status: GroupStatus | "ALL";
  teacherId: string | null;
  courseId: string | null;
  weekdayPattern: WeekdayPattern | null;
  q: string;
}

export interface SlotInput {
  weekday: number;
  startTime: string;
  endTime: string;
  roomId: string | null;
}

export interface TeacherInput {
  userId: string;
  role: GroupTeacherRole;
  shareType: ShareType;
  shareValue: number;
}

/** A change of days or times of a running group: from which day, and who hears of it (A-193). */
export interface ScheduleChange {
  scheduleFrom?: string;
  notifySchedule?: boolean;
  /** The clash warning was shown and the person saves anyway (A-116). */
  ignoreClashes?: boolean;
}

export interface GroupInput extends ScheduleChange {
  branchId?: string;
  name: string;
  courseId: string;
  gradingSystemId: string | null;
  billingMode: BillingMode;
  weekdayPattern: WeekdayPattern;
  slots: SlotInput[];
  teachers: TeacherInput[];
  startDate: string;
  endDate: string | null;
  status: GroupStatus;
}

export interface ScheduleInput extends ScheduleChange {
  weekdayPattern: WeekdayPattern;
  slots: SlotInput[];
}

/** A room or a teacher that is already busy at a time the form asks for (A-116). */
export interface Clash {
  kind: "ROOM" | "TEACHER";
  weekday: number;
  startTime: string;
  endTime: string;
  groupName: string;
  roomName: string | null;
  teacherName: string | null;
}

export interface GroupDayOff {
  id: string;
  date: string;
  reason: string;
  startTime: string | null;
  movedTo: { lessonId: string; date: string; startTime: string; endTime: string } | null;
  notified: boolean;
}

export interface DayOffInput {
  date: string;
  reason: string;
  notify: boolean;
  moveTo: { date: string; startTime: string; endTime: string } | null;
}

export interface Member {
  id: string;
  groupId: string;
  studentId: string;
  fullName: string;
  phone: string | null;
  status: MembershipStatus;
  joinedAt: string;
  leftAt: string | null;
  customPrice: number | null;
  note: string | null;
  billingFrom: string | null;
  leaveReason: string | null;
  balance: number | null;
  /** Lessons left of a package (A-178); null in a group that charges by the month. */
  lessonsLeft: number | null;
}

export interface MemberInput {
  studentId?: string;
  newStudent?: { fullName: string; phone: string | null };
  joinedAt: string;
  billingFrom: string | null;
  customPrice: number | null;
  note: string | null;
  status: MembershipStatus;
}

export interface LeaveReason {
  id: string;
  name: string;
  kind: "LEAVE" | "TRANSFER";
  isActive: boolean;
}

export type TimetableMode = "room" | "teacher";

export interface TimetableBlock {
  weekday: number;
  startTime: string;
  endTime: string;
  groupId: string;
  groupName: string;
  courseName: string;
  color: string | null;
  roomName: string | null;
  teacherNames: string[];
}

export interface Timetable {
  mode: TimetableMode;
  branchId: string | null;
  branches: Array<{ id: string; name: string }>;
  rooms: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; fullName: string }>;
  selectedId: string | null;
  workStart: string;
  workEnd: string;
  blocks: TimetableBlock[];
}

export const officeGroupKeys = {
  options: ["groups", "options"] as const,
  list: (filters: GroupListFilters) => ["groups", "list", filters] as const,
  daysOff: (id: string) => ["group", id, "days-off"] as const,
  members: (id: string, removed: boolean) => ["group", id, "members", removed] as const,
  leaveReasons: ["leave-reasons"] as const,
  timetable: (mode: TimetableMode | null, branchId: string | null, id: string | null) =>
    ["timetable", mode, branchId, id] as const,
};

export function useGroupOptions(enabled = true) {
  return useQuery({
    queryKey: officeGroupKeys.options,
    queryFn: ({ signal }) => api<GroupOptions>("/groups/options", { signal }),
    enabled,
    staleTime: 60_000,
  });
}

export const GROUPS_PAGE = 30;

/** The centre's groups by name, a page at a time. */
export function useGroupList(filters: GroupListFilters) {
  return useInfiniteQuery({
    queryKey: officeGroupKeys.list(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const parts = [
        `status=${filters.status}`,
        "sort=name:asc",
        `pageSize=${GROUPS_PAGE}`,
        `page=${pageParam}`,
      ];
      if (filters.teacherId) parts.push(`teacherId=${filters.teacherId}`);
      if (filters.courseId) parts.push(`courseId=${filters.courseId}`);
      if (filters.weekdayPattern) parts.push(`weekdayPattern=${filters.weekdayPattern}`);
      if (filters.q) parts.push(`q=${encodeURIComponent(filters.q)}`);
      return api<Page<Group>>(`/groups?${parts.join("&")}`, { signal });
    },
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

/** After a group changed: its page, every list of groups, the day and the timetable. */
function useGroupChanged() {
  const client = useQueryClient();
  return (id?: string) =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.groups }),
      id ? client.invalidateQueries({ queryKey: keys.group(id) }) : null,
      client.invalidateQueries({ queryKey: ["today"] }),
      client.invalidateQueries({ queryKey: ["timetable"] }),
      client.invalidateQueries({ queryKey: ["students"] }),
    ]);
}

/** Adds a group, or changes the one with `id`. */
export function useSaveGroup(id: string | null) {
  const changed = useGroupChanged();
  return useMutation({
    mutationFn: (input: GroupInput) => {
      if (!id) return api<Group>("/groups", { method: "POST", body: input });
      const { branchId: _branchId, ...rest } = input;
      return api<Group>(`/groups/${id}`, { method: "PATCH", body: rest });
    },
    onSuccess: (group) => changed(group.id),
  });
}

/** Only the days, times and rooms: what the group's own teacher may change too (A-193). */
export function useSaveSchedule(id: string) {
  const changed = useGroupChanged();
  return useMutation({
    mutationFn: (input: ScheduleInput) =>
      api<Group>(`/groups/${id}/schedule`, { method: "PATCH", body: input }),
    onSuccess: () => changed(id),
  });
}

export type GroupAction =
  | { kind: "finish" }
  | { kind: "archive" }
  | { kind: "moveBranch"; branchId: string }
  | { kind: "changeTeacher"; fromUserId: string; to: TeacherInput }
  | { kind: "supportTeachers"; userIds: string[] };

export function useGroupAction(id: string) {
  const changed = useGroupChanged();
  return useMutation({
    mutationFn: (action: GroupAction): Promise<unknown> => {
      switch (action.kind) {
        case "finish":
          return api(`/groups/${id}/finish`, { method: "POST" });
        case "archive":
          return api(`/groups/${id}`, { method: "DELETE" });
        case "moveBranch":
          return api(`/groups/${id}/move-branch`, {
            method: "POST",
            body: { branchId: action.branchId },
          });
        case "changeTeacher":
          return api(`/groups/${id}/change-teacher`, {
            method: "POST",
            body: { fromUserId: action.fromUserId, to: action.to },
          });
        case "supportTeachers":
          return api(`/groups/${id}/support-teachers`, {
            method: "POST",
            body: { userIds: action.userIds },
          });
      }
    },
    onSuccess: () => changed(id),
  });
}

export function useGroupDaysOff(id: string, enabled = true) {
  return useQuery({
    queryKey: officeGroupKeys.daysOff(id),
    queryFn: ({ signal }) => api<GroupDayOff[]>(`/groups/${id}/day-off`, { signal }),
    enabled,
  });
}

/** A day the group skips, or (with `remove`) a day off taken back. */
export function useDayOff(id: string) {
  const changed = useGroupChanged();
  return useMutation({
    mutationFn: (change: { add: DayOffInput } | { remove: string }): Promise<unknown> =>
      "add" in change
        ? api(`/groups/${id}/day-off`, { method: "POST", body: change.add })
        : api(`/groups/${id}/day-off/${change.remove}`, { method: "DELETE" }),
    onSuccess: () => changed(id),
  });
}

/** The students of a group with their balance; `removed` adds those who left. */
export function useMembers(id: string, removed: boolean, enabled = true) {
  return useQuery({
    queryKey: officeGroupKeys.members(id, removed),
    queryFn: ({ signal }) =>
      api<Member[]>(`/groups/${id}/members${removed ? "?archived=true" : ""}`, { signal }),
    enabled,
  });
}

export function useLeaveReasons(enabled: boolean) {
  return useQuery({
    queryKey: officeGroupKeys.leaveReasons,
    queryFn: ({ signal }) => api<LeaveReason[]>("/leave-reasons", { signal }),
    enabled,
    staleTime: 60_000,
  });
}

export type MemberChange =
  | { kind: "add"; input: MemberInput }
  | { kind: "status"; membershipId: string; status: MembershipStatus }
  | { kind: "billingFrom"; membershipId: string; billingFrom: string | null }
  | { kind: "remove"; membershipId: string; reason: string | null }
  | {
      kind: "transfer";
      membershipId: string;
      groupId: string;
      joinedAt: string;
      customPrice: number | null;
      note: string | null;
      reason: string | null;
    }
  | { kind: "activateAll" };

/** Everything the office does to the students of one group. */
export function useMemberChange(groupId: string) {
  const changed = useGroupChanged();
  return useMutation({
    mutationFn: (change: MemberChange): Promise<unknown> => {
      switch (change.kind) {
        case "add":
          return api(`/groups/${groupId}/members`, { method: "POST", body: change.input });
        case "status":
          return api(`/memberships/${change.membershipId}`, {
            method: "PATCH",
            body: { status: change.status },
          });
        case "billingFrom":
          return api(`/memberships/${change.membershipId}`, {
            method: "PATCH",
            body: { billingFrom: change.billingFrom },
          });
        case "remove":
          return api(`/memberships/${change.membershipId}/remove`, {
            method: "POST",
            body: { reason: change.reason },
          });
        case "transfer": {
          const { kind: _kind, membershipId, ...body } = change;
          return api(`/memberships/${membershipId}/transfer`, { method: "POST", body });
        }
        case "activateAll":
          return api<{ activated: number }>(`/groups/${groupId}/activate-members`, {
            method: "POST",
          });
      }
    },
    onSuccess: () => changed(groupId),
  });
}

/** Puts a student the centre already has into a group, from the student's own page. */
export function useAddToGroup() {
  const changed = useGroupChanged();
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: MemberInput }) =>
      api(`/groups/${groupId}/members`, { method: "POST", body: input }),
    onSuccess: (_result, { groupId }) => changed(groupId),
  });
}

/** One room's or one teacher's week; null lets the server choose (the first room, own lessons). */
export function useTimetable(
  mode: TimetableMode | null,
  branchId: string | null,
  id: string | null,
) {
  return useQuery({
    queryKey: officeGroupKeys.timetable(mode, branchId, id),
    queryFn: ({ signal }) => {
      const parts: string[] = [];
      if (mode) parts.push(`mode=${mode}`);
      if (branchId) parts.push(`branchId=${branchId}`);
      if (id) parts.push(`id=${id}`);
      return api<Timetable>(`/groups/timetable${parts.length ? `?${parts.join("&")}` : ""}`, {
        signal,
      });
    },
    placeholderData: (previous) => previous,
  });
}
