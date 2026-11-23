import { clock, fileSource, opensWithoutSession } from "@/features/room/file-source";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("@/lib/api", () => ({
  API_ORIGIN: "https://kampus.test",
  sessionHeaders: () => ({ "x-kampus-app": "1", Authorization: "Bearer abc" }),
}));

/* Where a lesson's file is, as the app asks for it (A-210). */

describe("a lesson file's address in the app", () => {
  it("sends the session with a staff file", () => {
    expect(fileSource("/api/v1/files/k1")).toEqual({
      uri: "https://kampus.test/api/v1/files/k1",
      headers: { "x-kampus-app": "1", Authorization: "Bearer abc" },
    });
  });

  it("sends nothing with a student's link: the link is the key", () => {
    expect(fileSource("/api/v1/public/class/tok/files/k1")).toEqual({
      uri: "https://kampus.test/api/v1/public/class/tok/files/k1",
    });
  });

  it("never sends the session to another site", () => {
    expect(fileSource("https://example.org/api/v1/files/k1")).toEqual({
      uri: "https://example.org/api/v1/files/k1",
    });
  });

  it("knows which addresses a browser opens by itself", () => {
    expect(opensWithoutSession("https://example.org/a.pdf")).toBe(true);
    expect(opensWithoutSession("/api/v1/public/class/tok/files/k1")).toBe(true);
    expect(opensWithoutSession("/api/v1/files/k1")).toBe(false);
    expect(opensWithoutSession("api/v1/files/k1")).toBe(false);
  });

  it("writes seconds as a clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65.9)).toBe("1:05");
    expect(clock(3723)).toBe("1:02:03");
    expect(clock(Number.NaN)).toBe("0:00");
    expect(clock(-4)).toBe("0:00");
  });
});
