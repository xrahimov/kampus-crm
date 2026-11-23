import { StyleSheet } from "react-native";
import Pdf from "react-native-pdf";

import type { FileSource } from "@/features/room/file-source";

/** A whole PDF to read: every page under the other, pinch to enlarge (A-212). */
export function PdfDocument({ source, onError }: { source: FileSource; onError: () => void }) {
  return (
    <Pdf
      source={{ uri: source.uri, headers: source.headers, cache: true }}
      trustAllCerts={false}
      fitPolicy={0}
      onError={onError}
      style={styles.pdf}
    />
  );
}

const styles = StyleSheet.create({
  pdf: { flex: 1, backgroundColor: "transparent" },
});
