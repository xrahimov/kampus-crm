import { describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from "@/lib/rbac/default-roles";
import { hasPermission, isPermission, PERMISSIONS } from "@/lib/rbac/permissions";
import { AppError } from "@/server/errors/app-error";
import { authorize, authorizeBranch, branchScope, can, type Actor } from "@/server/rbac/authorize";

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "u1",
  fullName: "Test",
  organizationId: "org_test",
  roles: ["ADMIN"],
  permissions: ["groups.view", "groups.create"],
  branchIds: ["b1"],
  activeBranchId: null,
  ...overrides,
});

describe("permission catalogue", () => {
  it("has unique codes", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("every default role only references known permissions", () => {
    for (const role of SYSTEM_ROLES) {
      for (const grant of DEFAULT_ROLE_PERMISSIONS[role]) {
        expect(grant === "*" || isPermission(grant), `${role}: ${grant}`).toBe(true);
      }
    }
  });

  it("only the CEO has the wildcard", () => {
    const withStar = SYSTEM_ROLES.filter((r) => DEFAULT_ROLE_PERMISSIONS[r].includes("*"));
    expect(withStar).toEqual(["CEO"]);
  });

  it("teachers cannot approve payroll or manage settings", () => {
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.TEACHER, "finance.payroll.approve")).toBe(false);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.TEACHER, "settings.org")).toBe(false);
  });
});

describe("authorize", () => {
  it("allows a granted permission and denies a missing one", () => {
    expect(can(actor(), "groups.view")).toBe(true);
    expect(can(actor(), "groups.delete")).toBe(false);
    expect(() => authorize(actor(), "groups.delete")).toThrow(AppError);
  });

  it("wildcard grants everything", () => {
    expect(can(actor({ permissions: ["*"] }), "finance.payroll.approve")).toBe(true);
  });

  it("branch access is limited to the branches the login carries, even for the CEO (A-108)", () => {
    expect(() => authorizeBranch(actor(), "b1")).not.toThrow();
    expect(() => authorizeBranch(actor(), "b2")).toThrow(AppError);
    // A CEO's list holds every branch of their own centre; another centre's branch is not in it.
    expect(() => authorizeBranch(actor({ permissions: ["*"] }), "b2")).toThrow(AppError);
    expect(() =>
      authorizeBranch(actor({ permissions: ["*"], branchIds: ["b1", "b2"] }), "b2"),
    ).not.toThrow();
  });

  it("branchScope narrows to the active branch or the allowed set, never wider", () => {
    expect(branchScope(actor({ activeBranchId: "b1" }))).toEqual({ branchId: "b1" });
    expect(branchScope(actor())).toEqual({ branchId: { in: ["b1"] } });
    expect(branchScope(actor({ permissions: ["*"], branchIds: ["b1", "b2"] }))).toEqual({
      branchId: { in: ["b1", "b2"] },
    });
    expect(() => branchScope(actor({ activeBranchId: "b2" }))).toThrow(AppError);
  });
});
