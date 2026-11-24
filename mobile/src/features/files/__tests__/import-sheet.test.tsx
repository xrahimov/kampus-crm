import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { ImportButton, ImportMenu, type ImportKind } from "@/features/files/import-button";
import type { ImportResult } from "@/features/files/import-sheet";
import type { Picked } from "@/features/files/pick";
import { clearClients, renderScreen } from "@/features/student/test-support";
import { NetworkError } from "@/lib/api";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
let mockBranches = [
  { id: "b1", name: "Chilonzor" },
  { id: "b2", name: "Yunusobod" },
];
let mockActive: { id: string; name: string } | null = mockBranches[1]!;
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "me" },
    permissions: ["*"],
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockActive,
  }),
  can: () => true,
}));
// The device's file picker: each test says what the person chose.
const mockChoose = jest.fn<Promise<Picked>, []>();
jest.mock("@/features/files/pick", () => ({ chooseSheet: () => mockChoose() }));
// The template: the phone's own way of showing a file is played here.
const mockSaveFile = jest.fn<Promise<string>, [string, string]>(async () => "opened");
jest.mock("@/lib/save-file", () => ({
  saveFile: (path: string, name: string) => mockSaveFile(path, name),
}));
// The form with the sheet: each test plays the server's answer to it.
type Sent = { path: string; fields: Record<string, string>; file: string | null };
const mockSent: Sent[] = [];
let mockAnswer: (sent: Sent) => ImportResult | Error = () => ({ imported: 0, skipped: [] });
jest.mock("@/lib/api", () => {
  const real = jest.requireActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...real,
    apiForm: async (
      path: string,
      fields: Record<string, string>,
      file: { name: string } | null,
    ) => {
      const sent = { path, fields, file: file?.name ?? null };
      mockSent.push(sent);
      const result = mockAnswer(sent);
      if (result instanceof Error) throw result;
      return result;
    },
  };
});

/*
 * The site's "Import from Excel" in the app (A-257): the template, a sheet
 * from the phone, what came in and what was left out. Each test plays the
 * picker and the server. Names and the temporary words here are made up.
 */

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const picked = (name = "rooms.xlsx"): Picked => ({
  kind: "file",
  file: { uri: `file:///cache/${name}`, name, type: XLSX, size: 2048 },
});

const ROOMS: ImportKind = {
  id: "rooms-import",
  title: "Import rooms",
  description: "One row per room.",
  templatePath: "/rooms/import-template.xlsx",
  importPath: "/rooms/import",
  toBranch: true,
};
const BALANCES: ImportKind = {
  id: "balances-import",
  title: "Import opening balances",
  templatePath: "/students/import-balances-template.xlsx",
  importPath: "/students/import-balances",
  toBranch: true,
  preview: true,
};
const MEMBERS: ImportKind = {
  id: "members-import",
  title: "Add from Excel",
  templatePath: "/groups/import-template.xlsx",
  importPath: "/groups/g1/members/import",
};

async function opened(kind: ImportKind) {
  const client = await renderScreen(<ImportButton kind={kind} />);
  await fireEvent.press(screen.getByTestId(`${kind.id}-open`));
  await screen.findByTestId(`${kind.id}-template`);
  return client;
}

async function choose(kind: ImportKind, file: Picked = picked()) {
  mockChoose.mockResolvedValueOnce(file);
  await fireEvent.press(screen.getByTestId(`${kind.id}-choose`));
}

beforeEach(() => {
  mockSent.length = 0;
  mockChoose.mockReset();
  mockSaveFile.mockReset();
  mockSaveFile.mockResolvedValue("opened");
  mockAnswer = () => ({ imported: 0, skipped: [] });
  mockBranches = [
    { id: "b1", name: "Chilonzor" },
    { id: "b2", name: "Yunusobod" },
  ];
  mockActive = mockBranches[1]!;
});
afterEach(clearClients);

describe("the import sheet", () => {
  it("says what the import is and waits for a file", async () => {
    await opened(ROOMS);
    expect(screen.getByText("Import rooms")).toBeTruthy();
    expect(screen.getByTestId("rooms-import-hint")).toHaveTextContent("One row per room.");
    expect(screen.getByTestId("rooms-import-submit")).toBeDisabled();
    expect(screen.getByTestId("rooms-import-submit")).toHaveTextContent("Import");
    expect(screen.queryByTestId("rooms-import-file")).toBeNull();
  });

  it("gives the general hint when the import has none of its own", async () => {
    await opened(MEMBERS);
    expect(screen.getByTestId("members-import-hint")).toHaveTextContent(/Download the template/);
  });

  it("fetches the template in the app's language", async () => {
    await opened(ROOMS);
    await fireEvent.press(screen.getByTestId("rooms-import-template"));
    await waitFor(() =>
      expect(mockSaveFile).toHaveBeenCalledWith(
        "/rooms/import-template.xlsx?locale=en",
        "template.xlsx",
      ),
    );
    expect(screen.queryByTestId("rooms-import-problem")).toBeNull();
  });

  it("says where an Android phone kept the template", async () => {
    mockSaveFile.mockResolvedValueOnce("saved");
    await opened(ROOMS);
    await fireEvent.press(screen.getByTestId("rooms-import-template"));
    expect(await screen.findByTestId("rooms-import-problem")).toHaveTextContent(/Downloads/);
  });

  it("says so when the template cannot be fetched", async () => {
    mockSaveFile.mockRejectedValueOnce(new NetworkError());
    await opened(ROOMS);
    await fireEvent.press(screen.getByTestId("rooms-import-template"));
    expect(await screen.findByTestId("rooms-import-problem")).toHaveTextContent(/connection/i);
  });

  it("refuses a file that is too big or not a sheet", async () => {
    await opened(ROOMS);
    await choose(ROOMS, { kind: "refused", reason: "tooBig" });
    expect(await screen.findByTestId("rooms-import-problem")).toHaveTextContent(
      "The file must be 5 MB or smaller.",
    );
    await choose(ROOMS, { kind: "refused", reason: "wrongType" });
    await waitFor(() =>
      expect(screen.getByTestId("rooms-import-problem")).toHaveTextContent(
        "Only .xlsx or .csv files.",
      ),
    );
    expect(screen.getByTestId("rooms-import-submit")).toBeDisabled();
    expect(mockSent).toHaveLength(0);
  });

  it("leaves everything as it was when the picker is closed", async () => {
    await opened(ROOMS);
    await choose(ROOMS);
    await screen.findByTestId("rooms-import-file");
    await choose(ROOMS, { kind: "none" });
    expect(screen.getByTestId("rooms-import-file")).toHaveTextContent("rooms.xlsx");
  });

  it("sends the sheet with the branch the person works in and shows what came in", async () => {
    mockAnswer = () => ({
      imported: 3,
      skipped: [
        { row: 4, reason: "validation.required" },
        { row: 6, reason: "phone: validation.phone" },
        { row: 7, reason: "Room 2 already exists" },
        { row: 8, reason: "status: validation.invalid" },
      ],
    });
    await opened(ROOMS);
    await choose(ROOMS);
    expect(await screen.findByTestId("rooms-import-file")).toHaveTextContent("rooms.xlsx");
    expect(screen.getByTestId("rooms-import-choose")).toHaveTextContent("Choose another file");
    await fireEvent.press(screen.getByTestId("rooms-import-submit"));

    const result = await screen.findByTestId("rooms-import-result");
    expect(mockSent).toEqual([
      { path: "/rooms/import", fields: { branchId: "b2" }, file: "rooms.xlsx" },
    ]);
    expect(result).toHaveTextContent(/3 imported, 4 skipped/);
    const skipped = screen.getByTestId("rooms-import-skipped");
    expect(skipped).toHaveTextContent(/Row 4: Required\./);
    expect(skipped).toHaveTextContent(/Row 6: phone: Enter a number like/);
    expect(skipped).toHaveTextContent(/Row 7: Room 2 already exists/);
    expect(skipped).toHaveTextContent(/Row 8: status: Not a valid value\./);
    // Done: the button under the sheet now closes it.
    expect(screen.queryByTestId("rooms-import-submit")).toBeNull();
    expect(screen.getByTestId("rooms-import-done")).toBeTruthy();
  });

  it("uses the person's first branch when none is the active one", async () => {
    mockActive = null;
    mockAnswer = () => ({ imported: 1, skipped: [] });
    await opened(ROOMS);
    await choose(ROOMS);
    await screen.findByTestId("rooms-import-file");
    await fireEvent.press(screen.getByTestId("rooms-import-submit"));
    await screen.findByTestId("rooms-import-result");
    expect(mockSent[0]!.fields).toEqual({ branchId: "b1" });
  });

  it("sends nothing but the sheet for an import that needs no branch", async () => {
    mockAnswer = () => ({ imported: 2, skipped: [] });
    await opened(MEMBERS);
    await choose(MEMBERS, picked("students.xlsx"));
    await screen.findByTestId("members-import-file");
    await fireEvent.press(screen.getByTestId("members-import-submit"));
    await screen.findByTestId("members-import-result");
    expect(mockSent).toEqual([
      { path: "/groups/g1/members/import", fields: {}, file: "students.xlsx" },
    ]);
  });

  it("asks the lists again once rows came in, and not when none did", async () => {
    mockAnswer = () => ({ imported: 0, skipped: [{ row: 2, reason: "validation.required" }] });
    const client = await opened(ROOMS);
    const again = jest.spyOn(client, "invalidateQueries");
    await choose(ROOMS);
    await screen.findByTestId("rooms-import-file");
    await fireEvent.press(screen.getByTestId("rooms-import-submit"));
    await screen.findByTestId("rooms-import-result");
    expect(again).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("rooms-import-done"));
    mockAnswer = () => ({ imported: 2, skipped: [] });
    await fireEvent.press(screen.getByTestId("rooms-import-open"));
    await screen.findByTestId("rooms-import-template");
    await choose(ROOMS);
    await screen.findByTestId("rooms-import-file");
    await fireEvent.press(screen.getByTestId("rooms-import-submit"));
    await screen.findByTestId("rooms-import-result");
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal and keeps the file for another try", async () => {
    mockAnswer = () => new NetworkError();
    await opened(ROOMS);
    await choose(ROOMS);
    await screen.findByTestId("rooms-import-file");
    await fireEvent.press(screen.getByTestId("rooms-import-submit"));
    expect(await screen.findByTestId("rooms-import-problem")).toHaveTextContent(/connection/i);
    expect(screen.queryByTestId("rooms-import-result")).toBeNull();
    expect(screen.getByTestId("rooms-import-submit")).not.toBeDisabled();

    mockAnswer = () => ({ imported: 1, skipped: [] });
    await fireEvent.press(screen.getByTestId("rooms-import-submit"));
    await screen.findByTestId("rooms-import-result");
    expect(screen.queryByTestId("rooms-import-problem")).toBeNull();
  });

  it("starts empty again after it was closed", async () => {
    mockAnswer = () => ({ imported: 1, skipped: [] });
    await opened(ROOMS);
    await choose(ROOMS);
    await screen.findByTestId("rooms-import-file");
    await fireEvent.press(screen.getByTestId("rooms-import-submit"));
    await screen.findByTestId("rooms-import-result");
    await fireEvent.press(screen.getByTestId("rooms-import-done"));
    await fireEvent.press(screen.getByTestId("rooms-import-open"));
    await screen.findByTestId("rooms-import-template");
    expect(screen.queryByTestId("rooms-import-result")).toBeNull();
    expect(screen.queryByTestId("rooms-import-file")).toBeNull();
    expect(screen.getByTestId("rooms-import-submit")).toBeDisabled();
  });
});

describe("an import that previews first", () => {
  it("writes nothing on the first press and imports on the second", async () => {
    mockAnswer = (sent) =>
      sent.fields.dryRun
        ? {
            imported: 2,
            dryRun: true,
            byHeader: false,
            matched: [
              { row: 2, label: "Test Student One: 150000" },
              { row: 3, label: "Test Student Two: -50000" },
            ],
            skipped: [{ row: 4, reason: "errors.notFound" }],
          }
        : { imported: 2, skipped: [{ row: 4, reason: "errors.notFound" }] };
    await opened(BALANCES);
    expect(screen.getByTestId("balances-import-submit")).toHaveTextContent("Preview");
    await choose(BALANCES, picked("balances.xlsx"));
    await screen.findByTestId("balances-import-file");
    await fireEvent.press(screen.getByTestId("balances-import-submit"));

    const preview = await screen.findByTestId("balances-import-preview");
    expect(mockSent).toEqual([
      {
        path: "/students/import-balances",
        fields: { branchId: "b2", dryRun: "1" },
        file: "balances.xlsx",
      },
    ]);
    expect(preview).toHaveTextContent(/2 rows would be imported and 1 skipped/);
    expect(screen.getByTestId("balances-import-no-header")).toBeTruthy();
    expect(screen.getByTestId("balances-import-matched")).toHaveTextContent(
      /2: Test Student One: 150000/,
    );
    expect(screen.getByTestId("balances-import-skipped")).toHaveTextContent(/Row 4:/);
    expect(screen.queryByTestId("balances-import-result")).toBeNull();
    expect(screen.getByTestId("balances-import-submit")).toHaveTextContent("Import 2 rows");

    await fireEvent.press(screen.getByTestId("balances-import-submit"));
    const result = await screen.findByTestId("balances-import-result");
    expect(mockSent[1]).toEqual({
      path: "/students/import-balances",
      fields: { branchId: "b2" },
      file: "balances.xlsx",
    });
    expect(result).toHaveTextContent(/2 imported, 1 skipped/);
    expect(screen.queryByTestId("balances-import-preview")).toBeNull();
  });

  it("will not import a sheet whose preview has no rows to bring in", async () => {
    mockAnswer = () => ({
      imported: 0,
      dryRun: true,
      byHeader: true,
      skipped: [{ row: 2, reason: "errors.notFound" }],
    });
    await opened(BALANCES);
    await choose(BALANCES);
    await screen.findByTestId("balances-import-file");
    await fireEvent.press(screen.getByTestId("balances-import-submit"));
    await screen.findByTestId("balances-import-preview");
    expect(screen.getByTestId("balances-import-submit")).toBeDisabled();
    expect(screen.queryByTestId("balances-import-no-header")).toBeNull();
    expect(screen.queryByTestId("balances-import-matched")).toBeNull();
    expect(mockSent).toHaveLength(1);
  });

  it("previews again when another file is chosen", async () => {
    mockAnswer = (sent) => ({ imported: 1, dryRun: Boolean(sent.fields.dryRun), skipped: [] });
    await opened(BALANCES);
    await choose(BALANCES, picked("one.xlsx"));
    await screen.findByTestId("balances-import-file");
    await fireEvent.press(screen.getByTestId("balances-import-submit"));
    await screen.findByTestId("balances-import-preview");

    await choose(BALANCES, picked("two.xlsx"));
    await waitFor(() =>
      expect(screen.getByTestId("balances-import-file")).toHaveTextContent("two.xlsx"),
    );
    expect(screen.queryByTestId("balances-import-preview")).toBeNull();
    expect(screen.getByTestId("balances-import-submit")).toHaveTextContent("Preview");
    await fireEvent.press(screen.getByTestId("balances-import-submit"));
    await screen.findByTestId("balances-import-preview");
    expect(mockSent.map((sent) => [sent.file, sent.fields.dryRun])).toEqual([
      ["one.xlsx", "1"],
      ["two.xlsx", "1"],
    ]);
  });
});

describe("the staff import", () => {
  it("shows each temporary word once, under the result", async () => {
    mockAnswer = () => ({
      imported: 2,
      skipped: [],
      logins: [
        { row: 2, label: "Test Teacher One (+998970000001)", secret: "made-up-one" },
        { row: 3, label: "Test Teacher Two (+998970000002)", secret: "made-up-two" },
      ],
    });
    await opened({ ...ROOMS, id: "staff-import", importPath: "/staff/import" });
    await choose({ ...ROOMS, id: "staff-import" }, picked("staff.xlsx"));
    await screen.findByTestId("staff-import-file");
    await fireEvent.press(screen.getByTestId("staff-import-submit"));
    const logins = await screen.findByTestId("staff-import-logins");
    expect(logins).toHaveTextContent(/Test Teacher One \(\+998970000001\): made-up-one/);
    expect(logins).toHaveTextContent(/Test Teacher Two \(\+998970000002\): made-up-two/);
    expect(logins).toHaveTextContent(/Hand each one to its owner/);

    // Closed and opened again, they are gone.
    await fireEvent.press(screen.getByTestId("staff-import-done"));
    await fireEvent.press(screen.getByTestId("staff-import-open"));
    await screen.findByTestId("staff-import-template");
    expect(screen.queryByTestId("staff-import-logins")).toBeNull();
    expect(screen.queryByText(/made-up-one/)).toBeNull();
  });

  it("shows no such block when the import made none", async () => {
    mockAnswer = () => ({ imported: 1, skipped: [] });
    await opened(ROOMS);
    await choose(ROOMS);
    await screen.findByTestId("rooms-import-file");
    await fireEvent.press(screen.getByTestId("rooms-import-submit"));
    await screen.findByTestId("rooms-import-result");
    expect(screen.queryByTestId("rooms-import-logins")).toBeNull();
  });
});

describe("several imports behind one button", () => {
  it("lists them and opens the one pressed", async () => {
    await renderScreen(<ImportMenu label="Import" kinds={[ROOMS, BALANCES]} testID="menu" />);
    expect(screen.queryByTestId("rooms-import-open")).toBeNull();
    await fireEvent.press(screen.getByTestId("menu"));
    expect(await screen.findByTestId("rooms-import-open")).toHaveTextContent("Import rooms");
    expect(screen.getByTestId("balances-import-open")).toHaveTextContent("Import opening balances");

    await fireEvent.press(screen.getByTestId("balances-import-open"));
    expect(await screen.findByTestId("balances-import-submit")).toHaveTextContent("Preview");

    mockAnswer = () => ({ imported: 1, dryRun: true, skipped: [] });
    await choose(BALANCES);
    await screen.findByTestId("balances-import-file");
    await fireEvent.press(screen.getByTestId("balances-import-submit"));
    await screen.findByTestId("balances-import-preview");
    expect(mockSent[0]).toEqual({
      path: "/students/import-balances",
      fields: { branchId: "b2", dryRun: "1" },
      file: "rooms.xlsx",
    });
  });

  it("is not there when the person may do none of them", async () => {
    await renderScreen(<ImportMenu label="Import" kinds={[]} testID="menu" />);
    expect(screen.queryByTestId("menu")).toBeNull();
  });
});
