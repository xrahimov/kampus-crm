import { useEffect, useState } from "react";
import { Platform } from "react-native";

import type { FileSource } from "@/lib/file-source";

/**
 * The file as this device can ask for it. A phone's picture and player send
 * the session with their request; a browser's cannot, so the web build fetches
 * a staff file itself and draws it from memory (null until it is there). A
 * student's link needs neither.
 */
export function useLocalFile(source: FileSource, onError: () => void): FileSource | null {
  const viaFetch = Platform.OS === "web" && Boolean(source.headers);
  const [local, setLocal] = useState<{ from: string; uri: string } | null>(null);
  useEffect(() => {
    if (!viaFetch) return;
    let alive = true;
    let made: string | null = null;
    fetch(source.uri, { headers: source.headers, credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setLocal({ from: source.uri, uri: made });
      })
      .catch(() => {
        if (alive) onError();
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one fetch per file
  }, [viaFetch, source.uri]);
  if (!viaFetch) return source;
  return local && local.from === source.uri ? { uri: local.uri } : null;
}
