import { describe, expect, it } from "vitest";

import { evaluateLock } from "@/server/auth/rate-limit";

const now = new Date("2026-10-03T10:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("evaluateLock", () => {
  it("is not locked below the failure threshold", () => {
    const state = evaluateLock([minutesAgo(1), minutesAgo(2), minutesAgo(3), minutesAgo(4)], now);
    expect(state.locked).toBe(false);
  });

  it("locks at five failures inside fifteen minutes", () => {
    const state = evaluateLock([1, 2, 3, 4, 5].map(minutesAgo), now);
    expect(state.locked).toBe(true);
    if (state.locked) {
      // newest failure was 1 minute ago, so the lock lasts 14 more minutes
      expect(state.retryAfterSeconds).toBe(14 * 60);
    }
  });

  it("ignores failures older than the window", () => {
    const state = evaluateLock([16, 17, 18, 19, 20].map(minutesAgo), now);
    expect(state.locked).toBe(false);
  });

  it("counts only failures inside the window when mixed", () => {
    const state = evaluateLock([1, 2, 3, 4, 16].map(minutesAgo), now);
    expect(state.locked).toBe(false);
  });
});
