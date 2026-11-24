import { FileSpreadsheet } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Button } from "@/components/button";
import { Notice } from "@/components/surface";
import { errorText, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { saveFile } from "@/lib/save-file";
import { space, useTheme } from "@/lib/theme";

type Value = string | number | boolean | null | undefined;

/**
 * The address of an Excel file the server makes: the call under /api/v1, the
 * filters the list is under (empty ones and the page left out, as the site's
 * Excel link does) and the language its headers are written in.
 */
export function excelPath(path: string, params: Record<string, Value>, locale: string): string {
  const parts = Object.entries(params)
    .filter(([key, value]) => key !== "page" && key !== "locale")
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== false)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  parts.push(`locale=${encodeURIComponent(locale)}`);
  return `${path}?${parts.join("&")}`;
}

/**
 * The site's Excel button in the app (A-256): the list as it is filtered now,
 * as a file on the phone. The server makes the file; the phone shows it (an
 * iPhone or iPad, with its own way to save or send it) or keeps it in
 * Downloads and opens it (Android).
 */
export function ExcelButton({
  path,
  params = {},
  label,
  disabled,
  compact,
  variant = "outline",
  testID = "excel",
  style,
}: {
  /** The call under /api/v1: "/students/export.xlsx". */
  path: string;
  /** The list's filters, as the list itself sends them. */
  params?: Record<string, Value>;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
  variant?: "outline" | "ghost";
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const { locale } = useLocaleChoice();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{
    tone: "success" | "warning" | "destructive";
    text: string;
  } | null>(null);

  const fetchIt = async () => {
    setBusy(true);
    setNote(null);
    try {
      const saved = await saveFile(excelPath(path, params, locale), "kampus.xlsx");
      if (saved === "saved") setNote({ tone: "success", text: t("mobile.file.inDownloads") });
      if (saved === "noApp") setNote({ tone: "warning", text: t("mobile.file.noApp") });
    } catch (e) {
      setNote({ tone: "destructive", text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      <Button
        variant={variant}
        compact={compact}
        icon={<FileSpreadsheet size={compact ? 16 : 18} color={colors.foreground} />}
        label={label ?? t("excel.export")}
        loading={busy}
        disabled={disabled}
        onPress={() => void fetchIt()}
        style={styles.start}
        testID={testID}
      />
      {note ? (
        <Notice tone={note.tone} testID={`${testID}-note`}>
          {note.text}
        </Notice>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  start: { alignSelf: "flex-start" },
});
