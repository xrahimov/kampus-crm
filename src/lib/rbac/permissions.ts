/**
 * Permission catalogue. Shared by the server (authorization) and the client
 * (hiding navigation). Codes are `module.action`; the special code `*` grants
 * everything and is reserved for the CEO role.
 *
 * The reference CRM's individual permissions were not visible (EXPLORATION.md
 * §8 Roles, NOT VERIFIED), so this list is our own design — see ASSUMPTIONS A-05.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "dashboard.finance",

  "leads.view",
  "leads.create",
  "leads.update",
  "leads.delete",

  "teachers.view",
  "teachers.create",
  "teachers.update",
  "teachers.delete",

  "groups.view",
  "groups.create",
  "groups.update",
  "groups.delete",
  "groups.attendance.mark",

  "students.view",
  "students.create",
  "students.update",
  "students.delete",
  "students.blacklist",

  "payments.create",
  "payments.refund",
  "discounts.give",

  "exams.view",
  "exams.create",
  "exams.update",
  "exams.delete",

  "tests.view",
  "tests.create",
  "tests.update",
  "tests.delete",

  "coins.give",
  "coins.manage",

  "sms.send",

  "announcements.view",
  "announcements.create",

  "finance.view",
  "finance.create",
  "finance.update",
  "finance.delete",
  "finance.payroll.approve",

  "reports.view",
  "reports.payments",
  "reports.leads",

  "staff.view",
  "staff.create",
  "staff.update",
  "staff.delete",

  "settings.org",
  "settings.roles",
  "settings.integrations",
  "settings.catalog",

  "logs.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export const ALL_PERMISSIONS = "*" as const;
export type PermissionGrant = Permission | typeof ALL_PERMISSIONS;

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Modules as they appear in the main navigation (EXPLORATION.md §0). */
export const MODULES = [
  "dashboard",
  "assistant",
  "today",
  "checking",
  "leads",
  "teachers",
  "groups",
  "timetable",
  "students",
  "absences",
  "announcements",
  "debts",
  "cashdesk",
  "exams",
  "settings",
  "finance",
  "reports",
] as const;
export type ModuleKey = (typeof MODULES)[number];

/** The permission that unlocks each navigation item. */
export const MODULE_VIEW_PERMISSION: Record<ModuleKey, Permission> = {
  dashboard: "dashboard.view",
  // Questions over the centre's data, answered within the asker's own permissions (A-149).
  // Teachers have it too, through `canUseAssistant` below (A-190).
  assistant: "dashboard.view",
  today: "groups.view",
  // Homework answers waiting for a verdict, across the teacher's groups (A-160).
  checking: "groups.attendance.mark",

  leads: "leads.view",
  teachers: "teachers.view",
  groups: "groups.view",
  timetable: "groups.view",
  students: "students.view",
  // Whoever may edit students follows up the ones who stopped coming (A-125).
  absences: "students.update",
  // Notices to students and parents (A-129).
  announcements: "announcements.view",
  // Whoever takes payments collects debts (A-112) and closes their cash day (A-122).
  debts: "payments.create",
  cashdesk: "payments.create",
  exams: "exams.view",
  settings: "settings.catalog",
  finance: "finance.view",
  reports: "reports.view",
};

export function hasPermission(grants: readonly string[], permission: Permission): boolean {
  return grants.includes(ALL_PERMISSIONS) || grants.includes(permission);
}

/**
 * Who has the assistant and the daily summary (A-190): everyone with a
 * Dashboard and everyone with a Today page, so the office and the teachers.
 * What each of them is told still follows their own permissions.
 */
export function canUseAssistant(grants: readonly string[]): boolean {
  return hasPermission(grants, "dashboard.view") || hasPermission(grants, "groups.view");
}

/** Whether a navigation item is shown to someone with these grants. */
export function canViewModule(grants: readonly string[], module: ModuleKey): boolean {
  if (module === "assistant") return canUseAssistant(grants);
  return hasPermission(grants, MODULE_VIEW_PERMISSION[module]);
}
