import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * Reports for the office (A-238): payments, student payments, left students,
 * lead statements, the referral programme, students and the centre's
 * statistics. The calls the site's report pages make, and one made for the
 * app: what the Left students filters choose from.
 */

/** The site's reports in its order, with the permission each asks for. */
export const REPORTS = [
  { key: "payments", path: "/reports/payments", permission: "reports.payments" },
  { key: "studentPayments", path: "/reports/student-payments", permission: "reports.payments" },
  { key: "churn", path: "/reports/churn", permission: "reports.view" },
  { key: "graduates", path: "/reports/graduates", permission: "reports.view" },
  { key: "staffAttendance", path: "/reports/staff-attendance", permission: "reports.view" },
  { key: "coins", path: "/reports/coins", permission: "reports.view" },
  { key: "leads", path: "/reports/leads", permission: "reports.leads" },
  { key: "referrals", path: "/reports/referrals", permission: "reports.leads" },
  { key: "students", path: "/reports/students", permission: "reports.view" },
  { key: "statistics", path: "/reports/statistics", permission: "reports.view" },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];

/** The reports the app shows itself, by the last part of the site's address. */
export const NATIVE_REPORTS = [
  "payments",
  "student-payments",
  "churn",
  "leads",
  "referrals",
  "students",
  "statistics",
] as const;
export type NativeReport = (typeof NATIVE_REPORTS)[number];

/** One month of one branch, or of every branch the person has. */
export interface ReportPeriod {
  branchId: string | null;
  year: number;
  month: number;
}

type Named = { id: string; name: string };
type Person = { id: string; fullName: string };

/* ----- payments ----- */

export interface ReportKpi {
  value: number;
  /** How many payments, discounts or refunds are behind the sum. */
  count: number;
  /** Percent against the month before; null when there is nothing to compare with. */
  change: number | null;
}

export const PAYMENT_KPIS = ["total", "onTime", "late", "discounts", "bonus", "refunds"] as const;
export type PaymentKpi = (typeof PAYMENT_KPIS)[number];

export interface PaymentsReport {
  year: number;
  month: number;
  branchId: string | null;
  kpis: Record<PaymentKpi, ReportKpi>;
  teachers: Array<{
    userId: string;
    fullName: string;
    groupsCount: number;
    courses: string[];
    studentsCount: number;
    totalPayments: number;
    debt: number;
  }>;
  staff: Array<{
    userId: string;
    fullName: string;
    roles: string[];
    paymentsCount: number;
    totalPayments: number;
    refunds: number;
  }>;
}

/* ----- student payments ----- */

export interface StudentPaymentRow {
  id: string;
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  teacherName: string | null;
  courseName: string;
  amount: number;
  bonus: number;
  refunded: number;
  paidAt: string;
  /** "2026-11": the month the payment is for. */
  effectiveMonth: string;
  comment: string | null;
  receivedByName: string | null;
  methodName: string | null;
}

export interface StudentPaymentsPage {
  items: StudentPaymentRow[];
  page: number;
  pageSize: number;
  total: number;
  totalAmount: number;
}

export interface StudentPaymentsOptions {
  groups: Named[];
  methods: Named[];
  teachers: Person[];
  courses: Named[];
  staff: Person[];
}

export type YesNo = "yes" | "no";

export interface StudentPaymentsFilters extends ReportPeriod {
  /** The period is the day of payment, not the month paid for. */
  byPaidAt: boolean;
  q: string;
  groupId: string | null;
  paymentMethodId: string | null;
  teacherId: string | null;
  courseId: string | null;
  bonus: YesNo | null;
  receivedById: string | null;
}

/* ----- left students ----- */

export interface NamedCount {
  name: string;
  count: number;
}

export interface LeaveReason {
  id: string;
  name: string;
  kind: "LEAVE" | "TRANSFER";
  isActive: boolean;
}

export const CHURN_BREAKDOWNS = [
  "course",
  "teacher",
  "branch",
  "status",
  "reason",
  "joinedThisMonth",
] as const;
export type ChurnBreakdown = (typeof CHURN_BREAKDOWNS)[number];

export interface LeftStudentRow {
  membershipId: string;
  studentId: string;
  fullName: string;
  groupId: string;
  groupName: string;
  courseName: string;
  branchName: string;
  hasDiscount: boolean;
  teacherName: string | null;
  reason: string | null;
  leftAt: string;
  leftByName: string | null;
  note: string | null;
}

export interface ChurnReport {
  from: string;
  to: string;
  kpis: {
    churnRate: number;
    leftCount: number;
    activeAtStart: number;
    lostRevenue: number;
    avgLifetimeMonths: number | null;
  };
  /** How many left on each day of the period. */
  dynamics: Array<{ date: string; count: number }>;
  breakdown: {
    course: NamedCount[];
    teacher: NamedCount[];
    branch: NamedCount[];
    status: NamedCount[];
    reason: NamedCount[];
    joinedThisMonth: number;
  };
  transfers: { total: number; leftAfterPercent: number; reasons: NamedCount[] };
  discounts: { withDiscount: number; fullPrice: number };
  rows: LeftStudentRow[];
  reasons: LeaveReason[];
}

export interface ChurnOptions {
  courses: Named[];
  teachers: Named[];
  groups: Named[];
}

/** No dates is this month, as on the site. */
export interface ChurnFilters {
  from: string | null;
  to: string | null;
  branchId: string | null;
  courseId: string | null;
  teacherId: string | null;
  groupId: string | null;
  reason: string | null;
  discount: YesNo | null;
}

/* ----- leads ----- */

export const LEAD_STAGES = ["NEW", "CONTACTED", "UNREACHABLE", "LOST", "CONVERTED"] as const;

export interface LeadsReport {
  year: number;
  month: number;
  kpis: {
    newLeads: number;
    conversions: number;
    lost: number;
    bestSource: NamedCount | null;
    bestSalesperson: NamedCount | null;
    trials: number;
    trialsAttended: number;
  };
  funnel: Array<{ stage: (typeof LEAD_STAGES)[number]; count: number }>;
  byMonth: Array<{ month: string; created: number; lost: number; converted: number }>;
  byCourse: NamedCount[];
  bySource: NamedCount[];
  trialsBySource: Array<{
    name: string | null;
    leads: number;
    trials: number;
    attended: number;
    converted: number;
  }>;
  sources: Named[];
}

/* ----- referral programme ----- */

export interface ReferralsReport {
  year: number;
  month: number;
  kpis: { leads: number; joined: number; coins: number; bonus: number; referrers: number };
  byMonth: Array<{ month: string; leads: number; joined: number }>;
  rows: Array<{
    studentId: string;
    fullName: string;
    leads: number;
    joined: number;
    coins: number;
    bonus: number;
  }>;
  referred: Array<{
    id: string;
    fullName: string;
    phone: string | null;
    referrerName: string;
    createdAt: string;
    joined: boolean;
    joinedAt: string | null;
  }>;
}

/* ----- students ----- */

export const STUDENT_REPORT_STATUSES = ["ACTIVE", "TRIAL", "FROZEN", "ARCHIVED", "ALL"] as const;
export type StudentReportStatus = (typeof STUDENT_REPORT_STATUSES)[number];

export interface StudentsReport {
  from: string;
  to: string;
  kpis: {
    total: number;
    newInPeriod: number;
    multiCourse: number;
    attendancePercent: number | null;
    gradeAverage: number | null;
  };
  attendance: {
    totals: { expected: number; present: number; absent: number; unmarked: number };
    rows: Array<{
      groupId: string;
      groupName: string;
      teacherName: string | null;
      students: number;
      lessons: number;
      expected: number;
      present: number;
      absent: number;
      unmarked: number;
    }>;
  };
  performance: {
    rows: Array<{
      studentId: string;
      fullName: string;
      groups: string[];
      teachers: string[];
      courses: string[];
      grades: Array<{ groupName: string; average: number | null }>;
      average: number | null;
    }>;
    page: number;
    pageSize: number;
    total: number;
  };
  options: { groups: Named[]; teachers: Person[] };
}

export interface StudentsReportFilters extends ReportPeriod {
  /** Days that replace the month's first and last; null keeps the month's. */
  from: string | null;
  to: string | null;
  groupId: string | null;
  teacherId: string | null;
  status: StudentReportStatus | null;
  /** The page of the performance list. */
  page: number;
}

/* ----- the centre's statistics ----- */

export const STATISTICS_VIEWS = ["monthly", "weekly", "daily"] as const;
export type StatisticsView = (typeof STATISTICS_VIEWS)[number];

export interface StatisticsRow {
  roomId: string;
  roomName: string;
  capacity: number;
  roomHours: number;
  groupId: string | null;
  groupName: string | null;
  students: number;
  freeSeats: number;
  lessonHours: number;
  coursePrice: number | null;
  totalSum: number;
  /** Only on a room's total row. */
  freeHours: number | null;
  seatHours: number;
  actualSeatHours: number;
  planSeatHours: number;
  fik: number;
  isRoomTotal: boolean;
}

export interface StatisticsReport {
  view: StatisticsView;
  from: string;
  to: string;
  year: number;
  month: number;
  workHours: { start: string; end: string };
  kpis: {
    utilisation: number;
    freeHours: number;
    students: number;
    potentialRevenue: number;
    freeSeats: number;
    possibleStudents: number;
  };
  rows: StatisticsRow[];
}

export interface StatisticsFilters extends ReportPeriod {
  view: StatisticsView;
  /** The day the week or the day is taken from; null is today. */
  date: string | null;
}

/** "?a=1&b=2" of the values that are set; what a report page of the site takes too. */
export function reportQuery(
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  const parts = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== false)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export const reportKeys = {
  all: ["reports"] as const,
  payments: (period: ReportPeriod) => ["reports", "payments", period] as const,
  studentPayments: (filters: StudentPaymentsFilters) =>
    ["reports", "student-payments", filters] as const,
  studentPaymentsOptions: (branchId: string | null) =>
    ["reports", "student-payments-options", branchId] as const,
  churn: (filters: ChurnFilters) => ["reports", "churn", filters] as const,
  churnOptions: (branchId: string | null) => ["reports", "churn-options", branchId] as const,
  leads: (period: ReportPeriod, sourceId: string | null) =>
    ["reports", "leads", period, sourceId] as const,
  referrals: (period: ReportPeriod) => ["reports", "referrals", period] as const,
  students: (filters: StudentsReportFilters) => ["reports", "students", filters] as const,
  statistics: (filters: StatisticsFilters) => ["reports", "statistics", filters] as const,
};

export function usePaymentsReport(period: ReportPeriod) {
  return useQuery({
    queryKey: reportKeys.payments(period),
    queryFn: ({ signal }) =>
      api<PaymentsReport>(`/reports/payments${reportQuery({ ...period })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

export const STUDENT_PAYMENTS_PAGE = 30;

/** What the list and the site's own page of it are narrowed by, without the page number. */
export function studentPaymentsQuery(filters: StudentPaymentsFilters) {
  return {
    branchId: filters.branchId,
    year: filters.year,
    month: filters.month,
    byPaidAt: filters.byPaidAt ? "true" : null,
    q: filters.q,
    groupId: filters.groupId,
    paymentMethodId: filters.paymentMethodId,
    teacherId: filters.teacherId,
    courseId: filters.courseId,
    bonus: filters.bonus,
    receivedById: filters.receivedById,
  };
}

/** The month's payments, newest first, a page at a time. */
export function useStudentPayments(filters: StudentPaymentsFilters) {
  return useInfiniteQuery({
    queryKey: reportKeys.studentPayments(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<StudentPaymentsPage>(
        `/reports/student-payments${reportQuery({
          ...studentPaymentsQuery(filters),
          pageSize: STUDENT_PAYMENTS_PAGE,
          page: pageParam,
        })}`,
        { signal },
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  });
}

export function useStudentPaymentsOptions(branchId: string | null) {
  return useQuery({
    queryKey: reportKeys.studentPaymentsOptions(branchId),
    queryFn: ({ signal }) =>
      api<StudentPaymentsOptions>(`/reports/student-payments/options${reportQuery({ branchId })}`, {
        signal,
      }),
    staleTime: 60_000,
  });
}

export function useChurnReport(filters: ChurnFilters) {
  return useQuery({
    queryKey: reportKeys.churn(filters),
    queryFn: ({ signal }) =>
      api<ChurnReport>(`/reports/churn${reportQuery({ ...filters })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Courses, teachers and groups for the filters. A server that does not have
 * this call yet (it came with A-238) answers "not found": the report then
 * shows without those three filters.
 */
export function useChurnOptions(branchId: string | null) {
  return useQuery({
    queryKey: reportKeys.churnOptions(branchId),
    queryFn: ({ signal }) =>
      api<ChurnOptions>(`/reports/churn/options${reportQuery({ branchId })}`, { signal }),
    staleTime: 60_000,
    retry: false,
  });
}

/** Adds, switches on or off, or removes a reason offered when a student leaves or moves. */
export function useLeaveReasonStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      step:
        | { do: "add"; name: string; kind: LeaveReason["kind"] }
        | { do: "toggle"; reason: LeaveReason }
        | { do: "remove"; reason: LeaveReason },
    ) => {
      if (step.do === "add") {
        return api<LeaveReason>("/leave-reasons", {
          method: "POST",
          body: { name: step.name, kind: step.kind },
        });
      }
      if (step.do === "toggle") {
        return api<LeaveReason>(`/leave-reasons/${step.reason.id}`, {
          method: "PATCH",
          body: { isActive: !step.reason.isActive },
        });
      }
      return api<unknown>(`/leave-reasons/${step.reason.id}`, { method: "DELETE" });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["reports", "churn"] }),
  });
}

export function useLeadsReport(period: ReportPeriod, sourceId: string | null) {
  return useQuery({
    queryKey: reportKeys.leads(period, sourceId),
    queryFn: ({ signal }) =>
      api<LeadsReport>(`/reports/leads${reportQuery({ ...period, sourceId })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

export function useReferralsReport(period: ReportPeriod) {
  return useQuery({
    queryKey: reportKeys.referrals(period),
    queryFn: ({ signal }) =>
      api<ReferralsReport>(`/reports/referrals${reportQuery({ ...period })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

export function useStudentsReport(filters: StudentsReportFilters) {
  return useQuery({
    queryKey: reportKeys.students(filters),
    queryFn: ({ signal }) =>
      api<StudentsReport>(
        `/reports/students${reportQuery({ ...filters, page: filters.page > 1 ? filters.page : null })}`,
        { signal },
      ),
    placeholderData: (previous) => previous,
  });
}

export function useStatisticsReport(filters: StatisticsFilters) {
  return useQuery({
    queryKey: reportKeys.statistics(filters),
    queryFn: ({ signal }) =>
      api<StatisticsReport>(
        `/reports/statistics${reportQuery({
          ...filters,
          view: filters.view === "monthly" ? null : filters.view,
        })}`,
        { signal },
      ),
    placeholderData: (previous) => previous,
  });
}
