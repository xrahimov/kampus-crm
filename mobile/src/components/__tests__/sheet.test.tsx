import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";

import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { Text } from "@/components/text";
import { clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

afterEach(() => clearClients());

/** A menu whose row opens a form: the menu closes and the form is asked for in the same press. */
function MenuThenForm() {
  const [open, setOpen] = useState<"menu" | "form" | null>("menu");
  return (
    <>
      <Sheet open={open === "menu"} onClose={() => setOpen(null)} title="Menu" testID="menu">
        <Button label="Edit" onPress={() => setOpen("form")} testID="menu-edit" />
      </Sheet>
      <Sheet open={open === "form"} onClose={() => setOpen("menu")} title="Form" testID="form">
        <Text>Fields</Text>
      </Sheet>
    </>
  );
}

describe("a sheet", () => {
  it("opens after the sheet it was asked from has left, never over it", async () => {
    // An iPhone refuses a second window while the first is still on the screen: the form
    // asked for from a menu never appeared.
    await renderScreen(<MenuThenForm />);
    await fireEvent.press(await screen.findByTestId("menu-edit"));
    // The menu is still sliding away: the form waits.
    expect(screen.getByTestId("menu")).toBeTruthy();
    expect(screen.queryByTestId("form")).toBeNull();
    await screen.findByTestId("form");
    expect(screen.queryByTestId("menu")).toBeNull();

    // And back: the menu waits for the form the same way.
    await fireEvent.press(screen.getByTestId("form-close"));
    expect(screen.queryByTestId("menu")).toBeNull();
    await screen.findByTestId("menu");
    expect(screen.queryByTestId("form")).toBeNull();
  });

  it("comes back when it is asked for again before it has left", async () => {
    function Toggle() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Button label="Again" onPress={() => setOpen(true)} testID="again" />
          <Sheet open={open} onClose={() => setOpen(false)} title="One" testID="one">
            <Text>Body</Text>
          </Sheet>
        </>
      );
    }
    await renderScreen(<Toggle />);
    await fireEvent.press(await screen.findByTestId("one-close"));
    await fireEvent.press(screen.getByTestId("again"));
    expect(screen.getByTestId("one")).toBeTruthy();
    // It stays: the leave that was started does not take it away later.
    await new Promise((done) => setTimeout(done, 400));
    expect(screen.getByTestId("one")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("one-close"));
    await waitFor(() => expect(screen.queryByTestId("one")).toBeNull());
  });
});
