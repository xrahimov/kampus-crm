import * as Device from "expo-device";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Keyboard, Platform } from "react-native";

import type { PickedFile } from "@/lib/api";

/*
 * Choosing what to send from this device (A-212): a new photo, a photo from
 * the gallery, or any file. Each answers with the file, "none" when the person
 * backed out, or why it cannot be sent.
 */

/** The server takes one file of up to 20 MB with an answer. */
export const FILE_MAX_BYTES = 20 * 1024 * 1024;

/** What the server accepts as an attachment (`ATTACHMENT_TYPES` in the server's storage). */
export const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "video/mp4",
  "video/webm",
];

/** Phones name some types their own way; the server knows them by these. */
const SAME_AS: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/aac": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "application/x-zip-compressed": "application/zip",
};

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  zip: "application/zip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  weba: "audio/webm",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** The content type the server will know this file by, or null when it takes no such file. */
export function sendableType(type: string | null | undefined, name: string): string | null {
  const given = (type ?? "").toLowerCase().split(";")[0]!.trim();
  const known = SAME_AS[given] ?? given;
  if (ATTACHMENT_TYPES.includes(known)) return known;
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return (extension && TYPE_BY_EXTENSION[extension]) || null;
}

export type Picked =
  | { kind: "file"; file: PickedFile }
  | { kind: "none" }
  | { kind: "refused"; reason: "tooBig" | "wrongType" | "cameraDenied" | "noCamera" };

/** Checks a file against what the server takes and names it for sending. */
export function checkFile(input: {
  uri: string;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  file?: Blob;
}): Picked {
  const name = input.name?.trim() || input.uri.split("/").pop()?.split("?")[0] || "file";
  const type = sendableType(input.type, name);
  if (!type) return { kind: "refused", reason: "wrongType" };
  if (typeof input.size === "number" && input.size > FILE_MAX_BYTES) {
    return { kind: "refused", reason: "tooBig" };
  }
  return {
    kind: "file",
    file: { uri: input.uri, name, type, size: input.size ?? null, file: input.file },
  };
}

/**
 * Photos go out smaller than the camera makes them: a page of homework reads
 * fine at this. An iPhone keeps its photos as HEIC, which the server and most
 * browsers do not take, so the picker is asked for the compatible copy (JPEG).
 */
const PHOTO = {
  mediaTypes: ["images"],
  quality: 0.7,
  // The enum's own value, written out: nothing native is loaded to read it.
  preferredAssetRepresentationMode:
    "compatible" as ImagePicker.UIImagePickerPreferredAssetRepresentationMode,
} satisfies ImagePicker.ImagePickerOptions;

/**
 * The keyboard goes before a picker opens. On an iPad a picker asked for while
 * a text box had the cursor did not appear on the first tap; a picker over an
 * open keyboard is in the way in any case.
 */
async function keyboardAway(): Promise<void> {
  if (Platform.OS === "web") return;
  const shown = Keyboard.isVisible();
  Keyboard.dismiss();
  if (!shown) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      heard.remove();
      resolve();
    };
    const heard = Keyboard.addListener("keyboardDidHide", done);
    // Never waits on a keyboard that does not say it has gone.
    const timer = setTimeout(done, 400);
  });
}

/**
 * An iPhone asked to open a camera it does not have does not answer: it closes
 * the app, and what the person had typed goes with it. The one iPhone without
 * a camera is the simulator, so the camera is not opened there.
 */
function hasNoCamera(): boolean {
  return Platform.OS === "ios" && Device.isDevice === false;
}

export async function takePhoto(): Promise<Picked> {
  if (hasNoCamera()) return { kind: "refused", reason: "noCamera" };
  await keyboardAway();
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { kind: "refused", reason: "cameraDenied" };
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync(PHOTO);
  } catch {
    // Android says so when no camera app answers.
    return { kind: "refused", reason: "noCamera" };
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { kind: "none" };
  return checkFile({
    uri: asset.uri,
    name: asset.fileName,
    type: asset.mimeType ?? "image/jpeg",
    size: asset.fileSize,
    file: asset.file,
  });
}

export async function choosePhoto(): Promise<Picked> {
  await keyboardAway();
  // The phone's own picker hands over only the chosen photo; no access to the gallery is asked.
  const result = await ImagePicker.launchImageLibraryAsync(PHOTO);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { kind: "none" };
  return checkFile({
    uri: asset.uri,
    name: asset.fileName,
    type: asset.mimeType ?? "image/jpeg",
    size: asset.fileSize,
    file: asset.file,
  });
}

export async function chooseFile(): Promise<Picked> {
  await keyboardAway();
  const result = await DocumentPicker.getDocumentAsync({
    type: ATTACHMENT_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { kind: "none" };
  return checkFile({
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType,
    size: asset.size,
    file: asset.file,
  });
}
