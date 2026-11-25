import { fireEvent, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { Check } from "@/components/check";
import { clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

const os = Platform.OS;
afterEach(() => {
  Platform.OS = os;
  clearClients();
});

describe("a tick box beside something else in a row", () => {
  it("on Android gets its width from a copy one space longer, so no letter is lost (A-268)", async () => {
    Platform.OS = "android";
    const onChange = jest.fn();
    await renderScreen(
      <Check label="Arxiv" value={false} onChange={onChange} inline testID="box" />,
    );
    // The unseen copy comes first and sets the width; a reader is told the words once.
    const [copy, shown] = screen.getAllByText("Arxiv", { includeHiddenElements: true });
    expect(copy!.props.children).toBe("Arxiv\u00A0");
    expect(copy!.props.numberOfLines).toBe(1);
    expect(copy!.props.importantForAccessibility).toBe("no");
    expect(shown!.props.children).toBe("Arxiv");
    expect(screen.getByTestId("box").props.accessibilityLabel).toBe("Arxiv");
    await fireEvent.press(screen.getByTestId("box"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("elsewhere draws its words once, as before", async () => {
    await renderScreen(<Check label="Archive" value onChange={jest.fn()} inline testID="box" />);
    expect(screen.getAllByText(/Archive/, { includeHiddenElements: true })).toHaveLength(1);
  });
});
