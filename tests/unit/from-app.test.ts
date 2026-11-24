import { describe, expect, it } from "vitest";

import { openedFromApp } from "@/lib/from-app";

describe("a page opened from the phone app", () => {
  it("is known by its cookie among the others", () => {
    expect(openedFromApp("kampus_csrf=abc; kampus_from_app=1")).toBe(true);
    expect(openedFromApp("kampus_from_app=1")).toBe(true);
  });

  it("is not assumed without it", () => {
    expect(openedFromApp("")).toBe(false);
    expect(openedFromApp("kampus_csrf=abc")).toBe(false);
    expect(openedFromApp("other_kampus_from_app=1")).toBe(false);
  });
});
