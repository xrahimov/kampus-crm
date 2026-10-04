import type { Permission } from "@/lib/rbac/permissions";

/**
 * The reference's "Hisobotlar" pages (EXP §10), in its order. Items without a
 * `phase` are live; the rest arrive with Phase 12 (ARCHITECTURE §7).
 */
export interface ReportNavItem {
  key: string;
  href: string;
  permission: Permission;
  phase?: number;
}

export const REPORTS_NAV: ReportNavItem[] = [
  { key: "payments", href: "/reports/payments", permission: "reports.payments", phase: 12 },
  {
    key: "studentPayments",
    href: "/reports/student-payments",
    permission: "reports.payments",
    phase: 12,
  },
  { key: "churn", href: "/reports/churn", permission: "reports.view", phase: 12 },
  { key: "graduates", href: "/reports/graduates", permission: "reports.view", phase: 12 },
  { key: "staffAttendance", href: "/reports/staff-attendance", permission: "reports.view" },
  { key: "coins", href: "/reports/coins", permission: "reports.view" },
  { key: "leads", href: "/reports/leads", permission: "reports.leads", phase: 12 },
  { key: "students", href: "/reports/students", permission: "reports.view", phase: 12 },
  { key: "statistics", href: "/reports/statistics", permission: "reports.view", phase: 12 },
];
