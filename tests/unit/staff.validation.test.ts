import { describe, expect, it } from "vitest";

import { roleSchema, staffCreateSchema, staffUpdateSchema } from "@/lib/validation/staff";

const base = {
  fullName: "Test Person",
  phone: "+998901234567",
  roleCodes: ["TEACHER"],
  branchIds: ["b1"],
  password: "Secret!2026",
};

describe("staff schemas", () => {
  it("accepts a teacher with a percent share and turns empty strings into null", () => {
    const parsed = staffCreateSchema.parse({
      ...base,
      birthDate: "",
      hireDate: "2026-01-10",
      salaryMethod: "PERCENT",
      percentShare: "40",
      fixedSalary: "",
    });
    expect(parsed.birthDate).toBeNull();
    expect(parsed.hireDate).toBe("2026-01-10");
    expect(parsed.percentShare).toBe(40);
    expect(parsed.fixedSalary).toBeNull();
    expect(parsed.gender).toBe("MALE");
  });

  it("rejects a percent share over 100, a bad phone and a short password", () => {
    const result = staffCreateSchema.safeParse({
      ...base,
      phone: "901234567",
      password: "short",
      salaryMethod: "PERCENT",
      percentShare: 120,
    });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["phone", "password", "percentShare"]));
  });

  it("requires at least one role and one branch", () => {
    const result = staffCreateSchema.safeParse({ ...base, roleCodes: [], branchIds: [] });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining(["validation.rolesMin", "validation.branchesMin"]),
    );
  });

  it("treats an empty password on update as 'keep the current one'", () => {
    const parsed = staffUpdateSchema.parse({ fullName: "Renamed", password: "" });
    expect(parsed.password).toBeUndefined();
    expect(parsed.fullName).toBe("Renamed");
  });
});

describe("role schema", () => {
  it("accepts known permissions and rejects unknown ones", () => {
    expect(roleSchema.parse({ name: "Reception", permissions: ["leads.view"] }).isActive).toBe(
      true,
    );
    const bad = roleSchema.safeParse({ name: "X", permissions: ["leads.fly"] });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0]!.message).toBe("validation.permission");
  });
});
