import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { HowToVideo } from "@/features/sign-in/how-to-video";
import { answer, clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

/*
 * The how-to video under the sign-in form (A-229): offered only where the
 * server has it, and nothing of the film is fetched before the row is pressed.
 * The line about who approves a new account shows either way.
 */

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
const players = () =>
  (jest.requireMock("expo-video") as { __players: Array<{ source: string; play: jest.Mock }> })
    .__players;

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  players().length = 0;
});
afterEach(clearClients);

describe("the how-to video on the sign-in screen", () => {
  it("asks the server for one byte of the video in the app's language", async () => {
    fetchMock.mockResolvedValue(answer(206));
    await renderScreen(<HowToVideo id="app-sign-in" />);
    await screen.findByTestId("how-to-video-play");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/v1\/help-videos\/en\/app-sign-in$/);
    expect(init?.headers).toEqual({ Range: "bytes=0-0" });
    expect(screen.getByText("How to sign in for the first time")).toBeTruthy();
    expect(screen.getByTestId("first-sign-in-note")).toHaveTextContent(
      /centre’s staff approve your account/,
    );
    // Nothing plays, and no player exists, until the row is pressed.
    expect(players()).toHaveLength(0);
  });

  it("opens into a player that starts by itself", async () => {
    fetchMock.mockResolvedValue(answer(206));
    await renderScreen(<HowToVideo id="app-student" />);
    await fireEvent.press(await screen.findByTestId("how-to-video-play"));
    expect(screen.getByTestId("how-to-video-player")).toBeTruthy();
    expect(screen.queryByTestId("how-to-video-play")).toBeNull();
    // The same title at the student's door, and the line stays under the player.
    expect(screen.getByTestId("how-to-video-player").props.accessibilityLabel).toBe(
      "How to sign in for the first time",
    );
    expect(screen.getByTestId("first-sign-in-note")).toBeTruthy();
    expect(players()).toHaveLength(1);
    expect(players()[0]!.source).toMatch(/\/help-videos\/en\/app-student$/);
    expect(players()[0]!.play).toHaveBeenCalledTimes(1);
  });

  it("shows the line alone where the server has no such video, or cannot be reached", async () => {
    fetchMock.mockResolvedValueOnce(answer(404));
    await renderScreen(<HowToVideo id="app-sign-in" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("how-to-video-play")).toBeNull();
    expect(screen.getByTestId("first-sign-in-note")).toBeTruthy();

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await renderScreen(<HowToVideo id="app-student" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("how-to-video-play")).toBeNull();
  });
});
