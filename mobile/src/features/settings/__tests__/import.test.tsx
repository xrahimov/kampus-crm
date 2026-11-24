import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { ImportDetection, ImportRun } from "@/api/office-import";
import type { Picked } from "@/features/files/pick";
import { nativeRoute } from "@/features/office/site-paths";
import { ImportScreen } from "@/features/settings/import-screen";
import { clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "me" },
    permissions: ["students.create", "students.view"],
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockBranches[0],
  }),
  can: (me: { permissions: string[] }, permission: string) =>
    me.permissions.includes("*") || me.permissions.includes(permission),
}));
// The device's file picker: each test says what the person chose.
const mockChoose = jest.fn<Promise<Picked>, []>();
jest.mock("@/features/files/pick", () => ({ chooseSheet: () => mockChoose() }));
// The form with the file: each test plays the server's answer to it.
type Sent = { url: string; fields: Record<string, string>; file: string | null };
const mockSent: Sent[] = [];
let mockAnswer: (sent: Sent) => { status: number; body: unknown } = () => ({
  status: 200,
  body: {},
});
jest.mock("@/lib/api", () => {
  const real = jest.requireActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...real,
    apiForm: async (
      path: string,
      fields: Record<string, string>,
      file: { name: string } | null,
    ) => {
      const sent = { url: real.apiUrl(path), fields, file: file?.name ?? null };
      mockSent.push(sent);
      const { status, body } = mockAnswer(sent);
      if (status >= 300) {
        throw new real.ApiError(
          status,
          (body as { error: ConstructorParameters<typeof real.ApiError>[1] }).error,
        );
      }
      return body;
    },
  };
});

/*
 * The import from the old CRM in the app (A-251): the site's Settings → Import
 * from SOFF CRM. Each test plays the picker and the server. Names, numbers and
 * passwords here are made up.
 */

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const picked = (name = "students.xlsx"): Picked => ({
  kind: "file",
  file: { uri: `file:///cache/${name}`, name, type: XLSX, size: 2048 },
});

const STUDENTS: ImportDetection = {
  kind: "students",
  columns: { id: "ID", fullName: "Ism familiya", phone: "Telefon", balance: "Balans" },
  unknown: ["Rang"],
  rows: 2,
  sample: [{ id: "501", fullName: "Test Student", phone: "+998970000001", balance: "" }],
};

function run(change: Partial<ImportRun> = {}): ImportRun {
  return {
    kind: "students",
    dryRun: true,
    imported: 1,
    skipped: [
      { row: 3, reason: "errors.importDuplicate" },
      { row: 4, reason: "fullName: validation.required" },
    ],
    matched: [{ row: 2, label: "Test Student" }],
    extra: [{ key: "members", imported: 1, skipped: 0 }],
    ...change,
  };
}

/** The server as most tests need it: it knows the file, previews it and imports it. */
function serve(detection: ImportDetection = STUDENTS, answers: Partial<ImportRun> = {}) {
  mockAnswer = (sent) => {
    if (sent.fields.detect) return { status: 200, body: detection };
    return { status: 200, body: run({ ...answers, dryRun: sent.fields.dryRun === "1" }) };
  };
}

const disabled = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled === true;

beforeEach(() => {
  mockSent.length = 0;
  mockChoose.mockReset();
  mockChoose.mockResolvedValue(picked());
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  serve();
});
afterEach(() => clearClients());

describe("the import from the old CRM", () => {
  it("opens in the app", () => {
    expect(nativeRoute("/settings/migration")).toBe("/staff/settings/migration");
    expect(nativeRoute("/settings/migration/more")).toBeNull();
  });

  it("names the four files in their order before anything is chosen", async () => {
    await renderScreen(<ImportScreen />);
    expect(screen.getByTestId("import-step-staff")).toHaveTextContent(/Step 1Staff/);
    expect(screen.getByTestId("import-step-payments")).toHaveTextContent(/Step 4Student payments/);
    expect(screen.getByTestId("import-choose")).toHaveTextContent("Choose a file");
    expect(disabled("import-preview-button")).toBe(true);
    expect(disabled("import-button")).toBe(true);
    // One branch: nothing to choose.
    expect(screen.queryByTestId("import-branch")).toBeNull();
  });

  it("says which export a file is and how its columns are read", async () => {
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    expect(await screen.findByTestId("import-kind")).toHaveTextContent("Students");
    expect(screen.getByTestId("import-file-name")).toHaveTextContent("students.xlsx");
    expect(screen.getByTestId("import-detection")).toHaveTextContent(/2 rows/);
    expect(screen.getByTestId("import-column-fullName")).toHaveTextContent(
      "Ism familiyaGoes into: Full nameExample: Test Student",
    );
    // A column with nothing in the first rows shows a dash.
    expect(screen.getByTestId("import-column-balance")).toHaveTextContent(/Example: —/);
    expect(screen.getByTestId("import-unknown")).toHaveTextContent(
      "Columns Kampus does not use: Rang",
    );
    expect(mockSent).toEqual([
      expect.objectContaining({ fields: { detect: "1" }, file: "students.xlsx" }),
    ]);
    expect(mockSent[0]!.url).toMatch(/\/api\/v1\/imports\/soff$/);
    expect(screen.getByTestId("import-choose")).toHaveTextContent("Choose another file");
    // Nothing is imported before a preview.
    expect(disabled("import-preview-button")).toBe(false);
    expect(disabled("import-button")).toBe(true);
  });

  it("previews first, then imports, and lets the same file in only once", async () => {
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    await screen.findByTestId("import-kind");
    await fireEvent.press(screen.getByTestId("import-preview-button"));
    expect(await screen.findByTestId("import-count")).toHaveTextContent(
      "Preview: 1 rows would be imported and 2 skipped. Nothing has been written yet.",
    );
    expect(screen.getByTestId("import-preview")).toBeOnTheScreen();
    expect(screen.getByTestId("import-matched")).toHaveTextContent("2: Test Student");
    // A reason is said in words, and so is the field it is about.
    expect(screen.getByTestId("import-skipped")).toHaveTextContent(
      "Row 3: Duplicate of an earlier rowRow 4: Full name: Required.",
    );
    expect(screen.getByTestId("import-extra-members")).toHaveTextContent(
      "Group memberships: 1 added, 0 skipped",
    );
    expect(mockSent[1]!.fields).toEqual({ kind: "students", branchId: "b1", dryRun: "1" });

    await fireEvent.press(screen.getByTestId("import-button"));
    expect(await screen.findByTestId("import-result")).toBeOnTheScreen();
    expect(screen.getByTestId("import-count")).toHaveTextContent("1 imported, 2 skipped.");
    expect(mockSent[2]!.fields).toEqual({ kind: "students", branchId: "b1" });
    expect(mockSent[2]!.file).toBe("students.xlsx");
    // The rows that went in are not listed again, and the file cannot go in twice.
    expect(screen.queryByTestId("import-matched")).toBeNull();
    expect(disabled("import-button")).toBe(true);
  });

  it("says so when a file is none of the old CRM's exports", async () => {
    serve({ kind: null, columns: {}, unknown: ["Foo", "Bar"], rows: 1, sample: [] });
    mockChoose.mockResolvedValue(picked("odd.xlsx"));
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    expect(await screen.findByTestId("import-not-recognised")).toBeOnTheScreen();
    expect(screen.queryByTestId("import-kind")).toBeNull();
    expect(disabled("import-preview-button")).toBe(true);
  });

  it("refuses a file that is no sheet, or too big, without asking the server", async () => {
    mockChoose.mockResolvedValueOnce({ kind: "refused", reason: "wrongType" });
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    expect(await screen.findByTestId("import-problem")).toHaveTextContent(
      "Only .xlsx or .csv files.",
    );
    mockChoose.mockResolvedValueOnce({ kind: "refused", reason: "tooBig" });
    await fireEvent.press(screen.getByTestId("import-choose"));
    await waitFor(() =>
      expect(screen.getByTestId("import-problem")).toHaveTextContent(
        "The file must be 5 MB or smaller.",
      ),
    );
    expect(mockSent).toHaveLength(0);
    // A good file after it takes the refusal away.
    await fireEvent.press(screen.getByTestId("import-choose"));
    expect(await screen.findByTestId("import-kind")).toBeOnTheScreen();
    expect(screen.queryByTestId("import-problem")).toBeNull();
  });

  it("keeps what is there when the person backs out of the picker", async () => {
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    await screen.findByTestId("import-kind");
    await fireEvent.press(screen.getByTestId("import-preview-button"));
    await screen.findByTestId("import-preview");
    mockChoose.mockResolvedValueOnce({ kind: "none" });
    await fireEvent.press(screen.getByTestId("import-choose"));
    await waitFor(() => expect(mockChoose).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("import-preview")).toBeOnTheScreen();
    expect(disabled("import-button")).toBe(false);
  });

  it("starts over with another file", async () => {
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    await screen.findByTestId("import-kind");
    await fireEvent.press(screen.getByTestId("import-preview-button"));
    await screen.findByTestId("import-preview");
    mockChoose.mockResolvedValueOnce(picked("students-2.xlsx"));
    await fireEvent.press(screen.getByTestId("import-choose"));
    await waitFor(() =>
      expect(screen.getByTestId("import-file-name")).toHaveTextContent("students-2.xlsx"),
    );
    expect(screen.queryByTestId("import-preview")).toBeNull();
    expect(disabled("import-button")).toBe(true);
  });

  it("asks for a new preview when the branch changes", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    await screen.findByTestId("import-kind");
    await fireEvent.press(screen.getByTestId("import-preview-button"));
    await screen.findByTestId("import-preview");
    await fireEvent.press(screen.getByTestId("import-branch"));
    await fireEvent.press(await screen.findByTestId("import-branch-option-b2"));
    await waitFor(() => expect(screen.queryByTestId("import-preview")).toBeNull());
    expect(disabled("import-button")).toBe(true);
    await fireEvent.press(screen.getByTestId("import-preview-button"));
    await screen.findByTestId("import-preview");
    expect(mockSent.at(-1)!.fields).toEqual({ kind: "students", branchId: "b2", dryRun: "1" });
  });

  it("shows a staff import's temporary passwords, and keeps them when the branch changes", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    serve(
      { kind: "staff", columns: { fullName: "F.I.O" }, unknown: [], rows: 1, sample: [] },
      {
        kind: "staff",
        skipped: [],
        matched: [],
        extra: [],
        logins: [{ row: 2, label: "Test Teacher (+998970000002)", secret: "made-up-pass" }],
      },
    );
    mockChoose.mockResolvedValue(picked("staff.xlsx"));
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    expect(await screen.findByTestId("import-kind")).toHaveTextContent("Staff");
    await fireEvent.press(screen.getByTestId("import-preview-button"));
    await screen.findByTestId("import-preview");
    await fireEvent.press(screen.getByTestId("import-button"));
    expect(await screen.findByTestId("import-logins")).toHaveTextContent(
      /Test Teacher \(\+998970000002\): made-up-pass/,
    );
    await fireEvent.press(screen.getByTestId("import-branch"));
    await fireEvent.press(await screen.findByTestId("import-branch-option-b2"));
    expect(screen.getByTestId("import-logins")).toBeOnTheScreen();
    expect(disabled("import-button")).toBe(true);
  });

  it("says in words why the server refused", async () => {
    mockAnswer = (sent) =>
      sent.fields.detect
        ? { status: 200, body: STUDENTS }
        : {
            status: 400,
            body: {
              error: {
                code: "VALIDATION",
                message: "errors.validation",
                fields: { file: ["errors.soffKindMismatch"] },
              },
            },
          };
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    await screen.findByTestId("import-kind");
    await fireEvent.press(screen.getByTestId("import-preview-button"));
    expect(await screen.findByTestId("import-problem")).toHaveTextContent(
      "The file is not the export this import expects",
    );
    expect(screen.queryByTestId("import-preview")).toBeNull();
  });

  it("says a preview with nothing to import the way it says a failure", async () => {
    serve(STUDENTS, { imported: 0, matched: [], extra: [] });
    await renderScreen(<ImportScreen />);
    await fireEvent.press(screen.getByTestId("import-choose"));
    await screen.findByTestId("import-kind");
    await fireEvent.press(screen.getByTestId("import-preview-button"));
    expect(await screen.findByTestId("import-count")).toHaveTextContent(
      /0 rows would be imported and 2 skipped/,
    );
    expect(screen.queryByTestId("import-matched")).toBeNull();
  });
});
