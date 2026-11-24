import { Platform } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";

import { apiUrl, NetworkError, sessionHeaders } from "./api";
import { headerOf, nameOf, refusalOf, XLSX_TYPE, type Saved } from "./save-file-parts";

/**
 * Fetches a file the server makes (an Excel export, A-256) with the session
 * and hands it to the phone. `path` is the call under /api/v1 with its query.
 *
 * The file is kept in the app's cache under the server's name for it. An
 * iPhone or iPad then shows it full screen, with the system's own button to
 * save it to Files or send it on. An Android phone puts a copy in Downloads,
 * where it stays, and opens it in the app that reads such files if there is
 * one.
 */
export async function saveFile(path: string, fallbackName: string): Promise<Saved> {
  const { fs } = ReactNativeBlobUtil;
  let answer: Awaited<ReturnType<typeof ReactNativeBlobUtil.fetch>>;
  try {
    answer = await ReactNativeBlobUtil.config({ fileCache: true }).fetch(
      "GET",
      apiUrl(path),
      sessionHeaders(),
    );
  } catch {
    throw new NetworkError();
  }
  const info = answer.info();
  if (info.status < 200 || info.status >= 300) {
    const text = await answer.text().catch(() => "");
    await answer.flush().catch(() => undefined);
    throw refusalOf(info.status, text);
  }
  const fetched = answer.path();
  if (!fetched) throw refusalOf(info.status, "");
  const name = nameOf(headerOf(info.headers, "content-disposition"), fallbackName);
  const type = headerOf(info.headers, "content-type")?.split(";")[0]?.trim() || XLSX_TYPE;
  const folder = `${fs.dirs.CacheDir}/downloads`;
  const file = `${folder}/${name}`;
  if (!(await fs.exists(folder))) await fs.mkdir(folder);
  if (await fs.exists(file)) await fs.unlink(file);
  await fs.mv(fetched, file);

  if (Platform.OS === "ios") {
    await ReactNativeBlobUtil.open.file(file);
    return "opened";
  }
  // Android: a copy in Downloads first (it needs no permission from Android 10 on),
  // so the file is there whether or not an app opens it now.
  const kept = await ReactNativeBlobUtil.media
    .copyToMediaStore({ name, parentFolder: "", mime: type }, "Download", file)
    .then(() => true)
    .catch(() => false);
  const shown = await ReactNativeBlobUtil.open
    .file(file, { mime: type })
    .then(() => true)
    .catch(() => false);
  return shown ? "opened" : kept ? "saved" : "noApp";
}
