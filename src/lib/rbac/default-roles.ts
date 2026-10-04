import type { Permission, PermissionGrant } from "./permissions";

/**
 * System roles, as observed in the reference staff page (EXPLORATION.md §8),
 * with the default permission sets from ARCHITECTURE.md §4 (ASSUMPTIONS A-05).
 * "Own records only" scopes (a teacher seeing just their groups) are enforced
 * inside services, not by these codes.
 */
export const SYSTEM_ROLES = [
  "CEO",
  "ADMIN",
  "BRANCH_MANAGER",
  "CASHIER",
  "TEACHER",
  "SUPPORT_TEACHER",
  "MARKETER",
  "WATCHER",
  "PARENT",
  "OTHER",
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

const crud = (module: string) =>
  [`${module}.view`, `${module}.create`, `${module}.update`, `${module}.delete`] as Permission[];
const edit = (module: string) =>
  [`${module}.view`, `${module}.create`, `${module}.update`] as Permission[];

export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, PermissionGrant[]> = {
  CEO: ["*"],
  ADMIN: [
    "dashboard.view",
    ...crud("leads"),
    ...edit("teachers"),
    ...crud("groups"),
    "groups.attendance.mark",
    ...crud("students"),
    "students.blacklist",
    "payments.create",
    "payments.refund",
    "discounts.give",
    ...crud("exams"),
    ...crud("tests"),
    "coins.give",
    "coins.manage",
    "sms.send",
    "reports.view",
    "reports.payments",
    "reports.leads",
    ...edit("staff"),
    "settings.catalog",
    "logs.view",
  ],
  BRANCH_MANAGER: [
    "dashboard.view",
    "dashboard.finance",
    ...crud("leads"),
    ...edit("teachers"),
    ...crud("groups"),
    "groups.attendance.mark",
    ...crud("students"),
    "students.blacklist",
    "payments.create",
    "payments.refund",
    "discounts.give",
    ...crud("exams"),
    ...crud("tests"),
    "coins.give",
    "coins.manage",
    "sms.send",
    ...edit("finance"),
    "reports.view",
    "reports.payments",
    "reports.leads",
    ...edit("staff"),
    "settings.catalog",
    "logs.view",
  ],
  CASHIER: [
    "dashboard.view",
    "dashboard.finance",
    "teachers.view",
    "groups.view",
    "students.view",
    "payments.create",
    "payments.refund",
    ...edit("finance"),
    "reports.view",
    "reports.payments",
  ],
  TEACHER: [
    "groups.view",
    "groups.attendance.mark",
    "students.view",
    "exams.view",
    ...edit("tests"),
    "coins.give",
    "sms.send",
  ],
  SUPPORT_TEACHER: [
    "groups.view",
    "groups.attendance.mark",
    "students.view",
    "exams.view",
    ...edit("tests"),
    "coins.give",
    "sms.send",
  ],
  MARKETER: [
    "dashboard.view",
    ...crud("leads"),
    "sms.send",
    "finance.view",
    "reports.view",
    "reports.leads",
    "settings.catalog",
  ],
  WATCHER: [
    "dashboard.view",
    "dashboard.finance",
    "leads.view",
    "teachers.view",
    "groups.view",
    "students.view",
    "exams.view",
    "tests.view",
    "finance.view",
    "reports.view",
    "reports.payments",
    "reports.leads",
    "staff.view",
    "logs.view",
  ],
  PARENT: [],
  OTHER: [],
};

/** Display names keyed by locale; the UI reads `roles.<code>` from messages. */
export const SYSTEM_ROLE_CODES = new Set<string>(SYSTEM_ROLES);
