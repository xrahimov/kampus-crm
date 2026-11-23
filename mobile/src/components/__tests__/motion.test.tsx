import { act, render } from "@testing-library/react-native";

import { useArrival } from "@/components/motion";
import { barSpace } from "@/components/nav";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

/* How things arrive (A-224), and the room the floating bar takes. */

function Probe({ seen }: { seen: (arrival: unknown) => void }) {
  seen(useArrival());
  return null;
}

describe("what appears together arrives one after the other", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("animates the first two dozen and lets the rest of a long list simply be there", async () => {
    const arrivals: unknown[] = [];
    await render(
      <>
        {Array.from({ length: 30 }, (_, index) => (
          <Probe key={index} seen={(arrival) => arrivals.push(arrival)} />
        ))}
      </>,
    );
    expect(arrivals.slice(0, 24).every(Boolean)).toBe(true);
    expect(arrivals.slice(24).every((arrival) => arrival === undefined)).toBe(true);
  });

  it("starts the count again once nothing has appeared for a moment", async () => {
    const arrivals: unknown[] = [];
    const seen = (arrival: unknown) => arrivals.push(arrival);
    await render(
      <>
        {Array.from({ length: 30 }, (_, index) => (
          <Probe key={index} seen={seen} />
        ))}
      </>,
    );
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    arrivals.length = 0;
    await render(<Probe seen={seen} />);
    expect(arrivals[0]).toBeTruthy();
  });
});

describe("the room a screen leaves for the floating bar", () => {
  it("is the bar and its margin above the home indicator", () => {
    // A phone with a home indicator (34 points): the bar sits right above it.
    expect(barSpace(34)).toBe(64 + 4);
    // A phone without one: the bar keeps 12 points from the edge.
    expect(barSpace(0)).toBe(64 + 12 + 4);
  });
});
