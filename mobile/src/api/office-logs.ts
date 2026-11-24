import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { ApiError, api } from "@/lib/api";

import type { CallRow, SmsLogRow, SmsStatus } from "./office-student-page";
import type { Payment } from "./office-students";
import type { Page } from "./types";

/*
 * The centre's logs for the office (A-246): the site's Settings → Login log,
 * Action log, Sent SMS, Calls and Payments. Lists to read, newest first,
 * thirty rows at a time; nothing here changes anything.
 */

export const LOG_PAGE = 30;

/** From and To as ISO days; null is "not narrowed". */
export interface LogDays {
  from: string | null;
  to: string | null;
}

export interface LoginRow {
  id: string;
  /** Null when the account has since been removed. */
  userName: string | null;
  phone: string;
  success: boolean;
  ip: string | null;
  createdAt: string;
}

export interface LoginFilters extends LogDays {
  success: "true" | "false" | null;
  q: string;
}

export interface ActionRow {
  id: string;
  /** Such as "payment.create"; the words are under logs.actions.names. */
  action: string;
  /** Such as "Payment"; the words are under logs.actions.entities. */
  entity: string;
  entityId: string;
  /** Null when the system did it. */
  actorName: string | null;
  actorPhone: string | null;
  branchName: string | null;
  /** The student the action is about, with their phone, when there is one. */
  subjectName: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/** What the action log's "Type" filter offers, as on the site. */
export const ACTION_ENTITIES = [
  "Payment",
  "Refund",
  "Discount",
  "Student",
  "GroupMembership",
  "Group",
  "Lesson",
  "Lead",
  "Exam",
  "SmsMessage",
] as const;

export interface ActionFilters extends LogDays {
  entity: string | null;
  actorId: string | null;
  q: string;
}

export interface SmsLogEntry extends SmsLogRow {
  studentId: string | null;
  sentAt: string | null;
}

/** Who sent a message: the system, or a staff member by id. */
export const SENT_BY_SYSTEM = "system";

export interface SmsLogFilters extends LogDays {
  status: SmsStatus | null;
  sentBy: string | null;
  q: string;
}

export interface CallEntry extends CallRow {
  studentId: string | null;
  studentName: string | null;
}

export interface CallFilters extends LogDays {
  direction: CallRow["direction"] | null;
  status: CallRow["status"] | null;
  q: string;
}

export interface PaymentLogFilters extends LogDays {
  paymentMethodId: string | null;
  receivedById: string | null;
}

/** A page of payments and the sum of every payment the filters let through. */
export type PaymentsPage = Page<Payment> & { totalAmount: number };

export interface LogPerson {
  id: string;
  fullName: string;
}

export const logKeys = {
  logins: (filters: LoginFilters) => ["logs", "logins", filters] as const,
  actions: (filters: ActionFilters) => ["logs", "actions", filters] as const,
  sms: (filters: SmsLogFilters) => ["logs", "sms", filters] as const,
  calls: (filters: CallFilters) => ["logs", "calls", filters] as const,
  // Under "payments": taking, refunding or re-sending a fiscal receipt asks for it again.
  payments: (filters: PaymentLogFilters) => ["payments", "log", filters] as const,
  actors: ["logs", "actors"] as const,
  cashiers: ["logs", "cashiers"] as const,
};

/** The filters as the address's query: only the ones that are set. */
function queryOf(filters: object, sort: string, page: number): string {
  const parts = [`sort=${sort}`, `pageSize=${LOG_PAGE}`, `page=${page}`];
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value) parts.push(`${key}=${encodeURIComponent(value)}`);
  }
  return parts.join("&");
}

/** One log, a page at a time; the rows on screen stay while other filters are asked for. */
function useLog<T extends Page<unknown>>(
  queryKey: readonly unknown[],
  path: string,
  filters: object,
  sort = "createdAt:desc",
) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<T>(`${path}?${queryOf(filters, sort, pageParam)}`, { signal }),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

export function useLoginLog(filters: LoginFilters) {
  return useLog<Page<LoginRow>>(logKeys.logins(filters), "/logs/logins", filters);
}

export function useActionLog(filters: ActionFilters) {
  return useLog<Page<ActionRow>>(logKeys.actions(filters), "/logs/actions", filters);
}

export function useSmsLog(filters: SmsLogFilters) {
  return useLog<Page<SmsLogEntry>>(logKeys.sms(filters), "/logs/sms", filters);
}

export function useCallLog(filters: CallFilters) {
  return useLog<Page<CallEntry>>(logKeys.calls(filters), "/calls", filters, "startedAt:desc");
}

export function usePaymentsLog(filters: PaymentLogFilters) {
  return useLog<PaymentsPage>(logKeys.payments(filters), "/payments", filters, "paidAt:desc");
}

/**
 * The staff who appear in the action log: the choices of its "Staff" filter
 * and of the SMS log's "Sent by". A server from before A-246 does not have
 * this list; the answer is then empty and the screens leave the filter out.
 */
export function useLogActors() {
  return useQuery({
    queryKey: logKeys.actors,
    queryFn: async ({ signal }) => {
      try {
        return await api<LogPerson[]>("/logs/actors", { signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return [];
        throw error;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Who may have taken a payment: the staff, by name. Only for people who may see the staff. */
export function useCashiers(enabled: boolean) {
  return useQuery({
    queryKey: logKeys.cashiers,
    queryFn: async ({ signal }) =>
      (await api<Page<LogPerson>>("/staff?sort=fullName:asc&pageSize=100", { signal })).items,
    enabled,
    staleTime: 5 * 60_000,
  });
}
