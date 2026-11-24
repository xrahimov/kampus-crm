import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Keyboard } from "react-native";

import {
  checkFile,
  checkSheet,
  chooseFile,
  choosePhoto,
  chooseSheet,
  FILE_MAX_BYTES,
  sendableType,
  SHEET_MAX_BYTES,
  takePhoto,
} from "@/features/files/pick";

/* Choosing what to send with an answer (A-212): what the server will take, and what it will not. */

// A real phone unless a test says it is the simulator.
const mockDevice = { isDevice: true };
jest.mock("expo-device", () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
}));

describe("a file chosen on the phone", () => {
  it("is known by the type the server uses", () => {
    expect(sendableType("image/jpeg", "IMG_1.jpg")).toBe("image/jpeg");
    expect(sendableType("image/jpg", "IMG_1.jpg")).toBe("image/jpeg");
    expect(sendableType("audio/x-m4a", "voice.m4a")).toBe("audio/mp4");
    expect(sendableType("audio/webm;codecs=opus", "answer.weba")).toBe("audio/webm");
    // A phone that does not say the type: the name decides.
    expect(sendableType(undefined, "Essay.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(sendableType("application/octet-stream", "notes.pdf")).toBe("application/pdf");
  });

  it("is refused when the server takes no such file", () => {
    expect(sendableType("image/heic", "IMG_2.heic")).toBeNull();
    expect(sendableType("application/x-msdownload", "setup.exe")).toBeNull();
    expect(checkFile({ uri: "file:///a/setup.exe", name: "setup.exe" })).toEqual({
      kind: "refused",
      reason: "wrongType",
    });
  });

  it("is refused above 20 MB", () => {
    expect(
      checkFile({ uri: "file:///a/big.pdf", name: "big.pdf", size: FILE_MAX_BYTES + 1 }),
    ).toEqual({ kind: "refused", reason: "tooBig" });
    expect(checkFile({ uri: "file:///a/ok.pdf", name: "ok.pdf", size: FILE_MAX_BYTES }).kind).toBe(
      "file",
    );
  });

  it("gets a name from its address when the phone gives none", () => {
    expect(checkFile({ uri: "file:///cache/photo-17.jpg", type: "image/jpeg" })).toEqual({
      kind: "file",
      file: {
        uri: "file:///cache/photo-17.jpg",
        name: "photo-17.jpg",
        type: "image/jpeg",
        size: null,
        file: undefined,
      },
    });
  });

  it("says so when the camera is not allowed, and nothing when the person backs out", async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
    });
    expect(await takePhoto()).toEqual({ kind: "refused", reason: "cameraDenied" });
    expect(await takePhoto()).toEqual({ kind: "none" });
    expect(await chooseFile()).toEqual({ kind: "none" });
  });

  it("does not open a camera the device does not have", async () => {
    // The iPhone simulator: opening its camera closes the app.
    mockDevice.isDevice = false;
    (ImagePicker.launchCameraAsync as jest.Mock).mockClear();
    expect(await takePhoto()).toEqual({ kind: "refused", reason: "noCamera" });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    mockDevice.isDevice = true;
    // An Android device where no camera answers.
    (ImagePicker.launchCameraAsync as jest.Mock).mockRejectedValueOnce(new Error("no camera"));
    expect(await takePhoto()).toEqual({ kind: "refused", reason: "noCamera" });
  });

  it("puts the keyboard away before a picker opens", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const visible = jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
    let order: string[] = [];
    const hide = jest.spyOn(Keyboard, "addListener").mockImplementation((name, heard) => {
      // The keyboard says it has gone a moment after it is asked to.
      setTimeout(() => {
        order.push(name);
        (heard as () => void)();
      }, 10);
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockImplementationOnce(async () => {
      order.push("picker");
      return { canceled: true, assets: null };
    });
    expect(await chooseFile()).toEqual({ kind: "none" });
    expect(dismiss).toHaveBeenCalled();
    expect(order).toEqual(["keyboardDidHide", "picker"]);

    // No keyboard on the screen: nothing to wait for.
    order = [];
    visible.mockReturnValue(false);
    hide.mockClear();
    expect(await choosePhoto()).toEqual({ kind: "none" });
    expect(hide).not.toHaveBeenCalled();
    for (const spy of [dismiss, visible, hide]) spy.mockRestore();
  });

  it("hands over the photo and the document that were chosen", async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: "file:///c/p.jpg", fileName: "p.jpg", mimeType: "image/jpeg", fileSize: 900 },
      ],
    });
    expect(await takePhoto()).toMatchObject({
      kind: "file",
      file: { uri: "file:///c/p.jpg", name: "p.jpg", type: "image/jpeg", size: 900 },
    });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///c/e.pdf", name: "e.pdf", mimeType: "application/pdf", size: 5 }],
    });
    expect(await chooseFile()).toMatchObject({
      kind: "file",
      file: { name: "e.pdf", type: "application/pdf" },
    });
  });

  it("asks an iPhone for the copy of a photo the server takes (JPEG, not HEIC)", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });
    expect(await choosePhoto()).toEqual({ kind: "none" });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ preferredAssetRepresentationMode: "compatible" }),
    );
  });
});

describe("a sheet chosen for an import (A-251)", () => {
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  it("is an Excel workbook or a CSV file, by the name's ending", () => {
    expect(
      checkSheet({ uri: "file:///a/Students.XLSX", type: "application/octet-stream" }),
    ).toEqual({
      kind: "file",
      file: { uri: "file:///a/Students.XLSX", name: "Students.XLSX", type: XLSX, size: null },
    });
    const csv = checkSheet({ uri: "file:///a/x", name: "groups.csv", type: "text/plain" });
    expect(csv.kind === "file" && csv.file.type).toBe("text/csv");
    // The old Excel format and anything else are not read by the server.
    for (const name of ["old.xls", "notes.pdf", "photo.jpg"]) {
      expect(checkSheet({ uri: `file:///a/${name}`, name, type: XLSX })).toEqual({
        kind: "refused",
        reason: "wrongType",
      });
    }
  });

  it("is known by its type when the name has no ending", () => {
    const sheet = checkSheet({ uri: "content://downloads/17", name: "export", type: XLSX });
    expect(sheet.kind === "file" && sheet.file.type).toBe(XLSX);
    const csv = checkSheet({
      uri: "content://downloads/18",
      name: "export",
      type: "text/comma-separated-values",
    });
    expect(csv.kind === "file" && csv.file.type).toBe("text/csv");
    expect(checkSheet({ uri: "content://downloads/19", name: "export" })).toEqual({
      kind: "refused",
      reason: "wrongType",
    });
  });

  it("is refused over 5 MB", () => {
    expect(
      checkSheet({ uri: "file:///a/big.xlsx", name: "big.xlsx", size: SHEET_MAX_BYTES + 1 }),
    ).toEqual({ kind: "refused", reason: "tooBig" });
    expect(
      checkSheet({ uri: "file:///a/ok.xlsx", name: "ok.xlsx", size: SHEET_MAX_BYTES }).kind,
    ).toBe("file");
  });

  it("comes from the device's file picker, and backing out chooses nothing", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/staff.xlsx", name: "staff.xlsx", mimeType: XLSX, size: 900 }],
    });
    expect(await chooseSheet()).toEqual({
      kind: "file",
      file: {
        uri: "file:///cache/staff.xlsx",
        name: "staff.xlsx",
        type: XLSX,
        size: 900,
        file: undefined,
      },
    });
    expect(await chooseSheet()).toEqual({ kind: "none" });
  });
});
