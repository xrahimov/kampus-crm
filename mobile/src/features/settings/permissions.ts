/*
 * Every permission a role can hold, in the site's order (A-244). The site's
 * list is `src/lib/rbac/permissions.ts`; a site test
 * (`tests/unit/app-permissions.test.ts`) fails when the two differ.
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

/** What a role with everything holds instead of a list. */
export const ALL_PERMISSIONS = "*";

/** The permissions under their module (the part before the first dot), in the list's order. */
export function permissionGroups(): Array<{ module: string; permissions: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const permission of PERMISSIONS) {
    const module = permission.split(".")[0] ?? permission;
    groups.set(module, [...(groups.get(module) ?? []), permission]);
  }
  return Array.from(groups, ([module, permissions]) => ({ module, permissions }));
}
