import { apiUrl, NetworkError, sessionHeaders } from "./api";
import { nameOf, refusalOf, type Saved } from "./save-file-parts";

/**
 * In the web build the browser saves the file: it is fetched with the session
 * and handed over as a download under the server's name for it.
 */
export async function saveFile(path: string, fallbackName: string): Promise<Saved> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { headers: sessionHeaders(), credentials: "omit" });
  } catch {
    throw new NetworkError();
  }
  if (!response.ok) throw refusalOf(response.status, await response.text().catch(() => ""));
  const blob = await response.blob();
  const address = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = address;
  link.download = nameOf(response.headers.get("content-disposition"), fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(address), 60_000);
  return "opened";
}
