import { AppState, type AppStateStatus } from "react-native";

import { AFTER_SHEET_MS, BROADCAST_WAIT_MS, startBroadcast } from "@/features/room/ios-broadcast";

/*
 * Starting a screen share on an iPhone or iPad (A-223): the app opens the
 * system's sheet and waits for its extension to say that it started. Here the
 * extension and the sheet are stand-ins.
 */

let mockHeard: ((state: "started" | "stopped") => void) | null = null;
const mockShow = jest.fn(async () => true);
const mockStopHearing = jest.fn();
jest.mock("../../../../modules/kampus-call", () => ({
  broadcast: {
    available: true,
    show: () => mockShow(),
    listen: (listener: (state: "started" | "stopped") => void) => {
      mockHeard = listener;
      return mockStopHearing;
    },
  },
}));

let appChanged: ((state: AppStateStatus) => void) | null = null;
const removeAppListener = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  mockHeard = null;
  appChanged = null;
  mockShow.mockClear();
  mockShow.mockResolvedValue(true);
  mockStopHearing.mockClear();
  removeAppListener.mockClear();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appChanged = listener as (state: AppStateStatus) => void;
    return { remove: removeAppListener } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** What became of a promise so far, without waiting for it. */
function watch(promise: Promise<void>) {
  const seen: { outcome: "waiting" | "started" | unknown } = { outcome: "waiting" };
  promise.then(
    () => (seen.outcome = "started"),
    (error: unknown) => (seen.outcome = error),
  );
  return seen;
}

describe("starting a screen share on an iPhone", () => {
  it("opens the system's sheet and is ready when the extension says it started", async () => {
    const seen = watch(startBroadcast());
    expect(mockShow).toHaveBeenCalledTimes(1);
    // The sheet is up: the app is not in front while the person presses Start Broadcast.
    appChanged?.("inactive");
    await jest.advanceTimersByTimeAsync(4_000);
    expect(seen.outcome).toBe("waiting");

    mockHeard?.("started");
    await jest.advanceTimersByTimeAsync(0);
    expect(seen.outcome).toBe("started");
    // Nothing keeps listening afterwards.
    expect(mockStopHearing).toHaveBeenCalledTimes(1);
    expect(removeAppListener).toHaveBeenCalledTimes(1);
  });

  it("reads a sheet closed without starting as the person's own choice, not an error", async () => {
    const seen = watch(startBroadcast());
    appChanged?.("inactive");
    await jest.advanceTimersByTimeAsync(1_500);
    appChanged?.("active");
    await jest.advanceTimersByTimeAsync(AFTER_SHEET_MS - 1);
    expect(seen.outcome).toBe("waiting");
    await jest.advanceTimersByTimeAsync(1);
    // The name a browser gives a closed picker: the lesson shows no error for it.
    expect(seen.outcome).toEqual({ name: "NotAllowedError", message: "" });
  });

  it("still takes a start that comes just after the sheet closed (the countdown runs on)", async () => {
    const seen = watch(startBroadcast());
    appChanged?.("inactive");
    await jest.advanceTimersByTimeAsync(800);
    appChanged?.("active");
    await jest.advanceTimersByTimeAsync(3_000);
    mockHeard?.("started");
    await jest.advanceTimersByTimeAsync(0);
    expect(seen.outcome).toBe("started");
    await jest.advanceTimersByTimeAsync(AFTER_SHEET_MS);
    expect(seen.outcome).toBe("started");
  });

  it("stops waiting after half a minute when nothing happens", async () => {
    const seen = watch(startBroadcast());
    await jest.advanceTimersByTimeAsync(BROADCAST_WAIT_MS - 1);
    expect(seen.outcome).toBe("waiting");
    await jest.advanceTimersByTimeAsync(1);
    expect(seen.outcome).toEqual({ name: "NotAllowedError", message: "" });
  });

  it("fails plainly when the sheet could not be shown", async () => {
    mockShow.mockResolvedValue(false);
    const seen = watch(startBroadcast());
    await jest.advanceTimersByTimeAsync(0);
    expect(seen.outcome).toBeInstanceOf(Error);
  });

  it("ignores the extension saying it stopped while waiting for a start", async () => {
    const seen = watch(startBroadcast());
    mockHeard?.("stopped");
    await jest.advanceTimersByTimeAsync(100);
    expect(seen.outcome).toBe("waiting");
  });
});
