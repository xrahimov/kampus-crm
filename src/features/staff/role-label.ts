/** System role names are translated; custom roles show the name their creator typed. */
export function roleLabel(
  t: { has(key: string): boolean; (key: string): string },
  role: { code: string; name: string },
): string {
  const key = `roles.${role.code}`;
  return t.has(key) ? t(key) : role.name;
}

/** The names the system roles are created with (organizations.service.ts), back to their codes. */
const SYSTEM_ROLE_CODES: Record<string, string> = {
  CEO: "CEO",
  Admin: "ADMIN",
  "Branch manager": "BRANCH_MANAGER",
  Cashier: "CASHIER",
  Teacher: "TEACHER",
  "Support teacher": "SUPPORT_TEACHER",
  Marketer: "MARKETER",
  Watcher: "WATCHER",
};

/**
 * For a place that keeps only a role's name (a saved payroll line): a system
 * role is still shown in the reader's language, any other name as it was typed.
 */
export function roleNameLabel(
  t: { has(key: string): boolean; (key: string): string },
  name: string,
): string {
  const code = SYSTEM_ROLE_CODES[name];
  return code && t.has(`roles.${code}`) ? t(`roles.${code}`) : name;
}
