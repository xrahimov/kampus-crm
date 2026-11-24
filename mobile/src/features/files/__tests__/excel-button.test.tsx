import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { ExcelButton, excelPath } from "@/features/files/excel-button";
import { clearClients, renderScreen } from "@/features/student/test-support";
import { ApiError, NetworkError } from "@/lib/api";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockSaveFile = jest.fn<Promise<string>, [string, string]>();
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));

/*
 * The site's Excel button in the app (A-256): which file it asks the server
 * for, and what it says about what became of it.
 */

beforeEach(() => mockSaveFile.mockReset());
afterEach(() => clearClients());

describe("the address of an Excel file", () => {
  it("carries the list's filters and the language, not the page or what is empty", () => {
    expect(
      excelPath(
        "/students/export.xlsx",
        {
          sort: "fullName:asc",
          q: "Ali Vali",
          archived: false,
          groupId: null,
          courseId: undefined,
          teacherId: "",
          page: 3,
          paymentStatus: "DEBTOR",
        },
        "uz",
      ),
    ).toBe("/students/export.xlsx?sort=fullName%3Aasc&q=Ali%20Vali&paymentStatus=DEBTOR&locale=uz");
  });

  it("is the call and the language where nothing narrows the list", () => {
    expect(excelPath("/payroll/2026-11/export.xlsx", {}, "ru")).toBe(
      "/payroll/2026-11/export.xlsx?locale=ru",
    );
    // A language a list happens to carry does not win over the app's.
    expect(excelPath("/leads/export.xlsx", { locale: "en" }, "ru")).toBe(
      "/leads/export.xlsx?locale=ru",
    );
  });
});

describe("the Excel button", () => {
  it("fetches the file and says nothing when the phone shows it", async () => {
    let done: (saved: string) => void = () => undefined;
    mockSaveFile.mockReturnValue(new Promise((resolve) => (done = resolve)));
    await renderScreen(
      <ExcelButton
        path="/debts/export.xlsx"
        params={{ status: "PROMISED" }}
        testID="debts-excel"
      />,
    );
    expect(screen.getByTestId("debts-excel")).toHaveTextContent("Excel");
    await fireEvent.press(screen.getByTestId("debts-excel"));
    expect(mockSaveFile).toHaveBeenCalledWith(
      "/debts/export.xlsx?status=PROMISED&locale=en",
      "kampus.xlsx",
    );
    // A second press while the file is on its way asks for nothing more.
    expect(screen.getByTestId("debts-excel")).toBeDisabled();
    await act(async () => done("opened"));
    await waitFor(() => expect(screen.getByTestId("debts-excel")).toBeEnabled());
    expect(screen.queryByTestId("debts-excel-note")).toBeNull();
  });

  it("carries its own words where the site's button does", async () => {
    await renderScreen(<ExcelButton path="/payments/export.xlsx" label="Export to Excel" />);
    expect(screen.getByTestId("excel")).toHaveTextContent("Export to Excel");
  });

  it("says where the file is when the phone kept it without opening it", async () => {
    mockSaveFile.mockResolvedValue("saved");
    await renderScreen(<ExcelButton path="/groups/export.xlsx" />);
    await fireEvent.press(screen.getByTestId("excel"));
    expect(await screen.findByTestId("excel-note")).toHaveTextContent("The file is in Downloads.");
  });

  it("says that nothing on the phone opens such a file", async () => {
    mockSaveFile.mockResolvedValue("noApp");
    await renderScreen(<ExcelButton path="/groups/export.xlsx" />);
    await fireEvent.press(screen.getByTestId("excel"));
    expect(await screen.findByTestId("excel-note")).toHaveTextContent(
      /^No app on this phone opens Excel files\./,
    );
  });

  it("gives the server's reason, and can be pressed again", async () => {
    mockSaveFile.mockRejectedValueOnce(
      new ApiError(403, { code: "FORBIDDEN", message: "errors.forbidden" }),
    );
    mockSaveFile.mockResolvedValueOnce("opened");
    await renderScreen(<ExcelButton path="/groups/export.xlsx" />);
    await fireEvent.press(screen.getByTestId("excel"));
    expect(await screen.findByTestId("excel-note")).toHaveTextContent(
      "You do not have permission to do this.",
    );
    await fireEvent.press(screen.getByTestId("excel"));
    await waitFor(() => expect(screen.queryByTestId("excel-note")).toBeNull());
    expect(mockSaveFile).toHaveBeenCalledTimes(2);
  });

  it("says so when there is no connection", async () => {
    mockSaveFile.mockRejectedValue(new NetworkError());
    await renderScreen(<ExcelButton path="/groups/export.xlsx" />);
    await fireEvent.press(screen.getByTestId("excel"));
    expect(await screen.findByTestId("excel-note")).toHaveTextContent(
      "No connection to Kampus. Check the internet and try again.",
    );
  });

  it("cannot be pressed when the list is empty", async () => {
    await renderScreen(<ExcelButton path="/groups/export.xlsx" disabled />);
    await fireEvent.press(screen.getByTestId("excel"));
    expect(mockSaveFile).not.toHaveBeenCalled();
  });
});
