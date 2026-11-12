import { describe, expect, it } from "vitest";

import { cameraConstraints, nextCameraId } from "@/features/video/call-engine";

describe("camera switching (A-181)", () => {
  it("cycles through the browser's cameras and wraps around", () => {
    expect(nextCameraId(["front", "back"], "front")).toBe("back");
    expect(nextCameraId(["front", "back"], "back")).toBe("front");
    expect(nextCameraId(["a", "b", "c"], "b")).toBe("c");
  });

  it("starts from the first camera when the current one is unknown", () => {
    expect(nextCameraId(["front", "back"], null)).toBe("front");
    expect(nextCameraId(["front", "back"], "gone")).toBe("front");
  });

  it("offers nothing with one camera or none", () => {
    expect(nextCameraId(["only"], "only")).toBeNull();
    expect(nextCameraId([], null)).toBeNull();
  });

  it("keeps the role's picture size when the camera changes", () => {
    expect(cameraConstraints("STUDENT").width).toEqual({ ideal: 480 });
    expect(cameraConstraints("HOST").width).toEqual({ ideal: 960 });
  });
});
