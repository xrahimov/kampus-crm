import { createElement } from "react";

import type { FileSource } from "@/features/room/file-source";

/** In the web build the browser's own PDF reader shows the file. */
export function PdfDocument({ source }: { source: FileSource; onError: () => void }) {
  return createElement("iframe", {
    src: source.uri,
    title: "PDF",
    style: { flex: 1, width: "100%", height: "100%", border: 0 },
  });
}
