/**
 * Views (A-194). Someone who both teaches and runs things, say a Teacher who
 * is also the Branch manager, can look at Kampus from either side: the
 * teaching view carries only their teaching roles, so they see what a teacher
 * sees (own groups, lessons, homework), and the full view carries every role.
 * A view never adds a permission; it only leaves some of the person's own out.
 */
export const STAFF_VIEWS = ["TEACHING", "FULL"] as const;
export type StaffView = (typeof STAFF_VIEWS)[number];

/** Where each view starts: a teacher's day, or the centre's numbers. */
export const VIEW_HOME: Record<StaffView, string> = { TEACHING: "/today", FULL: "/dashboard" };

/**
 * The roles that teach: the same two as `TEACHER_KIND_ROLE` (a test holds them
 * together). Written out here because the validation files read this one.
 */
export const TEACHING_ROLE_CODES: readonly string[] = ["TEACHER", "SUPPORT_TEACHER"];

export const isTeachingRole = (code: string): boolean => TEACHING_ROLE_CODES.includes(code);

export interface ViewRole {
  code: string;
  name: string;
  permissions: string[];
}

export interface ResolvedView<R extends ViewRole> {
  current: StaffView;
  /** Both views exist for this person, so the header shows the switch. */
  canSwitch: boolean;
  /** The roles in force in the current view. */
  roles: R[];
  /** The roles behind each side of the switch, for its labels. */
  teachingRoles: R[];
  otherRoles: R[];
}

/**
 * Splits a person's active roles into the two views and picks the one in force.
 * `chosen` is what they last picked; until they pick, they see everything.
 */
export function resolveStaffView<R extends ViewRole>(
  roles: R[],
  chosen: StaffView | null,
): ResolvedView<R> {
  const teachingRoles = roles.filter((r) => isTeachingRole(r.code));
  const otherRoles = roles.filter((r) => !isTeachingRole(r.code));
  const teachingGrants = new Set(teachingRoles.flatMap((r) => r.permissions));
  // The other roles must add something, or the two views would be the same pages.
  const adds = otherRoles.some((r) => r.permissions.some((p) => !teachingGrants.has(p)));
  const canSwitch = teachingRoles.length > 0 && adds;

  if (canSwitch) {
    const current: StaffView = chosen === "TEACHING" ? "TEACHING" : "FULL";
    return {
      current,
      canSwitch,
      roles: current === "TEACHING" ? teachingRoles : roles,
      teachingRoles,
      otherRoles,
    };
  }
  // One view only: a teacher is always in the teaching view, everyone else in the full one.
  const onlyTeaches = teachingRoles.length > 0 && otherRoles.length === 0;
  return {
    current: onlyTeaches ? "TEACHING" : "FULL",
    canSwitch: false,
    roles,
    teachingRoles,
    otherRoles,
  };
}
