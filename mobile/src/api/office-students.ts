import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { officeKeys } from "./office";
import type { Page, StudentDetail } from "./types";

/*
 * Students on the office's side, in the app (A-231): what the forms choose
 * from, a new student, a payment taken, and a student's payments. The same
 * calls the site's Students pages and its Payment dialog make.
 */

export interface StudentOptions {
  schools: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string; branchId: string }>;
  groups: Array<{
    id: string;
    name: string;
    branchId: string;
    courseId: string;
    teacherId: string | null;
    teacherName: string | null;
    time: string | null;
    status: "ACTIVE" | "ARCHIVED" | "TRIAL" | "FROZEN";
  }>;
  teachers: Array<{ id: string; fullName: string }>;
  paymentMethods: Array<{ id: string; name: string }>;
}

export interface PaymentOptions {
  methods: Array<{ id: string; name: string }>;
  printReceiptAfterPayment: boolean;
  refundsEnabled: boolean;
}

/** What a payment into one group starts from: the balance, the price, the months it may be for. */
export interface PaymentInfo {
  membershipId: string;
  balance: number;
  monthlyPrice: number;
  /** "YYYY-MM-01". */
  suggestedMonth: string;
  suggestedAmount: number;
  nextPaymentDate: string | null;
  months: string[];
  groupName: string;
  studentName: string;
}

export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  membershipId: string;
  groupId: string;
  groupName: string;
  methodName: string | null;
  amount: number;
  bonus: number;
  refunded: number;
  effectiveMonth: string;
  paidAt: string;
  comment: string | null;
  receivedByName: string | null;
  createdAt: string;
  /** The fiscal receipt of the payment; null or absent where the centre does not fiscalise. */
  fiscal?: { status: "PENDING" | "ISSUED" | "FAILED"; error: string | null } | null;
}

export interface PaymentInput {
  membershipId: string;
  paymentMethodId: string;
  amount: number;
  effectiveMonth: string;
  paidAt: string;
  comment: string | null;
}

export interface NewStudentInput {
  branchId: string;
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  gender: "MALE" | "FEMALE";
  photoUrl: string | null;
  note: string | null;
  /** The student's own sign-in to the app (A-06); null leaves them without one. */
  password: string | null;
  sourceId: string | null;
  schoolId: string | null;
  referredById: string | null;
  timeZone: string | null;
  membership: {
    groupId: string;
    joinedAt: string;
    status: "NEW" | "TRIAL" | "ACTIVE";
    /** The student's own monthly price in this group; null for the course's. */
    customPrice: number | null;
    /** The day charging starts, when it is not the day of joining. */
    billingFrom: string | null;
  } | null;
  parent: { fullName: string; phone: string } | null;
}

export const officeStudentKeys = {
  options: ["students", "options"] as const,
  paymentOptions: ["payments", "options"] as const,
  paymentInfo: (membershipId: string) => ["payments", "info", membershipId] as const,
  payments: (studentId: string) => ["payments", "student", studentId] as const,
};

/** Courses, groups, teachers and the rest the student forms and filters choose from. */
export function useStudentOptions(enabled = true) {
  return useQuery({
    queryKey: officeStudentKeys.options,
    queryFn: ({ signal }) => api<StudentOptions>("/students/options", { signal }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** What is done to the ticked students together (A-260); the server checks the right each needs. */
export type BulkStudentsInput =
  | { action: "archive" | "restore"; studentIds: string[] }
  | {
      action: "addToGroup";
      studentIds: string[];
      groupId: string;
      joinedAt: string;
      status: "NEW" | "TRIAL" | "ACTIVE";
    }
  | {
      action: "discount";
      studentIds: string[];
      groupId: string;
      discountedPrice: number;
      months: number;
      comment: string | null;
    };

export interface BulkStudentsResult {
  done: number;
  skipped: number;
}

export function useBulkStudents() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkStudentsInput) =>
      api<BulkStudentsResult>("/students/bulk", { method: "POST", body: input }),
    // Groups, balances and the home page's figures all move with these.
    onSuccess: () => client.invalidateQueries(),
  });
}

/** The most students one "Activate" call takes. */
const ACTIVATE_AT_ONCE = 200;

/** Every New or Trial membership of these students becomes Active today (the site's "Activate"). */
export function useActivateStudents() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (studentIds: string[]) => {
      let activated = 0;
      for (let from = 0; from < studentIds.length; from += ACTIVATE_AT_ONCE) {
        const result = await api<{ activated: number }>("/students/activate", {
          method: "POST",
          body: { studentIds: studentIds.slice(from, from + ACTIVATE_AT_ONCE) },
        });
        activated += result.activated;
      }
      return { activated };
    },
    onSettled: () => client.invalidateQueries(),
  });
}

export function usePaymentOptions(enabled = true) {
  return useQuery({
    queryKey: officeStudentKeys.paymentOptions,
    queryFn: ({ signal }) => api<PaymentOptions>("/payments/options", { signal }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePaymentInfo(membershipId: string | null) {
  return useQuery({
    queryKey: officeStudentKeys.paymentInfo(membershipId ?? ""),
    queryFn: ({ signal }) =>
      api<PaymentInfo>(`/memberships/${membershipId}/payment-info`, { signal }),
    enabled: membershipId !== null,
  });
}

/** A student's payments, newest first. */
export function useStudentPayments(studentId: string, enabled = true) {
  return useQuery({
    queryKey: officeStudentKeys.payments(studentId),
    queryFn: ({ signal }) =>
      api<Page<Payment>>(`/payments?studentId=${studentId}&pageSize=50`, { signal }),
    enabled,
  });
}

/** Takes a payment; balances, the student's page and the home's figures are asked for again. */
export function useTakePayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentInput) =>
      api<Payment>("/payments", { method: "POST", body: { ...input, bonus: 0 } }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["students"] }),
        client.invalidateQueries({ queryKey: ["payments"] }),
        client.invalidateQueries({ queryKey: ["office"] }),
        client.invalidateQueries({ queryKey: officeKeys.unread }),
      ]),
  });
}

export function useCreateStudent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewStudentInput) =>
      api<StudentDetail>("/students", { method: "POST", body: input }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["students"] }),
        client.invalidateQueries({ queryKey: ["office"] }),
      ]),
  });
}

export interface StudentChange {
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  gender: "MALE" | "FEMALE";
  photoUrl: string | null;
  note: string | null;
  schoolId: string | null;
  timeZone: string | null;
}

/** Changes who the student is: the name, the phone, the day of birth, the photo, the note, the school, the zone. */
export function useUpdateStudent(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: StudentChange) =>
      api<StudentDetail>(`/students/${id}`, { method: "PATCH", body: change }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["students"] }),
  });
}

/** Archives the student (they leave every group), or brings them back from the archive. */
export function useArchiveStudent(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (archive: boolean) =>
      archive
        ? api(`/students/${id}`, { method: "DELETE" })
        : api<StudentDetail>(`/students/${id}/restore`, { method: "POST" }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["students"] }),
        client.invalidateQueries({ queryKey: ["office"] }),
      ]),
  });
}
