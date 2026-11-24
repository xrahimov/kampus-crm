import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Page } from "./types";

/*
 * The centre's settings for the office, first step (A-242): days off, schools,
 * SMS templates, the receipt and the coin rules. The calls the site's Settings
 * pages make.
 */

// --- Days off -------------------------------------------------------------------

export interface DayOff {
  id: string;
  branchId: string;
  branchName: string;
  /** An ISO day. */
  date: string;
  reason: string;
}

export interface DayOffInput {
  branchId: string;
  date: string;
  reason: string;
  /** Tell the students and parents of that day's groups; asked only for a new day off. */
  notify: boolean;
}

// --- Schools --------------------------------------------------------------------

export interface School {
  id: string;
  name: string;
  studentsCount: number;
}

// --- SMS templates --------------------------------------------------------------

export interface SmsCategory {
  id: string;
  name: string;
  templatesCount: number;
}

export interface SmsTemplateRow {
  id: string;
  categoryId: string;
  categoryName: string;
  text: string;
  /** Copied from the SMS provider's own templates. */
  imported: boolean;
}

/** The words a template may carry in braces; the server fills them in as it sends. */
export const SMS_VARIABLES = [
  "studentName",
  "groupName",
  "date",
  "amount",
  "debt",
  "score",
  "centerName",
  "time",
  "newDate",
  "newTime",
  "reason",
  "days",
] as const;

export const SMS_MAX_LENGTH = 1000;

// --- Receipt --------------------------------------------------------------------

export const RECEIPT_FIELDS = [
  "logo",
  "header",
  "address",
  "phone",
  "printedAt",
  "paymentId",
  "student",
  "group",
  "method",
  "paidAt",
  "cashier",
  "amount",
  "footer",
  "footerText",
  "qr",
  "teacher",
  "coursePrice",
] as const;
export type ReceiptField = (typeof RECEIPT_FIELDS)[number];
export type LogoPosition = "TOP" | "BOTTOM";

export interface ReceiptInput {
  address: string | null;
  phone: string | null;
  visibleFields: ReceiptField[];
  logoPosition: LogoPosition;
  footerText: string | null;
}

export interface ReceiptSettings extends ReceiptInput {
  organizationName: string;
  logoUrl: string | null;
}

// --- Coins ----------------------------------------------------------------------

export type CoinEvent =
  "ATTENDANCE" | "HOMEWORK" | "TEST_RESULT" | "BIRTHDAY" | "REFERRAL" | "VOCAB_STREAK";

export interface CoinRule {
  event: CoinEvent;
  amount: number;
  isActive: boolean;
}

export interface CoinSettings {
  autoCoins: boolean;
  rules: CoinRule[];
}

export interface CoinReasonRow {
  id: string;
  name: string;
  maxCoins: number;
  isActive: boolean;
  usedCount: number;
}

export interface CoinReasonInput {
  name: string;
  maxCoins: number;
  isActive: boolean;
}

export const settingsKeys = {
  daysOff: ["settings", "days-off"] as const,
  schools: ["settings", "schools"] as const,
  smsCategories: ["sms", "categories"] as const,
  /** The Send SMS sheet reads the same list. */
  smsTemplates: ["sms", "templates"] as const,
  receipt: ["settings", "receipt"] as const,
  coins: ["settings", "coins"] as const,
  /** Under the key a group's "Give coins" reads its active reasons from. */
  coinReasons: ["coin-reasons", "all"] as const,
};

const PAGE_SIZE = 50;
const nextPage = <T>(last: Page<T>) =>
  last.page * last.pageSize < last.total ? last.page + 1 : undefined;

/** Days off, the newest date first, fifty at a time. */
export function useDaysOff() {
  return useInfiniteQuery({
    queryKey: settingsKeys.daysOff,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<Page<DayOff>>(`/days-off?sort=date:desc&page=${pageParam}&pageSize=${PAGE_SIZE}`, {
        signal,
      }),
    getNextPageParam: nextPage,
  });
}

/** A day off moves or cancels lessons: the timetable and the day follow it. */
function useDaysOffChanged() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: settingsKeys.daysOff }),
      client.invalidateQueries({ queryKey: ["groups"] }),
      client.invalidateQueries({ queryKey: ["today"] }),
      client.invalidateQueries({ queryKey: ["timetable"] }),
    ]);
}

/** Adds a day off, or with an id changes its date and reason (the branch stays). */
export function useSaveDayOff(id: string | null) {
  const changed = useDaysOffChanged();
  return useMutation({
    mutationFn: (input: DayOffInput) =>
      id
        ? api<DayOff>(`/days-off/${id}`, {
            method: "PATCH",
            body: { date: input.date, reason: input.reason },
          })
        : api<DayOff>("/days-off", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useDeleteDayOff() {
  const changed = useDaysOffChanged();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/days-off/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

/** Schools by name, fifty at a time. */
export function useSchools() {
  return useInfiniteQuery({
    queryKey: settingsKeys.schools,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<Page<School>>(`/schools?sort=name:asc&page=${pageParam}&pageSize=${PAGE_SIZE}`, {
        signal,
      }),
    getNextPageParam: nextPage,
  });
}

/** The student form offers the schools: its choices follow a change. */
function useSchoolsChanged() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: settingsKeys.schools }),
      client.invalidateQueries({ queryKey: ["students", "options"] }),
    ]);
}

export function useSaveSchool(id: string | null) {
  const changed = useSchoolsChanged();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      id
        ? api<School>(`/schools/${id}`, { method: "PATCH", body: input })
        : api<School>("/schools", { method: "POST", body: input }),
    onSuccess: changed,
  });
}

export function useDeleteSchool() {
  const changed = useSchoolsChanged();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/schools/${id}`, { method: "DELETE" }),
    onSuccess: changed,
  });
}

export function useSmsCategories() {
  return useQuery({
    queryKey: settingsKeys.smsCategories,
    queryFn: ({ signal }) => api<SmsCategory[]>("/sms-categories", { signal }),
  });
}

export function useSmsTemplateRows() {
  return useQuery({
    queryKey: settingsKeys.smsTemplates,
    queryFn: ({ signal }) => api<SmsTemplateRow[]>("/sms-templates", { signal }),
  });
}

/** Categories carry the count of their templates, so both lists follow any change. */
function useSmsChanged() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: settingsKeys.smsCategories }),
      client.invalidateQueries({ queryKey: settingsKeys.smsTemplates }),
    ]);
}

export type SmsStep =
  | { do: "addCategory"; name: string }
  | { do: "removeCategory"; id: string }
  | { do: "saveTemplate"; id: string | null; input: { categoryId: string; text: string } }
  | { do: "removeTemplate"; id: string };

/** One step on the templates page: a category added or removed, a template saved or removed. */
export function useSmsStep() {
  const changed = useSmsChanged();
  return useMutation({
    mutationFn: (step: SmsStep) => {
      switch (step.do) {
        case "addCategory":
          return api<unknown>("/sms-categories", { method: "POST", body: { name: step.name } });
        case "removeCategory":
          return api<unknown>(`/sms-categories/${step.id}`, { method: "DELETE" });
        case "saveTemplate":
          return step.id
            ? api<unknown>(`/sms-templates/${step.id}`, { method: "PATCH", body: step.input })
            : api<unknown>("/sms-templates", { method: "POST", body: step.input });
        case "removeTemplate":
          return api<unknown>(`/sms-templates/${step.id}`, { method: "DELETE" });
      }
    },
    onSuccess: changed,
  });
}

/** Copies the SMS provider's own templates into a category. */
export function useImportSmsTemplates() {
  const changed = useSmsChanged();
  return useMutation({
    mutationFn: (categoryId: string) =>
      api<{ imported: number; adapter: string }>("/sms-templates/import", {
        method: "POST",
        body: { categoryId },
      }),
    onSuccess: changed,
  });
}

export function useReceiptSettings() {
  return useQuery({
    queryKey: settingsKeys.receipt,
    queryFn: ({ signal }) => api<ReceiptSettings>("/settings/receipt", { signal }),
  });
}

export function useSaveReceipt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiptInput) =>
      api<unknown>("/settings/receipt", { method: "PUT", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsKeys.receipt }),
  });
}

export function useCoinSettings() {
  return useQuery({
    queryKey: settingsKeys.coins,
    queryFn: ({ signal }) => api<CoinSettings>("/settings/coins", { signal }),
  });
}

export function useSaveCoinSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CoinSettings) =>
      api<unknown>("/settings/coins", { method: "PUT", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsKeys.coins }),
  });
}

/** Every reason for coins given by hand, the switched-off ones too. */
export function useCoinReasonRows() {
  return useQuery({
    queryKey: settingsKeys.coinReasons,
    queryFn: ({ signal }) => api<CoinReasonRow[]>("/coin-reasons", { signal }),
  });
}

/** Saves a reason, or with `input: null` deletes it. Every list of reasons reads again. */
export function useCoinReasonStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: { id: string | null; input: CoinReasonInput | null }) => {
      if (!step.input) return api<unknown>(`/coin-reasons/${step.id}`, { method: "DELETE" });
      return step.id
        ? api<unknown>(`/coin-reasons/${step.id}`, { method: "PATCH", body: step.input })
        : api<unknown>("/coin-reasons", { method: "POST", body: step.input });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["coin-reasons"] }),
  });
}
