import type { Permission } from "@/lib/rbac/permissions";

/**
 * The reference's "Hisobotlar" pages (EXP §10), in its order. Items without a
 * `phase` are live (all of them since Phase 12, ARCHITECTURE §7).
 */
export interface ReportNavItem {
  key: string;
  href: string;
  permission: Permission;
  phase?: number;
}

export const REPORTS_NAV: ReportNavItem[] = [
  { key: "payments", href: "/reports/payments", permission: "reports.payments" },
  { key: "studentPayments", href: "/reports/student-payments", permission: "reports.payments" },
  { key: "churn", href: "/reports/churn", permission: "reports.view" },
  { key: "graduates", href: "/reports/graduates", permission: "reports.view" },
  { key: "staffAttendance", href: "/reports/staff-attendance", permission: "reports.view" },
  { key: "coins", href: "/reports/coins", permission: "reports.view" },
  { key: "leads", href: "/reports/leads", permission: "reports.leads" },
  { key: "referrals", href: "/reports/referrals", permission: "reports.leads" },
  { key: "students", href: "/reports/students", permission: "reports.view" },
  { key: "statistics", href: "/reports/statistics", permission: "reports.view" },
];
