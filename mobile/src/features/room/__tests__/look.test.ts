import { controlBar, gridColumns } from "@/features/room/look";
import { captureError, captureScale } from "@/features/room/platform.native";
import { initials } from "@/features/room/tile";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("react-native-webrtc", () => ({ registerGlobals: jest.fn(), RTCView: "RTCView" }));
jest.mock("react-native-incall-manager", () => ({}));

/* How the wall of equal tiles is laid out, and what a tile shows without a camera (A-207). */

describe("the wall of tiles", () => {
  it("stacks two people on an upright phone and sets them side by side on a tablet lying down", () => {
    expect(gridColumns(1, 390, 700)).toBe(1);
    expect(gridColumns(2, 390, 700)).toBe(1);
    expect(gridColumns(2, 1194, 700)).toBe(2);
  });

  it("keeps tiles large enough to read a face as the class grows", () => {
    expect(gridColumns(4, 390, 700)).toBe(2);
    expect(gridColumns(6, 390, 700)).toBe(2);
    expect(gridColumns(6, 1194, 700)).toBe(3);
    expect(gridColumns(9, 390, 700)).toBe(3);
    expect(gridColumns(14, 390, 700)).toBe(3);
    expect(gridColumns(14, 1194, 700)).toBe(4);
  });
});

describe("initials on a tile", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Malika Yusupova")).toBe("MY");
    expect(initials("  aziza   karimova qizi ")).toBe("AK");
    expect(initials("Dovud")).toBe("D");
  });

  it("copes with Cyrillic and with nothing at all", () => {
    expect(initials("Шахноза Рахимова")).toBe("ШР");
    expect(initials("")).toBe("?");
  });
});

describe("the bar of round buttons", () => {
  it("keeps full-size buttons where they fit", () => {
    expect(controlBar(6, 390)).toEqual({ size: 46, gap: 8 });
    expect(controlBar(8, 820)).toEqual({ size: 46, gap: 8 });
  });

  it("fits eight buttons on a narrow phone without pushing Leave off the screen", () => {
    for (const width of [360, 375, 390]) {
      const { size, gap } = controlBar(8, width);
      expect(size).toBeGreaterThanOrEqual(38);
      expect(8 * size + 7 * gap + 16).toBeLessThanOrEqual(width);
    }
  });
});

describe("capturing the phone's screen", () => {
  it("names a refusal the way the call engine sorts a browser's", () => {
    // Android gives the browser's name as the message of a plain error.
    expect(captureError({ code: "DOMException", message: "NotAllowedError" })).toEqual({
      name: "NotAllowedError",
      message: "",
    });
    expect(captureError({ name: "AbortError", message: "x" })).toEqual({
      name: "AbortError",
      message: "x",
    });
    expect(captureError(new Error("ScreenTrack is null.")).name).toBe("Error");
  });

  it("sends no more than Full HD from a large screen and leaves a small one alone", () => {
    expect(captureScale(1280)).toBe(1);
    expect(captureScale(1920)).toBe(1);
    expect(captureScale(2400)).toBe(0.8);
    expect(captureScale(2960)).toBe(0.65);
  });
});
