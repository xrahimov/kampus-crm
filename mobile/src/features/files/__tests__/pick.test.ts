import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import {
  checkFile,
  chooseFile,
  FILE_MAX_BYTES,
  sendableType,
  takePhoto,
} from "@/features/files/pick";

/* Choosing what to send with an answer (A-212): what the server will take, and what it will not. */

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
});
