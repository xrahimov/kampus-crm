/** System role names are translated; custom roles show the name their creator typed. */
export function roleLabel(
  t: { has(key: string): boolean; (key: string): string },
  role: { code: string; name: string },
): string {
  const key = `roles.${role.code}`;
  return t.has(key) ? t(key) : role.name;
}
