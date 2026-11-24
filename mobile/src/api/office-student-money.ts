import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * A student's groups and money for the office (A-241): the lesson calendar of
 * a membership, a month's fee split into parts, back to the leads board,
 * refunds, balance corrections and the payments carried over from the system
 * the centre used before. The calls the site's student page makes.
 */

export interface CalendarDay {
  /** An ISO day. */
  date: string;
  status: "PRESENT" | "ABSENT" | "EXCUSED" | "NOT_MARKED" | "UPCOMING";
  /** Whether the student's money covered this lesson. */
  paid: boolean;
}

export interface MembershipCalendar {
  /** The first day of the month shown. */
  month: string;
  /** Every month the membership has lessons in, oldest first. */
  months: string[];
  days: CalendarDay[];
  counts: { present: number; absent: number; excused: number; notMarked: number };
}

export interface InstalmentPart {
  id: string;
  month: string;
  dueDate: string;
  amount: number;
  /** What is still unpaid of this part. */
  remaining: number;
  paid: boolean;
}

export interface InstalmentPlan {
  membershipId: string;
  groupName: string;
  /** The month the plan is for. */
  month: string;
  /** Months that may be split: from the first unpaid one to the next one. */
  months: string[];
  /** The month's fee. */
  amount: number;
  /** Empty when the month is not split yet. */
  parts: InstalmentPart[];
  balance: number;
}

export const ADJUSTMENT_KINDS = ["OPENING", "CORRECTION"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export interface Adjustment {
  id: string;
  membershipId: string;
  groupName: string;
  /** Negative: the student owes this much more. Positive: has this much more. */
  amount: number;
  kind: AdjustmentKind;
  date: string;
  comment: string | null;
  createdByName: string | null;
}

export interface AdjustmentInput {
  membershipId: string;
  amount: number;
  kind: AdjustmentKind;
  date: string;
  comment: string | null;
}

/** A payment made in the system the centre used before; it counts in no balance. */
export interface LegacyPayment {
  id: string;
  groupName: string | null;
  amount: number;
  paidAt: string;
  method: string | null;
  comment: string | null;
}

export const studentMoneyKeys = {
  calendar: (membershipId: string, month: string | null) =>
    ["students", "calendar", membershipId, month] as const,
  instalments: (membershipId: string, month: string | null) =>
    ["students", "instalments", membershipId, month] as const,
  adjustments: (studentId: string) => ["students", studentId, "adjustments"] as const,
  legacy: (studentId: string) => ["students", studentId, "legacy-payments"] as const,
};

/** One month of a membership's lessons; null asks for the month the server picks (this one). */
export function useMembershipCalendar(membershipId: string, month: string | null) {
  return useQuery({
    queryKey: studentMoneyKeys.calendar(membershipId, month),
    queryFn: ({ signal }) =>
      api<MembershipCalendar>(
        `/memberships/${membershipId}/calendar${month ? `?month=${month}` : ""}`,
        { signal },
      ),
    placeholderData: (previous) => previous,
  });
}

/** The split of one month's fee, or what there is to split; null is the first unpaid month. */
export function useInstalmentPlan(membershipId: string | null, month: string | null) {
  return useQuery({
    queryKey: studentMoneyKeys.instalments(membershipId ?? "", month),
    queryFn: ({ signal }) =>
      api<InstalmentPlan>(
        `/memberships/${membershipId}/instalments${month ? `?month=${month}` : ""}`,
        { signal },
      ),
    enabled: membershipId !== null,
    gcTime: 0,
  });
}

/** Balances, debts and the home's figures follow the money. */
function useMoneyChanged() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["students"] }),
      client.invalidateQueries({ queryKey: ["payments"] }),
      client.invalidateQueries({ queryKey: ["office"] }),
      client.invalidateQueries({ queryKey: ["groups"] }),
    ]);
}

/** Splits a month's fee into two or three parts, or with `parts: null` removes the split. */
export function useInstalmentsStep(membershipId: string | null) {
  const changed = useMoneyChanged();
  return useMutation({
    mutationFn: (step: {
      month: string;
      parts: Array<{ dueDate: string; amount: number }> | null;
    }) =>
      step.parts
        ? api<unknown>(`/memberships/${membershipId}/instalments`, { method: "PUT", body: step })
        : api<unknown>(`/memberships/${membershipId}/instalments?month=${step.month}`, {
            method: "DELETE",
          }),
    onSuccess: changed,
  });
}

/** "Return to leads": the student leaves the group today and appears on the leads board. */
export function useReturnToLeads() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { membershipId: string; reason: string | null }) =>
      api<unknown>(`/memberships/${input.membershipId}/to-lead`, {
        method: "POST",
        body: { reason: input.reason },
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["students"] }),
        client.invalidateQueries({ queryKey: ["groups"] }),
        client.invalidateQueries({ queryKey: ["leads"] }),
        client.invalidateQueries({ queryKey: ["today"] }),
      ]),
  });
}

/** Gives part of a payment back. */
export function useRefund() {
  const changed = useMoneyChanged();
  return useMutation({
    mutationFn: (input: { paymentId: string; amount: number; reason: string | null }) =>
      api<unknown>(`/payments/${input.paymentId}/refund`, {
        method: "POST",
        body: { amount: input.amount, reason: input.reason },
      }),
    onSuccess: changed,
  });
}

export function useStudentAdjustments(studentId: string, enabled = true) {
  return useQuery({
    queryKey: studentMoneyKeys.adjustments(studentId),
    queryFn: ({ signal }) => api<Adjustment[]>(`/students/${studentId}/adjustments`, { signal }),
    enabled,
  });
}

/** Records an opening balance or a correction, or with an id takes one back. */
export function useAdjustmentStep() {
  const changed = useMoneyChanged();
  return useMutation({
    mutationFn: (step: { do: "add"; input: AdjustmentInput } | { do: "remove"; id: string }) =>
      step.do === "add"
        ? api<unknown>("/adjustments", { method: "POST", body: step.input })
        : api<unknown>(`/adjustments/${step.id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

/**
 * The payments of the system before. The call is new with A-241: a server
 * that does not have it yet answers "not found", and the page then shows no
 * such list, so it is asked once.
 */
export function useLegacyPayments(studentId: string, enabled = true) {
  return useQuery({
    queryKey: studentMoneyKeys.legacy(studentId),
    queryFn: ({ signal }) =>
      api<LegacyPayment[]>(`/students/${studentId}/payment-history`, { signal }),
    enabled,
    retry: false,
  });
}

export function useRemoveLegacyPayment(studentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<unknown>(`/payment-history/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: studentMoneyKeys.legacy(studentId) }),
  });
}

/** Sends a payment's fiscal receipt again after it failed. */
export function useRetryFiscal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      api<unknown>(`/payments/${paymentId}/fiscal`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["payments"] }),
  });
}
