import { StyleSheet } from "react-native";
import Pdf from "react-native-pdf";

import type { FileSource } from "./file-source";

/*
 * One page of a PDF, drawn by the phone itself (A-210): PDFKit on an iPhone or
 * iPad, PDFium on Android. The teacher turns the page for everyone, so the
 * view shows exactly one page and does not scroll or zoom by itself.
 */
export function PdfPage({
  source,
  page,
  onInfo,
  onError,
}: {
  source: FileSource;
  page: number;
  /** Reported once the file is open: how many pages, and a page's width / height. */
  onInfo: (info: { pages: number; aspect: number }) => void;
  onError: () => void;
}) {
  return (
    <Pdf
      // A fresh view per page: on Android the page is chosen when the file is laid out.
      key={page}
      source={{ uri: source.uri, headers: source.headers, cache: true }}
      page={page}
      singlePage
      fitPolicy={2}
      enableDoubleTapZoom={false}
      trustAllCerts={false}
      onLoadComplete={(pages, _path, size) => {
        const aspect = size && size.width > 0 && size.height > 0 ? size.width / size.height : 0;
        onInfo({ pages, aspect: aspect > 0 ? aspect : 3 / 4 });
      }}
      onError={onError}
      style={styles.page}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#ffffff" },
});
