import { describe, expect, it } from "vitest";

import { diffFields, toAuditJson } from "@/server/audit/audit";

describe("audit helpers", () => {
  it("diffFields lists only changed fields with old and new values", () => {
    const changes = diffFields(
      { name: "A", price: 100, room: "R1" },
      { name: "A", price: 120, room: null as unknown as string },
    );
    expect(changes).toEqual([
      { field: "price", before: 100, after: 120 },
      { field: "room", before: "R1", after: null },
    ]);
  });

  it("toAuditJson makes dates JSON-safe and drops undefined", () => {
    expect(toAuditJson(undefined)).toBeUndefined();
    expect(toAuditJson({ at: new Date("2026-01-01T00:00:00Z"), x: undefined })).toEqual({
      at: "2026-01-01T00:00:00.000Z",
    });
  });
});
