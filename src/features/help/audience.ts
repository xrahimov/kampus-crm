import type { HelpAudience } from "./catalog";

/** Which manual a reader with these roles opens first. */
export function audienceForRoles(roles: readonly string[]): HelpAudience {
  if (roles.includes("CEO")) return "CEO";
  if (roles.includes("BRANCH_MANAGER")) return "BRANCH_MANAGER";
  if (roles.includes("CASHIER")) return "CASHIER";
  if (roles.includes("TEACHER") || roles.includes("SUPPORT_TEACHER")) return "TEACHER";
  return "ADMIN";
}
