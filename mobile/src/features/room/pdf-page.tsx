import { useEffect } from "react";

import type { FileSource } from "./file-source";

/*
 * The web build's side of `pdf-page.native.tsx`. The phone draws PDF pages
 * with its own library; the web build has none yet, so it says it cannot and
 * the stage offers the file to open by itself, as it does for any file a
 * device cannot draw.
 */
export function PdfPage({
  onError,
}: {
  source: FileSource;
  page: number;
  onInfo: (info: { pages: number; aspect: number }) => void;
  onError: () => void;
}) {
  useEffect(() => {
    onError();
    // Once: there is nothing to retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
