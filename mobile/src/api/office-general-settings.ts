import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * The site's Settings → General settings for the office (A-243): the centre's
 * own settings, its branches, payment methods, grading systems and the
 * automatic SMS. The calls the site's page makes.
 */

/** The yes-or-no rules other parts of the system follow, in the site's order. */
export const ORG_SWITCHES = [
  "spreadOverpayment",
  "adminActionsNeedApproval",
  "printReceiptAfterPayment",
  "refundsEnabled",
  "attendanceComments",
  "teachersSeeExamSchedule",
  "attendanceOnlyDuringLesson",
  "teacherSeesSalary",
  "payTeacherOnGroupDayOff",
  "payOnlyAttendedLessons",
  "teacherCanAddStudents",
  "teacherCanChangeSchedule",
  "bookAnySupportTeacher",
  "groupSupportSessions",
  "showSetupChecklist",
  "studentReschedule",
] as const;
export type OrgSwitch = (typeof ORG_SWITCHES)[number];

export const SCHEDULE_STEPS = [15, 30] as const;

export interface OrgSettingsInput extends Record<OrgSwitch, boolean> {
  name: string;
  /** "HH:MM". */
  workStart: string;
  workEnd: string;
  scheduleStepMinutes: number;
  /** Days after a debt appears; null switches the step off. */
  debtTelegramDays: number | null;
  debtSmsDays: number | null;
  debtTaskDays: number | null;
  /** Lessons missed in a row, and days without a present mark; null switches the rule off. */
  absenceStreak: number | null;
  absenceSilentDays: number | null;
  /** So'm on the inviting student's balance when a friend joins; 0 is coins only. */
  referralBonus: number;
  /** Hours before a lesson a 1:1 student may still move or cancel it. */
  studentRescheduleHours: number;
  publicPage: boolean;
  publicSlug: string | null;
  publicIntro: string | null;
  publicPhone: string | null;
  publicAddress: string | null;
  publicInstagram: string | null;
  publicTelegram: string | null;
  publicFormId: string | null;
}

export interface OrgSettings extends OrgSettingsInput {
  organizationId: string;
  logoUrl: string | null;
}

export interface BranchRow {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PaymentMethodRow {
  id: string;
  name: string;
  isActive: boolean;
  /** Counted at the cashier's day close. */
  isCash: boolean;
  sortOrder: number;
}
export type PaymentMethodInput = Omit<PaymentMethodRow, "id">;

export const ROUNDING_TYPES = ["STANDARD", "IELTS"] as const;
export type Rounding = (typeof ROUNDING_TYPES)[number];

export interface GradingLevel {
  name: string;
  minScore: number;
  maxScore: number;
}

export interface GradingSystem {
  id: string;
  name: string;
  rounding: Rounding;
  levels: Array<GradingLevel & { id: string }>;
  coursesCount: number;
}

export interface GradingSystemInput {
  name: string;
  rounding: Rounding;
  levels: GradingLevel[];
}

export interface AutoSms {
  event: string;
  isActive: boolean;
  template: string;
  /** The words in braces this event's text may carry. */
  variables: string[];
}

export const generalKeys = {
  org: ["settings", "org"] as const,
  branches: ["settings", "branches"] as const,
  paymentMethods: ["settings", "payment-methods"] as const,
  gradingSystems: ["settings", "grading-systems"] as const,
  autoSms: ["settings", "auto-sms"] as const,
  forms: ["settings", "lead-forms"] as const,
};

export function useOrgSettings() {
  return useQuery({
    queryKey: generalKeys.org,
    queryFn: ({ signal }) => api<OrgSettings>("/settings/org", { signal }),
  });
}

/**
 * Saves the centre's settings. They reach far (who may refund, whether the
 * teacher sees a salary, the centre's name), so everything the app holds is
 * read again, the signed-in person included.
 */
export function useSaveOrgSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: OrgSettingsInput) =>
      api<OrgSettings>("/settings/org", { method: "PUT", body: input }),
    onSuccess: (saved) => {
      client.setQueryData(generalKeys.org, saved);
      return client.invalidateQueries();
    },
  });
}

/** The centre's lead forms, for the public page's sign-up form; needs the catalogue's right. */
export function useLeadFormNames(enabled: boolean) {
  return useQuery({
    queryKey: generalKeys.forms,
    queryFn: ({ signal }) => api<Array<{ id: string; name: string }>>("/lead-forms", { signal }),
    enabled,
    retry: false,
  });
}

export function useBranchRows() {
  return useQuery({
    queryKey: generalKeys.branches,
    queryFn: async ({ signal }) =>
      (await api<{ items: BranchRow[] }>("/branches", { signal })).items,
  });
}

/**
 * A branch saved, or with `input: null` switched off. The person's own list of
 * branches comes with who they are, so that is read again as well.
 */
export function useBranchStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: {
      id: string | null;
      input: { name: string; isActive: boolean } | null;
    }) => {
      if (!step.input) return api<unknown>(`/branches/${step.id}`, { method: "DELETE" });
      return step.id
        ? api<unknown>(`/branches/${step.id}`, { method: "PATCH", body: step.input })
        : api<unknown>("/branches", { method: "POST", body: step.input });
    },
    onSuccess: () => client.invalidateQueries(),
  });
}

export function usePaymentMethodRows() {
  return useQuery({
    queryKey: generalKeys.paymentMethods,
    queryFn: async ({ signal }) =>
      (await api<{ items: PaymentMethodRow[] }>("/payment-methods", { signal })).items,
  });
}

/** A payment method saved, or with `input: null` deleted; the payment sheets' choices follow. */
export function usePaymentMethodStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: { id: string | null; input: PaymentMethodInput | null }) => {
      if (!step.input) return api<unknown>(`/payment-methods/${step.id}`, { method: "DELETE" });
      return step.id
        ? api<unknown>(`/payment-methods/${step.id}`, { method: "PATCH", body: step.input })
        : api<unknown>("/payment-methods", { method: "POST", body: step.input });
    },
    // The payment sheets, the cash desk and finance all offer the methods.
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useGradingSystems() {
  return useQuery({
    queryKey: generalKeys.gradingSystems,
    queryFn: async ({ signal }) =>
      (await api<{ items: GradingSystem[] }>("/grading-systems", { signal })).items,
  });
}

/** A grading system saved whole (its levels replace the old ones), or with `input: null` deleted. */
export function useGradingSystemStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: { id: string | null; input: GradingSystemInput | null }) => {
      if (!step.input) return api<unknown>(`/grading-systems/${step.id}`, { method: "DELETE" });
      return step.id
        ? api<unknown>(`/grading-systems/${step.id}`, { method: "PUT", body: step.input })
        : api<unknown>("/grading-systems", { method: "POST", body: step.input });
    },
    // Courses, groups and exams all carry their grading system.
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useAutoSms(enabled: boolean) {
  return useQuery({
    queryKey: generalKeys.autoSms,
    queryFn: ({ signal }) => api<AutoSms[]>("/settings/auto-sms", { signal }),
    enabled,
  });
}

export function useSaveAutoSms() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (rows: AutoSms[]) =>
      api<unknown>("/settings/auto-sms", {
        method: "PUT",
        body: {
          settings: rows.map(({ event, isActive, template }) => ({ event, isActive, template })),
        },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: generalKeys.autoSms }),
  });
}
