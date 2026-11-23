import { Platform, StyleSheet } from "react-native";
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
      {...(Platform.OS === "android" ? ANDROID_ONE_PAGE : IOS_ONE_PAGE)}
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

/** PDFKit shows one page of the file and still says how many the file has. */
const IOS_ONE_PAGE = { singlePage: true } as const;
/*
 * On Android "single page" loads only that page and then reports a file of one
 * page, so the teacher could not turn it. The whole file is opened instead,
 * laid out a page per screen, and held still: no swiping, no pinching.
 */
const ANDROID_ONE_PAGE = {
  horizontal: true,
  enablePaging: true,
  scrollEnabled: false,
  minScale: 1,
  maxScale: 1,
  spacing: 0,
} as const;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#ffffff" },
});
