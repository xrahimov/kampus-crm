import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Page } from "./types";

/*
 * Debts and the cash desk for the office (A-236): who owes what and what was
 * said to them, and the cashiers' day closes. The same calls the site's
 * Debtors and Cash desk pages make.
 */

/* ----- debts ----- */

export const DEBT_FILTERS = ["ACTIVE", "OPEN", "PROMISED", "NEEDS_CALL", "CLOSED", "ALL"] as const;
export type DebtFilter = (typeof DEBT_FILTERS)[number];
export const DEBT_CHANNELS = ["CALL", "TELEGRAM", "SMS", "VISIT", "NOTE"] as const;
export type DebtChannel = (typeof DEBT_CHANNELS)[number];
/** What a person may pick when they write down a contact. */
export const DEBT_STAFF_OUTCOMES = [
  "NO_ANSWER",
  "PROMISED",
  "REFUSED",
  "WRONG_NUMBER",
  "OTHER",
] as const;
export type DebtStaffOutcome = (typeof DEBT_STAFF_OUTCOMES)[number];
/** Every outcome a line of the history can carry; the last two are written by the server. */
export type DebtOutcome = DebtStaffOutcome | "PROMISE_KEPT" | "PROMISE_BROKEN";

/** The orders the list can be put in: the site's sortable columns, each in its useful direction. */
export const DEBT_SORTS = {
  overdue: "openedAt:asc",
  amount: "amount:desc",
  promise: "promisedAt:asc",
  lastContact: "lastContactAt:asc",
  student: "fullName:asc",
} as const;
export type DebtSort = keyof typeof DEBT_SORTS;

export interface DebtCase {
  id: string;
  studentId: string;
  studentName: string;
  phone: string | null;
  parentPhone: string | null;
  branchId: string;
  branchName: string;
  groups: Array<{ membershipId: string; groupId: string; groupName: string; balance: number }>;
  /** What the student owes in this branch, as a positive sum. */
  amount: number;
  openedAt: string;
  daysOverdue: number;
  status: "OPEN" | "PROMISED" | "CLOSED";
  promisedAt: string | null;
  promisedAmount: number | null;
  /** The promised day has passed and the case is open again. */
  promiseMissed: boolean;
  brokenPromises: number;
  lastContactAt: string | null;
  lastChannel: DebtChannel | null;
  lastOutcome: DebtOutcome | null;
  lastContactBy: string | null;
  /** The managers were asked to call and nobody has written down a contact since. */
  needsCall: boolean;
  telegramAt: string | null;
  smsAt: string | null;
  closedAt: string | null;
  closedReason: "PAID" | "PROMISE_KEPT" | "LEFT" | null;
  hasTelegram: boolean;
}

export interface DebtList extends Page<DebtCase> {
  summary: { debtors: number; amount: number; promised: number; needsCall: number };
}

export interface DebtContact {
  id: string;
  channel: DebtChannel;
  outcome: DebtOutcome | null;
  promisedAt: string | null;
  promisedAmount: number | null;
  note: string | null;
  /** Written by the server (a reminder sent, a promise kept or missed). */
  auto: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface DebtContactInput {
  channel: DebtChannel;
  outcome: DebtStaffOutcome | null;
  promisedAt: string | null;
  promisedAmount: number | null;
  note: string | null;
}

export interface DebtListFilters {
  status: DebtFilter;
  branchId: string | null;
  q: string;
  sort: DebtSort;
}

export const moneyKeys = {
  debts: ["debts"] as const,
  debtList: (filters: DebtListFilters) => ["debts", "list", filters] as const,
  debtContacts: (id: string) => ["debts", "contacts", id] as const,
  cash: ["cashdesk"] as const,
  cashList: (filters: CashFilters) => ["cashdesk", "list", filters] as const,
  cashDay: (branchId: string, date: string) => ["cashdesk", "day", branchId, date] as const,
};

export const DEBTS_PAGE = 30;

export function useDebtList(filters: DebtListFilters) {
  return useInfiniteQuery({
    queryKey: moneyKeys.debtList(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const parts = [
        `sort=${DEBT_SORTS[filters.sort]}`,
        `pageSize=${DEBTS_PAGE}`,
        `page=${pageParam}`,
      ];
      if (filters.status !== "ACTIVE") parts.push(`status=${filters.status}`);
      if (filters.branchId) parts.push(`branchId=${filters.branchId}`);
      if (filters.q) parts.push(`q=${encodeURIComponent(filters.q)}`);
      return api<DebtList>(`/debts?${parts.join("&")}`, { signal });
    },
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

/** What was said to a debtor and what the server did, newest first. */
export function useDebtContacts(id: string | null) {
  return useQuery({
    queryKey: moneyKeys.debtContacts(id ?? ""),
    queryFn: ({ signal }) => api<DebtContact[]>(`/debts/${id}/contacts`, { signal }),
    enabled: id !== null,
  });
}

export function useLogDebtContact(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DebtContactInput) =>
      api<DebtContact>(`/debts/${id}/contacts`, { method: "POST", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: moneyKeys.debts }),
  });
}

/** Sends the debtor a reminder in Telegram; `queued` is how many chats it went to. */
export function useDebtReminder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ queued: number }>(`/debts/${id}/remind`, { method: "POST" }),
    onSuccess: (sent) =>
      sent.queued > 0 ? client.invalidateQueries({ queryKey: moneyKeys.debts }) : undefined,
  });
}

/* ----- the cash desk ----- */

export interface CashMethodTotal {
  methodId: string | null;
  name: string | null;
  isCash: boolean;
  payments: number;
  /** Other income paid with this type. */
  income: number;
  refunds: number;
  expenses: number;
  /** payments + income − refunds − expenses. */
  net: number;
}

export interface CashDay {
  branchId: string;
  branchName: string;
  cashierId: string;
  cashierName: string;
  date: string;
  methods: CashMethodTotal[];
  paymentsCount: number;
  /** Payments received over every type. */
  received: number;
  /** The net of the types marked as cash. */
  expectedCash: number;
  /** False when no payment type is marked as cash: expected cash is then always zero. */
  hasCashMethod: boolean;
}

export interface CashClose extends CashDay {
  id: string;
  countedCash: number;
  difference: number;
  note: string | null;
  acceptedById: string | null;
  acceptedByName: string | null;
  acceptedAt: string | null;
}

/** A day as it stands, and its close if it was closed before. */
export interface CashDayPreview extends CashDay {
  existing: {
    id: string;
    countedCash: number;
    difference: number;
    acceptedAt: string | null;
  } | null;
}

export interface CashCloseList {
  items: CashClose[];
  totals: { expectedCash: number; countedCash: number; difference: number; pending: number };
}

export interface CashFilters {
  branchId: string | null;
  year: number;
  /** Null is the whole year. */
  month: number | null;
}

export interface CashCloseInput {
  branchId: string;
  date: string;
  countedCash: number;
  note: string | null;
}

export function useCashCloses(filters: CashFilters) {
  return useQuery({
    queryKey: moneyKeys.cashList(filters),
    queryFn: ({ signal }) => {
      const parts = [`year=${filters.year}`];
      if (filters.month) parts.push(`month=${filters.month}`);
      if (filters.branchId) parts.push(`branchId=${filters.branchId}`);
      return api<CashCloseList>(`/cashdesk?${parts.join("&")}`, { signal });
    },
    placeholderData: (previous) => previous,
  });
}

/** What the cashier recorded on a day in a branch, by payment type. */
export function useCashDay(branchId: string | null, date: string | null, enabled: boolean) {
  return useQuery({
    queryKey: moneyKeys.cashDay(branchId ?? "", date ?? ""),
    queryFn: ({ signal }) =>
      api<CashDayPreview>(`/cashdesk/preview?branchId=${branchId}&date=${date}`, { signal }),
    enabled: enabled && branchId !== null && date !== null,
    // The figures move with every payment: always the day as it stands now, also when the
    // sheet is opened a second time.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCloseDay() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CashCloseInput) =>
      api<CashClose>("/cashdesk", { method: "POST", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: moneyKeys.cash }),
  });
}

/** The hand-over: a manager accepts a cashier's close. */
export function useAcceptClose() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<CashClose>(`/cashdesk/${id}/accept`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: moneyKeys.cash }),
  });
}
