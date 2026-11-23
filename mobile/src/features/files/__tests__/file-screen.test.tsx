import { act, screen } from "@testing-library/react-native";
import * as ExpoVideo from "expo-video";

import { FileScreen, fileRoute } from "@/features/files/file-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
}));

/*
 * The page that opens one file inside the app. A lesson recording (A-213)
 * continues where the student stopped and tells the server where it is.
 */

interface FakePlayer {
  source: unknown;
  currentTime: number;
  duration: number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  emit: (name: string, payload: unknown) => void;
}
const players = (ExpoVideo as unknown as { __players: FakePlayer[] }).__players;
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
const realFetch = globalThis.fetch;
const RECORDING = "/api/v1/public/class/tok/files/recordings/a.webm";

beforeEach(() => {
  players.length = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(answer(204));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

function progress(): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => url.endsWith("/materials/m2/progress"))
    .map(([, init]) => sentBody(init));
}

describe("a file opened in the app", () => {
  it("builds the address of a recording with where to continue and where to report", () => {
    expect(fileRoute("/f.pdf", "Unit 3")).toEqual({
      pathname: "/file",
      params: { url: "/f.pdf", title: "Unit 3" },
    });
    const route = fileRoute(RECORDING, "Lesson recording", {
      token: "tok",
      material: "m2",
      stream: null,
      resume: 40.9,
    });
    expect(route.params).toEqual({
      url: RECORDING,
      title: "Lesson recording",
      recording: "1",
      token: "tok",
      material: "m2",
      stream: "",
      resume: "40",
    });
    // A teacher's recording keeps no place: there is no personal page to keep it on.
    expect(fileRoute("/api/v1/files/rec/a", "Lesson recording", { stream: null }).params).toEqual({
      url: "/api/v1/files/rec/a",
      title: "Lesson recording",
      recording: "1",
      token: "",
      material: "",
      stream: "",
      resume: "0",
    });
  });

  it("continues a recording from the student's place and plays the streaming copy", async () => {
    mockParams = {
      url: RECORDING,
      title: "Lesson recording",
      token: "tok",
      material: "m2",
      stream: "/api/v1/public/class/tok/files/hls/a.m3u8",
      resume: "40",
    };
    await renderScreen(<FileScreen />);
    expect(screen.getByTestId("file-video")).toBeTruthy();
    const player = players[players.length - 1]!;
    expect(String(player.source)).toMatch(/\/files\/hls\/a\.m3u8$/);
    expect(player.currentTime).toBe(40);
  });

  it("does not jump when the place is at the very start or the very end", async () => {
    mockParams = { url: RECORDING, token: "tok", material: "m2", stream: "", resume: "118" };
    await renderScreen(<FileScreen />);
    expect(players[players.length - 1]!.currentTime).toBe(0);
  });

  it("tells the server where a playing recording is, and again on pause", async () => {
    mockParams = { url: RECORDING, token: "tok", material: "m2", stream: "", resume: "0" };
    await renderScreen(<FileScreen />);
    const player = players[players.length - 1]!;
    await act(async () => {
      player.play();
      player.currentTime = 55;
      player.emit("timeUpdate", { currentTime: 55 });
    });
    expect(progress()).toEqual([{ positionSec: 55, durationSec: 120 }]);
    // A second later is too soon for another report.
    await act(async () => {
      player.currentTime = 56;
      player.emit("timeUpdate", { currentTime: 56 });
    });
    expect(progress()).toHaveLength(1);
    await act(async () => {
      player.pause();
    });
    expect(progress()).toEqual([
      { positionSec: 55, durationSec: 120 },
      { positionSec: 56, durationSec: 120 },
    ]);
  });

  it("reports nothing for a video that is not a lesson recording", async () => {
    mockParams = { url: "/api/v1/public/class/tok/files/documents/clip.mp4", title: "Clip" };
    await renderScreen(<FileScreen />);
    const player = players[players.length - 1]!;
    await act(async () => {
      player.play();
      player.emit("timeUpdate", { currentTime: 30 });
      player.pause();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
