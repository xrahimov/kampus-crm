import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Page } from "./types";

/*
 * The office's side of the app (A-230): the centre's home with its numbers,
 * the bell, and the search. The same calls the site's home page, bell and
 * search box make; the server decides what each person may see.
 */

/** The twelve numbers of the home page; `utilisation` only for people with reports. */
export interface DashboardKpis {
  activeLeads: number;
  groups: number;
  remainingDebt: number;
  debtors: number;
  dueSoon: number;
  activeStudents: number;
  studentsInGroups: number;
  trial: number;
  leftThisMonth: number;
  teachers: number;
  exams: number;
  newAdmissions: number;
  utilisation: number | null;
}

export type SetupStepKey =
  | "branches"
  | "courses"
  | "rooms"
  | "staff"
  | "groups"
  | "students"
  | "paymentMethods"
  | "telegram"
  | "onlinePayments";

export interface SetupChecklist {
  steps: Array<{ key: SetupStepKey; done: boolean; count: number | null; href: string }>;
  done: number;
  total: number;
  shown: boolean;
}

export interface RevenueForecast {
  /** "YYYY-MM". */
  month: string;
  nextMonth: string;
  current: { expected: number; collected: number; percent: number };
  next: { expected: number; collected: number };
  memberships: number;
  months: Array<{
    month: string;
    kind: "past" | "current" | "next";
    expected: number;
    collected: number;
  }>;
  byCourse: ForecastSplit[];
  byBranch: ForecastSplit[];
}

export interface ForecastSplit {
  id: string | null;
  name: string | null;
  expected: number;
  collected: number;
  nextExpected: number;
}

export interface FinanceOverview {
  income: number;
  studentIncome: number;
  otherIncome: number;
  expenses: number;
  profit: number;
  activeBalance: number;
  averagePayment: number;
  paymentCount: number;
  byMethod: Array<{ id: string | null; name: string | null; amount: number }>;
  /** Twelve months of the chosen year. */
  yearly: Array<{ month: string; income: number; expenses: number }>;
}

export interface RoomBlock {
  groupId: string;
  groupName: string;
  courseName: string;
  color: string | null;
  teacherName: string | null;
  startTime: string;
  endTime: string;
}

export interface RoomSchedule {
  /** Monday = 1 … Sunday = 7. */
  weekday: number;
  workStart: string;
  workEnd: string;
  rooms: Array<{ id: string; name: string; capacity: number; blocks: RoomBlock[] }>;
  /** Groups whose lesson has no room. */
  unassigned: RoomBlock[];
}

export type NotificationKind =
  | "PAYMENT"
  | "LEAD"
  | "DEBTORS"
  | "BIRTHDAY"
  | "DEBT_TASK"
  | "DEBT_PROMISE_BROKEN"
  | "ABSENCES"
  | "LEAD_FOLLOW_UP"
  | "LEAD_MESSAGE"
  | "JOIN_REQUEST"
  | "ACCOUNT_DELETION";

export interface StaffNotification {
  id: string;
  kind: NotificationKind;
  params: Record<string, string | number>;
  /** The site's page it is about, without the language: "/students/abc". */
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export type NotificationsPage = Page<StaffNotification> & { unread: number };

export interface SearchResults {
  students: Array<{ id: string; fullName: string; phone: string | null; groups: string[] }>;
  leads: Array<{
    id: string;
    fullName: string;
    phone: string | null;
    boardId: string;
    columnName: string;
  }>;
  groups: Array<{ id: string; name: string; courseName: string; teacherName: string | null }>;
}

export const officeKeys = {
  kpis: (branchId: string | null) => ["office", "kpis", branchId] as const,
  setup: ["office", "setup"] as const,
  forecast: (branchId: string | null) => ["office", "forecast", branchId] as const,
  finance: (period: FinancePeriod) =>
    ["office", "finance", period.year, period.month, period.methodId, period.branchId] as const,
  rooms: (weekday: number | null, branchId: string | null) =>
    ["office", "rooms", weekday ?? "today", branchId] as const,
  salary: (month: string | null) => ["office", "salary", month ?? "now"] as const,
  notifications: (unreadOnly: boolean) => ["notifications", unreadOnly ? "unread" : "all"] as const,
  unread: ["notifications", "count"] as const,
  search: (q: string) => ["office", "search", q] as const,
};

/** `?a=1&b=2` of the values that are there. */
function query(values: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** The home's numbers; `branchId` null is every branch the person has. */
export function useDashboardKpis(branchId: string | null, enabled = true) {
  return useQuery({
    queryKey: officeKeys.kpis(branchId),
    queryFn: ({ signal }) =>
      api<DashboardKpis>(`/dashboard/kpis${query({ branchId })}`, { signal }),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** The setup checklist: only for people who may change the centre's settings. */
export function useSetupChecklist(enabled: boolean) {
  return useQuery({
    queryKey: officeKeys.setup,
    queryFn: ({ signal }) => api<SetupChecklist | null>("/dashboard/setup", { signal }),
    enabled,
  });
}

/** Hides the checklist, as its button on the site does; Settings → General brings it back. */
export function useHideSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api("/dashboard/setup", { method: "PATCH", body: { shown: false } }),
    onSuccess: () => client.invalidateQueries({ queryKey: officeKeys.setup }),
  });
}

export function useRevenueForecast(branchId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: officeKeys.forecast(branchId),
    queryFn: ({ signal }) =>
      api<RevenueForecast>(`/dashboard/forecast${query({ branchId })}`, { signal }),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** A year, or one month of it (1 to 12), of one payment type or all, of one branch or all. */
export interface FinancePeriod {
  year: number;
  month: number | null;
  methodId: string | null;
  branchId: string | null;
}

export function useFinanceOverview(period: FinancePeriod, enabled: boolean) {
  return useQuery({
    queryKey: officeKeys.finance(period),
    queryFn: ({ signal }) =>
      api<FinanceOverview>(
        `/dashboard/finance${query({
          year: period.year,
          month: period.month,
          paymentMethodId: period.methodId,
          branchId: period.branchId,
        })}`,
        { signal },
      ),
    enabled,
    // The cards stay while another month loads.
    placeholderData: (previous) => previous,
  });
}

/** Which group is in which room on a weekday; null asks for the server's today. */
export function useRoomSchedule(weekday: number | null, branchId: string | null, enabled = true) {
  return useQuery({
    queryKey: officeKeys.rooms(weekday, branchId),
    queryFn: ({ signal }) =>
      api<RoomSchedule>(`/dashboard/schedule${query({ step: 60, weekday, branchId })}`, {
        signal,
      }),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export type SalaryMethod = "PERCENT" | "MONTHLY" | "PER_LESSON" | "PER_STUDENT";

/** "My salary" (A-127): the person's own month, computed the payroll's way. */
export interface MySalary {
  /** "YYYY-MM". */
  month: string;
  paid: boolean;
  method: SalaryMethod | null;
  rate: number | null;
  line: {
    fixed: number;
    percent: number;
    perLesson: number;
    perStudent: number;
    bonus: number;
    penalty: number;
    advance: number;
    net: number;
    details: Array<{
      groupId: string;
      groupName: string;
      shareType: string;
      shareValue: number;
      students: number;
      lessons: number;
      coursePrice: number;
      amount: number;
    }>;
  };
  official: {
    status: "MODERATION" | "APPROVED";
    net: number;
    approvedAt: string | null;
    approvedBy: string | null;
  } | null;
  entries: Array<{
    id: string;
    type: "BONUS" | "PENALTY" | "ADVANCE";
    date: string;
    amount: number;
    comment: string | null;
  }>;
  history: Array<{ month: string; net: number; status: "MODERATION" | "APPROVED" }>;
}

/** The person's pay of a month ("YYYY-MM"); null is the running month. */
export function useMySalary(month: string | null) {
  return useQuery({
    queryKey: officeKeys.salary(month),
    queryFn: ({ signal }) => api<MySalary>(`/account/salary${query({ month })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

/** The bell's list, newest first, a page at a time. */
export function useNotifications(unreadOnly: boolean) {
  return useInfiniteQuery({
    queryKey: officeKeys.notifications(unreadOnly),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<NotificationsPage>(`/notifications?page=${pageParam}${unreadOnly ? "&unread=1" : ""}`, {
        signal,
      }),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
}

/** How many notifications wait unread: the number on the bell. Asked again every minute. */
export function useUnreadCount() {
  return useQuery({
    queryKey: officeKeys.unread,
    queryFn: async ({ signal }) =>
      (await api<NotificationsPage>("/notifications?unread=1", { signal })).unread,
    refetchInterval: 60_000,
  });
}

/** Marks some notifications read, or all of them. */
export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (what: { ids: string[] } | { all: true }) =>
      api("/notifications/read", { method: "POST", body: what }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** Students, groups and leads by a few letters of the name; nothing is asked under two. */
export function useSearch(q: string) {
  return useQuery({
    queryKey: officeKeys.search(q),
    queryFn: ({ signal }) => api<SearchResults>(`/search?q=${encodeURIComponent(q)}`, { signal }),
    enabled: q.length >= 2,
    placeholderData: (previous) => previous,
  });
}
