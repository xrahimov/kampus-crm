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

  it("says what it filters by in a row of filters, and reads the choice of nothing out", async () => {
    const options = [{ value: "g1", label: "GE-Morning A1" }];
    await renderScreen(
      <>
        <Select
          compact
          label="Group"
          value={null}
          onChange={jest.fn()}
          clearLabel="All"
          emptyLabel="Group"
          options={options}
          testID="none"
        />
        <Select
          compact
          label="Group"
          value="g1"
          onChange={jest.fn()}
          clearLabel="All"
          emptyLabel="Group"
          options={options}
          testID="one"
        />
        <Select
          compact
          label="Branch"
          value={null}
          onChange={jest.fn()}
          clearLabel="All branches"
          options={[]}
          testID="plain"
        />
      </>,
    );
    // Not "All": five filters side by side would all say that.
    expect(screen.getByTestId("none")).toHaveTextContent("Group");
    expect(screen.getByTestId("none").props.accessibilityLabel).toBe("Group: All");
    expect(screen.getByTestId("one")).toHaveTextContent("GE-Morning A1");
    expect(screen.getByTestId("plain")).toHaveTextContent("All branches");
    // The list still starts with the row that chooses nothing, by its own name.
    await fireEvent.press(screen.getByTestId("none"));
    expect(await screen.findByTestId("none-option-none")).toHaveTextContent("All");
  });
});
