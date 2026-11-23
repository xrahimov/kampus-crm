import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text } from "react-native";

import { Backdrop, Glass, GlassScope } from "@/components/glass";

/*
 * Glass (A-224): one component, drawn with the best the device has.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

let mockLiquid = false;
jest.mock("expo-glass-effect", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    GlassView: (props: object) => React.createElement("GlassView", { ...props, testID: "liquid" }),
    isLiquidGlassAvailable: () => mockLiquid,
  };
});
jest.mock("expo-blur", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    BlurView: (props: object) => React.createElement("BlurView", { ...props, testID: "blur" }),
    BlurTargetView: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement("BlurTarget", { ...props, testID: "backdrop" }, children),
  };
});

function device(os: "ios" | "android", version: number | string) {
  Platform.OS = os;
  Object.defineProperty(Platform, "Version", { value: version, configurable: true });
}

let reduce: jest.SpyInstance;
const realOS = Platform.OS;
const realVersion = Platform.Version;

beforeEach(() => {
  mockLiquid = false;
  reduce = jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(false);
});
afterEach(() => {
  reduce.mockRestore();
  device(realOS as "ios", realVersion);
});

describe("a pane of glass", () => {
  it("is Apple's own Liquid Glass where the iPhone has it", async () => {
    mockLiquid = true;
    device("ios", "26.0");
    await render(
      <Glass>
        <Text>Today</Text>
      </Glass>,
    );
    expect(screen.getByTestId("liquid")).toBeTruthy();
    expect(screen.queryByTestId("blur")).toBeNull();
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("is a blur of the page on an older iPhone", async () => {
    device("ios", "18.0");
    await render(<Glass />);
    expect(screen.getByTestId("blur")).toBeTruthy();
    expect(screen.queryByTestId("liquid")).toBeNull();
  });

  it("blurs its backdrop on Android 12 and later", async () => {
    device("android", 31);
    await render(
      <GlassScope>
        <Backdrop>
          <Text>Page</Text>
        </Backdrop>
        <Glass />
      </GlassScope>,
    );
    expect(screen.getByTestId("backdrop")).toBeTruthy();
    expect(screen.getByTestId("blur").props.blurMethod).toBe("dimezisBlurViewSdk31Plus");
  });

  it("gives the backdrop the page's own colour, so Android does not blur the window's instead", async () => {
    device("android", 35);
    await render(
      <GlassScope>
        <Backdrop style={{ flex: 1 }} />
        <Glass />
      </GlassScope>,
    );
    const style = StyleSheet.flatten(screen.getByTestId("backdrop").props.style);
    expect(style.backgroundColor).toEqual(expect.any(String));
    expect(style.flex).toBe(1);
  });

  it("is thinner on Android, whose blur brings a tint of its own", async () => {
    device("android", 35);
    const android = await render(
      <GlassScope>
        <Backdrop />
        <Glass />
      </GlassScope>,
    );
    const there = screen.getByTestId("blur").props.intensity as number;
    await android.unmount();
    device("ios", "18.0");
    await render(<Glass />);
    expect(there).toBeLessThan(screen.getByTestId("blur").props.intensity as number);
  });

  it("is nearly solid on Android where nothing can be blurred", async () => {
    // Before Android 12 there is no blur; and glass with no backdrop has nothing to blur.
    for (const version of [30, 36]) {
      device("android", version);
      const page = await render(
        version === 30 ? (
          <GlassScope>
            <Backdrop />
            <Glass />
          </GlassScope>
        ) : (
          <Glass />
        ),
      );
      expect(screen.queryByTestId("blur")).toBeNull();
      await page.unmount();
    }
  });

  it("never blurs itself: glass inside a backdrop does not take that backdrop", async () => {
    device("android", 36);
    await render(
      <GlassScope>
        <Backdrop>
          <Glass />
        </Backdrop>
      </GlassScope>,
    );
    expect(screen.queryByTestId("blur")).toBeNull();
  });

  it("is solid when the device asks for less transparency", async () => {
    mockLiquid = true;
    reduce.mockResolvedValue(true);
    device("ios", "26.0");
    await render(<Glass />);
    await screen.findByTestId("glass-solid");
    expect(screen.queryByTestId("liquid")).toBeNull();
    expect(screen.queryByTestId("blur")).toBeNull();
  });
});
