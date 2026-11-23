import { gridColumns } from "@/features/room/look";
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
