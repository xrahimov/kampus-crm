import { describe, expect, it } from "vitest";

import { screenSending, shareFailure, videoBitrate } from "@/features/video/call-engine";
import { pipOrder } from "@/features/video/pip-order";
import { videoSyncSchema } from "@/lib/validation/video";

const error = (name: string, message = "") => Object.assign(new Error(message), { name });

describe("why a screen share did not start (A-200)", () => {
  it("treats a picker the person closed as no error", () => {
    expect(shareFailure(error("NotAllowedError", "Permission denied"), 4000)).toBeNull();
    // Firefox and Safari word it differently; the time still says a picker was shown.
    expect(
      shareFailure(
        error("NotAllowedError", "The request is not allowed by the user agent or the platform"),
        2500,
      ),
    ).toBeNull();
  });

  it("names a refusal by the computer or the browser", () => {
    expect(shareFailure(error("NotAllowedError", "Permission denied by system"), 4000)).toBe(
      "blocked",
    );
    // Rejected before any picker could have been shown.
    expect(shareFailure(error("NotAllowedError", "Permission denied"), 30)).toBe("blocked");
    expect(shareFailure(error("SecurityError"), 10)).toBe("blocked");
  });

  it("names a window or screen that could not be captured", () => {
    expect(shareFailure(error("NotReadableError", "Could not start video source"), 3000)).toBe(
      "unreadable",
    );
    expect(shareFailure(error("AbortError"), 3000)).toBe("unreadable");
    expect(shareFailure(error("NotFoundError"), 3000)).toBe("unreadable");
  });

  it("calls everything else a failure, whatever was thrown", () => {
    expect(shareFailure(error("InvalidStateError"), 5)).toBe("failed");
    expect(shareFailure("boom", 5)).toBe("failed");
    expect(shareFailure(null, 5)).toBe("failed");
  });
});

describe("how a shared screen is sent (A-200)", () => {
  it("gives a screen more than a camera, whoever shares", () => {
    for (const receivers of [1, 3, 6, 11]) {
      expect(screenSending(receivers, 1080).maxBitrate).toBeGreaterThan(
        videoBitrate("STUDENT", receivers),
      );
      expect(screenSending(receivers, 1080).maxBitrate).toBeGreaterThan(
        videoBitrate("HOST", receivers),
      );
    }
  });

  it("sends a smaller picture as the room grows", () => {
    expect(screenSending(2, 1080)).toEqual({ maxBitrate: 1_500_000, scale: 1 });
    expect(screenSending(5, 1080)).toEqual({ maxBitrate: 1_000_000, scale: 1.2 });
    expect(screenSending(11, 1080)).toEqual({ maxBitrate: 700_000, scale: 1.5 });
  });

  it("never enlarges a small window and scales an oversized capture down", () => {
    expect(screenSending(11, 600).scale).toBe(1);
    expect(screenSending(1, 1800).scale).toBe(1.667);
  });

  it("keeps the whole upload of a full room within about 8 Mbit/s", () => {
    expect(screenSending(11, 1080).maxBitrate * 11).toBeLessThanOrEqual(8_000_000);
  });
});

describe("who the mini window shows (A-201)", () => {
  const peers = [
    { id: "s1", role: "STUDENT", screen: false },
    { id: "t", role: "HOST", screen: false },
    { id: "s2", role: "STUDENT", screen: false },
    { id: "s3", role: "STUDENT", screen: false },
  ];

  it("puts the teacher first, then the others as they joined", () => {
    expect(pipOrder(peers, { pinned: null, spotlight: null })).toEqual(["t", "s1", "s2", "s3"]);
  });

  it("puts a shared screen before the teacher and the spotlight", () => {
    const sharing = peers.map((p) => (p.id === "s3" ? { ...p, screen: true } : p));
    expect(pipOrder(sharing, { pinned: null, spotlight: "s2" })).toEqual(["s3", "s2", "t", "s1"]);
  });

  it("lets the viewer's own pin win", () => {
    const sharing = peers.map((p) => (p.id === "t" ? { ...p, screen: true } : p));
    expect(pipOrder(sharing, { pinned: "s2", spotlight: null })[0]).toBe("s2");
  });

  it("shows nobody when nobody else is there", () => {
    expect(pipOrder([], { pinned: null, spotlight: null })).toEqual([]);
  });
});

describe("a browser's problem report (A-200)", () => {
  const secret = "s".repeat(32);

  it("travels with a poll", () => {
    const parsed = videoSyncSchema.parse({
      secret,
      issue: { kind: "share", reason: "blocked", detail: "NotAllowedError: denied by system" },
    });
    expect(parsed.issue?.reason).toBe("blocked");
  });

  it("is refused when oversized or of an unknown kind", () => {
    expect(
      videoSyncSchema.safeParse({
        secret,
        issue: { kind: "share", reason: "x", detail: "d".repeat(201) },
      }).success,
    ).toBe(false);
    expect(
      videoSyncSchema.safeParse({ secret, issue: { kind: "other", reason: "x" } }).success,
    ).toBe(false);
  });
});
