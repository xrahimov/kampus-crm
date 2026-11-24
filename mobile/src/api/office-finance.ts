import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * Finance for the office (A-237): the key figures, the month's plan, expenses
 * and income by category, advances, marketing, bonuses, fines and
 * investments, and the payroll of a month. The calls the site's Finance pages
 * make, and one made for the app: the sums written on the page's links.
 */

export const FINANCE_ENTRY_TYPES = [
  "EXPENSE",
  "INCOME",
  "ADVANCE",
  "MARKETING",
  "BONUS",
  "PENALTY",
  "INVESTMENT",
] as const;
export type FinanceEntryType = (typeof FINANCE_ENTRY_TYPES)[number];
export type FinanceKind = "EXPENSE" | "INCOME";

/** Entries that must name a staff member. */
export const STAFF_ENTRY_TYPES: readonly FinanceEntryType[] = ["ADVANCE", "BONUS", "PENALTY"];
/** Entries that live in a category. */
export const CATEGORY_ENTRY_TYPES: readonly FinanceEntryType[] = ["EXPENSE", "INCOME"];

/** The site's addresses under /finance for the entries that have no category. */
export const FINANCE_SECTIONS = {
  advance: "ADVANCE",
  marketing: "MARKETING",
  bonus: "BONUS",
  penalty: "PENALTY",
  investment: "INVESTMENT",
} as const;
export type FinanceSection = keyof typeof FINANCE_SECTIONS;

/** A year, or one month of it (1 to 12), of one branch or all, of one payment type or all. */
export interface FinanceFilters {
  year: number;
  month: number | null;
  branchId: string | null;
  paymentMethodId: string | null;
}

export interface FinanceFigures {
  income: number;
  studentIncome: number;
  otherIncome: number;
  expenses: number;
  profit: number;
  activeBalance: number;
  investments: number;
  ltv: number;
  cac: number;
  marketingEfficiency: number;
  averagePayment: number;
  paymentCount: number;
  byMethod: Array<{ id: string | null; name: string | null; amount: number }>;
  /** Twelve months of the chosen year. */
  yearly: Array<{ month: string; income: number; expenses: number }>;
}

export interface FinancePlan {
  month: string;
  effective: boolean;
  plan: number;
  achieved: number;
  expected: number;
  achievedPercent: number;
  activeDebt: number;
  debtors: number;
  prepayments: number;
}

export interface FinanceCategory {
  id: string;
  kind: FinanceKind;
  name: string;
  /** Total of the category's entries in the period asked for. */
  total: number;
  count: number;
}

export interface FinanceTotals {
  byType: Record<FinanceEntryType, number>;
  cashCloses: { count: number; pending: number };
}

export interface FinanceOptions {
  staff: Array<{ id: string; fullName: string }>;
  paymentMethods: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; kind: FinanceKind; name: string }>;
  branches: Array<{ id: string; name: string }>;
}

export interface FinanceEntry {
  id: string;
  type: FinanceEntryType;
  branchId: string;
  branchName: string;
  categoryId: string | null;
  categoryName: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  amount: number;
  date: string;
  comment: string | null;
  staffId: string | null;
  staffName: string | null;
  studentId: string | null;
  studentName: string | null;
  counterparty: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface FinanceEntryList {
  items: FinanceEntry[];
  total: number;
}

export interface FinanceEntryInput {
  type: FinanceEntryType;
  branchId: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  amount: number;
  date: string;
  comment: string | null;
  staffId: string | null;
  studentId: string | null;
  counterparty: string | null;
}

export interface EntryFilters extends FinanceFilters {
  type: FinanceEntryType;
  categoryId: string | null;
  staffId: string | null;
}

export interface FinanceStudent {
  id: string;
  fullName: string;
  phone: string | null;
  branchId: string;
}

/* ----- payroll ----- */

export interface PayrollSums {
  fixed: number;
  percent: number;
  perLesson: number;
  perStudent: number;
  bonus: number;
  penalty: number;
  penaltyCount: number;
  advance: number;
  net: number;
}

export interface PayrollGroupDetail {
  groupId: string;
  groupName: string;
  shareType: "PERCENT" | "PER_LESSON" | "PER_STUDENT";
  shareValue: number;
  coursePrice: number;
  students: number;
  lessons: number;
  amount: number;
}

export interface PayrollLine extends PayrollSums {
  id: string;
  userId: string;
  fullName: string;
  roleName: string;
  details: PayrollGroupDetail[];
  status: "MODERATION" | "APPROVED";
  approvedByName: string | null;
  approvedAt: string | null;
}

export type PayrollStatus = "DRAFT" | "SAVED";

/** A computed month with its totals; `month` is "2026-11". */
export interface PayrollSummary {
  id: string;
  month: string;
  status: PayrollStatus;
  computedAt: string;
  staffCount: number;
  approvedCount: number;
  totals: PayrollSums;
}

export interface PayrollRun extends PayrollSummary {
  lines: PayrollLine[];
}

function query(values: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export const financeKeys = {
  all: ["finance"] as const,
  figures: (filters: FinanceFilters) => ["finance", "figures", filters] as const,
  plan: (branchId: string | null, year: number, month: number, effective: boolean) =>
    ["finance", "plan", branchId, year, month, effective] as const,
  categories: (branchId: string | null, year: number, month: number | null) =>
    ["finance", "categories", branchId, year, month] as const,
  category: (id: string) => ["finance", "category", id] as const,
  totals: (branchId: string | null, year: number, month: number | null) =>
    ["finance", "totals", branchId, year, month] as const,
  options: ["finance", "options"] as const,
  entries: (filters: EntryFilters) => ["finance", "entries", filters] as const,
  students: (q: string) => ["finance-students", q] as const,
  payroll: ["payroll"] as const,
  payrollRuns: ["payroll", "runs"] as const,
  payrollRun: (month: string) => ["payroll", "run", month] as const,
};

export function useFinanceFigures(filters: FinanceFilters) {
  return useQuery({
    queryKey: financeKeys.figures(filters),
    queryFn: ({ signal }) =>
      api<FinanceFigures>(`/finance/overview${query({ ...filters })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

/** The plan of one month: what its charges add up to against what was paid. */
export function useFinancePlan(
  branchId: string | null,
  year: number,
  month: number,
  effective: boolean,
) {
  return useQuery({
    queryKey: financeKeys.plan(branchId, year, month, effective),
    queryFn: ({ signal }) =>
      api<FinancePlan>(
        `/finance/plan${query({ branchId, year, month, effective: effective ? "1" : "0" })}`,
        { signal },
      ),
    placeholderData: (previous) => previous,
  });
}

export function useFinanceCategories(branchId: string | null, year: number, month: number | null) {
  return useQuery({
    queryKey: financeKeys.categories(branchId, year, month),
    queryFn: ({ signal }) =>
      api<FinanceCategory[]>(`/finance/categories${query({ branchId, year, month })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

/** One category by its id: its name and kind, for the page of its entries. */
export function useFinanceCategory(id: string | null) {
  return useQuery({
    queryKey: financeKeys.category(id ?? ""),
    queryFn: ({ signal }) =>
      api<{ id: string; kind: FinanceKind; name: string }>(`/finance/categories/${id}`, { signal }),
    enabled: id !== null,
  });
}

/**
 * The sums on the page's links. A server that does not have this call yet
 * (it came with A-237) answers "not found": the links then show without sums.
 */
export function useFinanceTotals(branchId: string | null, year: number, month: number | null) {
  return useQuery({
    queryKey: financeKeys.totals(branchId, year, month),
    queryFn: ({ signal }) =>
      api<FinanceTotals>(`/finance/totals${query({ branchId, year, month })}`, { signal }),
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function useFinanceOptions(enabled = true) {
  return useQuery({
    queryKey: financeKeys.options,
    queryFn: ({ signal }) => api<FinanceOptions>("/finance/options", { signal }),
    enabled,
  });
}

export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: FinanceKind; name: string }) =>
      api<FinanceCategory>("/finance/categories", { method: "POST", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: financeKeys.all }),
  });
}

export function useFinanceEntries(filters: EntryFilters, enabled = true) {
  return useQuery({
    queryKey: financeKeys.entries(filters),
    queryFn: ({ signal }) =>
      api<FinanceEntryList>(
        `/finance/entries${query({
          type: filters.type,
          categoryId: filters.categoryId,
          branchId: filters.branchId,
          year: filters.year,
          month: filters.month,
          paymentMethodId: filters.paymentMethodId,
          staffId: filters.staffId,
        })}`,
        { signal },
      ),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** Adds an entry, or with an id changes one. Bonuses, fines and advances also move the payroll. */
export function useSaveEntry(id: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: FinanceEntryInput) =>
      api<FinanceEntry>(id ? `/finance/entries/${id}` : "/finance/entries", {
        method: id ? "PATCH" : "POST",
        body: input,
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: financeKeys.all }),
        client.invalidateQueries({ queryKey: financeKeys.payroll }),
      ]),
  });
}

export function useDeleteEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/finance/entries/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: financeKeys.all }),
        client.invalidateQueries({ queryKey: financeKeys.payroll }),
      ]),
  });
}

/** Students by name or phone, for an expense or income paid to or by a student. */
export function useFinanceStudents(q: string, enabled: boolean) {
  return useQuery({
    queryKey: financeKeys.students(q),
    queryFn: ({ signal }) =>
      api<FinanceStudent[]>(`/finance/students?q=${encodeURIComponent(q)}`, { signal }),
    enabled: enabled && q.length >= 2,
  });
}

/** The months computed so far, newest first. */
export function usePayrollRuns() {
  return useQuery({
    queryKey: financeKeys.payrollRuns,
    queryFn: ({ signal }) => api<PayrollSummary[]>("/payroll", { signal }),
  });
}

/** One month's payroll ("2026-11"); the server computes it the first time it is asked for. */
export function usePayrollRun(month: string | null) {
  return useQuery({
    queryKey: financeKeys.payrollRun(month ?? ""),
    queryFn: ({ signal }) => api<PayrollRun>(`/payroll/${month}`, { signal }),
    enabled: month !== null,
  });
}

/** What can be done to a month: count it again, keep it as a draft, save it, approve one line. */
export type PayrollStep =
  { do: "recalculate" } | { do: "save"; status: PayrollStatus } | { do: "approve"; lineId: string };

export function usePayrollStep(month: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: PayrollStep) => {
      if (step.do === "recalculate") {
        return api<PayrollRun>(`/payroll/${month}/recalculate`, { method: "POST" });
      }
      if (step.do === "approve") {
        return api<PayrollRun>(`/payroll/${month}/lines/${step.lineId}/approve`, {
          method: "POST",
        });
      }
      return api<PayrollRun>(`/payroll/${month}`, { method: "PUT", body: { status: step.status } });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: financeKeys.payroll }),
  });
}
