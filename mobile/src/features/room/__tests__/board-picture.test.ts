import { PixelRatio, Platform } from "react-native";
import type Svg from "react-native-svg";

import { boardPicture, bytesFromBase64 } from "@/features/room/board-picture.native";

/*
 * The whiteboard's picture on a phone (A-222): the drawn board is asked for a
 * PNG of the saved size, and the text it answers with becomes bytes.
 */

type Asked = { width: number; height: number };
function board(answer: string | undefined) {
  const toDataURL = jest.fn((done: (base64?: string) => void, _size: Asked) => done(answer));
  return { toDataURL, svg: { toDataURL } as unknown as Svg };
}

const realOS = Platform.OS;
afterEach(() => {
  Platform.OS = realOS;
  jest.restoreAllMocks();
});

describe("the whiteboard's picture on a phone", () => {
  it("turns base64 text into bytes, line breaks or not", () => {
    // "iVBORw==" is the first four bytes of every PNG.
    expect(Array.from(bytesFromBase64("iVBORw=="))).toEqual([137, 80, 78, 71]);
    expect(Array.from(bytesFromBase64("iVBO\nRw==\n"))).toEqual([137, 80, 78, 71]);
  });

  it("asks an Android board for 1600 by 900 dots", async () => {
    Platform.OS = "android";
    jest.spyOn(PixelRatio, "get").mockReturnValue(2.75);
    const { toDataURL, svg } = board("iVBORw==");
    expect(Array.from(await boardPicture(svg, []))).toEqual([137, 80, 78, 71]);
    expect(toDataURL.mock.calls[0]![1]).toEqual({ width: 1600, height: 900 });
  });

  it("asks an iPhone for that many dots in its own points", async () => {
    Platform.OS = "ios";
    jest.spyOn(PixelRatio, "get").mockReturnValue(3);
    const { toDataURL, svg } = board("iVBORw==");
    await boardPicture(svg, []);
    expect(toDataURL.mock.calls[0]![1]).toEqual({ width: 533, height: 300 });
  });

  it("fails when the board is not on the screen or gives no picture", async () => {
    await expect(boardPicture(null, [])).rejects.toThrow();
    await expect(boardPicture(board(undefined).svg, [])).rejects.toThrow();
  });
});
