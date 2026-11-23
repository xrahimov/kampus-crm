import { screen } from "@testing-library/react-native";
import { Platform, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/surface";
import { clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

/*
 * The page under a floating header (A-224): where the room for the header is
 * kept decides where the phone draws its refresh spinner.
 */

const realOS = Platform.OS;
afterEach(() => {
  Platform.OS = realOS;
  clearClients();
});

const page = (
  <Screen header={<View style={{ height: 80 }} />} onRefresh={() => undefined}>
    <Text testID="first">First</Text>
  </Screen>
);

/** The padding of the column the page's content sits in. */
function columnPadding(): number {
  const column = screen.getByTestId("first").parent!;
  return StyleSheet.flatten(column.props.style).paddingTop as number;
}

describe("the room under a floating header", () => {
  it("is the scroll view's own inset on an iPhone, so the spinner shows below the header", async () => {
    Platform.OS = "ios";
    await renderScreen(page);
    const scroll = screen.getByTestId("screen-scroll");
    const top = scroll.props.contentInset.top as number;
    expect(top).toBeGreaterThan(0);
    expect(scroll.props.contentOffset).toEqual({ x: 0, y: -top });
    expect(scroll.props.refreshControl.props.progressViewOffset).toBeUndefined();
    // Only the page's own margin is left as padding.
    expect(columnPadding()).toBeLessThan(top);
  });

  it("is padding on Android, with the spinner moved down by as much", async () => {
    Platform.OS = "android";
    await renderScreen(page);
    const scroll = screen.getByTestId("screen-scroll");
    expect(scroll.props.contentInset).toBeUndefined();
    const offset = scroll.props.refreshControl.props.progressViewOffset as number;
    expect(offset).toBeGreaterThan(0);
    expect(columnPadding()).toBeGreaterThan(offset);
  });
});
