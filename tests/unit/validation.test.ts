import { describe, expect, it } from "vitest";

import { loginSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("normalises spaces and dashes in the phone number", () => {
    const result = loginSchema.safeParse({ phone: "+998 90 123-45-67", password: "secret123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+998901234567");
  });

  it("rejects numbers that are not Uzbek mobiles", () => {
    const result = loginSchema.safeParse({ phone: "+1 555 123 4567", password: "secret123" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("validation.phone");
  });

  it("rejects short passwords with an i18n key", () => {
    const result = loginSchema.safeParse({ phone: "+998901234567", password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("validation.passwordMin");
  });
});
