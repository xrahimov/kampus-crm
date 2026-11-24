import { fireEvent, screen } from "@testing-library/react-native";
import { Keyboard } from "react-native";

import { Select } from "@/components/select";
import { clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

afterEach(() => clearClients());

describe("a field that opens a list", () => {
  it("puts the keyboard away first, so it does not come back over the form", async () => {
    // An iPhone gives the keyboard back to the field that had it when the list closes.
    const away = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    const onChange = jest.fn();
    await renderScreen(
      <Select
        label="Group"
        value={null}
        onChange={onChange}
        options={[
          { value: "g1", label: "GE-Morning A1" },
          { value: "g2", label: "IELTS 6.5" },
        ]}
        testID="pick"
      />,
    );
    await fireEvent.press(screen.getByTestId("pick"));
    expect(away).toHaveBeenCalledTimes(1);
    await fireEvent.press(await screen.findByTestId("pick-option-g2"));
    expect(onChange).toHaveBeenCalledWith("g2");
    away.mockRestore();
  });
});
