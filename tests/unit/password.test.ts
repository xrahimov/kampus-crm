import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("produces an argon2id PHC hash and verifies the same password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
  });

  it("rejects a different password", async () => {
    const hash = await hashPassword("one password");
    expect(await verifyPassword(hash, "another password")).toBe(false);
  });

  it("uses a fresh salt every time", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });

  it("treats a malformed stored hash as a mismatch instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });
});
