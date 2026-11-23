import { act, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen, usePullToReload } from "@/components/surface";
import { clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

/*
 * The page under a floating header (A-224, A-228): where the room for the
 * header is kept, and the sign that the page is reloading after a pull.
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
  it("is the scroll view's own inset on an iPhone, so the page rests right under the header", async () => {
    Platform.OS = "ios";
    await renderScreen(page);
    const scroll = screen.getByTestId("screen-scroll");
    const top = scroll.props.contentInset.top as number;
    expect(top).toBeGreaterThan(0);
    expect(scroll.props.contentOffset).toEqual({ x: 0, y: -top });
    // Only the page's own margin is left as padding.
    expect(columnPadding()).toBeLessThan(top);
  });

  it("is padding on Android, with the system's spinner moved down by as much", async () => {
    Platform.OS = "android";
    await renderScreen(page);
    const scroll = screen.getByTestId("screen-scroll");
    expect(scroll.props.contentInset).toBeUndefined();
    const offset = scroll.props.refreshControl.props.progressViewOffset as number;
    expect(offset).toBeGreaterThan(0);
    expect(columnPadding()).toBeGreaterThan(offset);
    expect(screen.queryByTestId("screen-reloading")).toBeNull();
  });
});

/** The page is dragged down by this much below its resting place and let go. */
async function dragAndLetGo(by: number) {
  const scroll = screen.getByTestId("screen-scroll");
  const rest = scroll.props.contentOffset.y as number;
  const at = { nativeEvent: { contentOffset: { x: 0, y: rest - by } } };
  await act(async () => {
    scroll.props.onScroll(at);
    scroll.props.onScrollEndDrag(at);
  });
}

describe("the reload sign on an iPhone", () => {
  beforeEach(() => {
    Platform.OS = "ios";
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  const spinning = () => screen.getByTestId("screen-reloading").props.animating;

  it("is the app's own: the system's spinner is not used", async () => {
    await renderScreen(page);
    expect(screen.getByTestId("screen-scroll").props.refreshControl).toBeUndefined();
    expect(spinning()).toBe(false);
  });

  it("is not there on a page with nothing to reload", async () => {
    await renderScreen(
      <Screen>
        <Text>Page</Text>
      </Screen>,
    );
    expect(screen.queryByTestId("screen-reloading")).toBeNull();
    expect(screen.getByTestId("screen-scroll").props.onScrollEndDrag).toBeUndefined();
  });

  it("reloads when the page is pulled far enough and let go, not for a small tug", async () => {
    const onRefresh = jest.fn();
    await renderScreen(
      <Screen onRefresh={onRefresh} refreshing={false}>
        <Text>Page</Text>
      </Screen>,
    );
    await dragAndLetGo(30);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(spinning()).toBe(false);
    await dragAndLetGo(90);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(spinning()).toBe(true);
    // A second pull while it reloads does not start another one.
    await dragAndLetGo(90);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("starts to turn once the pull is far enough, before the page is let go", async () => {
    const onRefresh = jest.fn();
    await renderScreen(
      <Screen onRefresh={onRefresh} refreshing={false}>
        <Text>Page</Text>
      </Screen>,
    );
    const scroll = screen.getByTestId("screen-scroll");
    const rest = scroll.props.contentOffset.y as number;
    const dragTo = (by: number) =>
      act(async () =>
        screen
          .getByTestId("screen-scroll")
          .props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: rest - by } } }),
      );
    await dragTo(30);
    expect(spinning()).toBe(false);
    await dragTo(60);
    expect(spinning()).toBe(true);
    // Pushed back up without letting go: nothing reloads.
    await dragTo(10);
    expect(spinning()).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("serves a list that scrolls by itself, like the tablet's lessons of the day", async () => {
    const onRefresh = jest.fn();
    function Lessons() {
      const reload = usePullToReload({ onRefresh });
      return (
        <View>
          <ScrollView testID="lessons" {...reload.scrollProps}>
            <Text>Lesson</Text>
          </ScrollView>
          {reload.sign}
        </View>
      );
    }
    await renderScreen(<Lessons />);
    const at = { nativeEvent: { contentOffset: { x: 0, y: -60 } } };
    await act(async () => {
      screen.getByTestId("lessons").props.onScroll(at);
      screen.getByTestId("lessons").props.onScrollEndDrag(at);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(spinning()).toBe(true);
  });

  it("stays long enough to be seen, however quick the server", async () => {
    await renderScreen(
      <Screen onRefresh={() => undefined} refreshing={false}>
        <Text>Page</Text>
      </Screen>,
    );
    await dragAndLetGo(90);
    await act(async () => jest.advanceTimersByTime(500));
    expect(spinning()).toBe(true);
    await act(async () => jest.advanceTimersByTime(300));
    expect(spinning()).toBe(false);
  });

  it("stays while the page is still reloading, and does not show for a reload nobody pulled", async () => {
    let reloading: (now: boolean) => Promise<void> = async () => undefined;
    function Page() {
      const [now, setNow] = useState(true);
      reloading = (next) => act(async () => setNow(next));
      return (
        <Screen onRefresh={() => undefined} refreshing={now}>
          <Text>Page</Text>
        </Screen>
      );
    }
    await renderScreen(<Page />);
    // The app reloads by itself (it came back to the front): no sign.
    expect(spinning()).toBe(false);
    await reloading(false);
    await dragAndLetGo(90);
    await reloading(true);
    await act(async () => jest.advanceTimersByTime(3000));
    expect(spinning()).toBe(true);
    await reloading(false);
    await act(async () => jest.advanceTimersByTime(10));
    expect(spinning()).toBe(false);
  });
});

describe("the refresh spinner on Android", () => {
  beforeEach(() => {
    Platform.OS = "android";
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  const shown = () => screen.getByTestId("screen-scroll").props.refreshControl.props.refreshing;
  const pull = () =>
    act(async () => screen.getByTestId("screen-scroll").props.refreshControl.props.onRefresh());

  it("shows for a pull and stays long enough to be seen", async () => {
    const onRefresh = jest.fn();
    await renderScreen(
      <Screen onRefresh={onRefresh} refreshing={false}>
        <Text>Page</Text>
      </Screen>,
    );
    expect(shown()).toBe(false);
    await pull();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(true);
    await act(async () => jest.advanceTimersByTime(500));
    expect(shown()).toBe(true);
    await act(async () => jest.advanceTimersByTime(300));
    expect(shown()).toBe(false);
  });
});
