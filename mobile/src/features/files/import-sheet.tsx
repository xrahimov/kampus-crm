import { Download, FileSpreadsheet } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { apiForm, type PickedFile } from "@/lib/api";
import { errorText, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { saveFile } from "@/lib/save-file";
import { radius, space, useTheme } from "@/lib/theme";

import { chooseSheet } from "./pick";

/** What the server says about a sheet: the site's `ImportResult`. */
export interface ImportResult {
  imported: number;
  skipped: Array<{ row: number; reason: string }>;
  /** True while nothing has been written yet (an import that previews first). */
  dryRun?: boolean;
  /** Rows a preview matched, as short labels. */
  matched?: Array<{ row: number; label: string }>;
  /** False when the header row was not recognised and the template's order was assumed. */
  byHeader?: boolean;
  /** Staff import: the temporary passwords it made, shown once. */
  logins?: Array<{ row: number; label: string; secret: string }>;
}

/** As many rows as the site lists before it stops. */
const ROWS_SHOWN = 50;

/**
 * The site's "Import from Excel" dialog in the app (A-257): the template to
 * fill in, a sheet chosen from the phone, how many rows came in and which
 * were left out and why. An import that changes money or history previews
 * first (`preview`): the first press writes nothing and shows what would
 * happen, the second imports.
 */
export function ImportSheet({
  open,
  onClose,
  title,
  description,
  templatePath,
  importPath,
  fields,
  preview = false,
  onDone,
  testID = "import",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Stands in for the general "download the template" hint. */
  description?: string;
  /** The template's call under /api/v1. */
  templatePath: string;
  /** The call under /api/v1 that takes the sheet. */
  importPath: string;
  /** What goes with the sheet, such as the branch. */
  fields?: Record<string, string>;
  preview?: boolean;
  onDone?: (result: ImportResult) => void;
  testID?: string;
}) {
  const t = useTranslations();
  const te = useTranslations("excel");
  const { colors } = useTheme();
  const { locale } = useLocaleChoice();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const close = () => {
    setFile(null);
    setProblem(null);
    setPreviewed(null);
    setResult(null);
    onClose();
  };

  const template = async () => {
    setFetching(true);
    setProblem(null);
    try {
      const saved = await saveFile(`${templatePath}?locale=${locale}`, "template.xlsx");
      if (saved === "saved") setProblem(t("mobile.file.inDownloads"));
      if (saved === "noApp") setProblem(t("mobile.file.noApp"));
    } catch (e) {
      setProblem(errorText(t, e));
    } finally {
      setFetching(false);
    }
  };

  const choose = async () => {
    const picked = await chooseSheet().catch(() => ({ kind: "none" as const }));
    if (picked.kind === "none") return;
    setPreviewed(null);
    setResult(null);
    if (picked.kind === "refused") {
      setFile(null);
      setProblem(
        t(picked.reason === "tooBig" ? "validation.importFileSize" : "validation.importFileType"),
      );
      return;
    }
    setProblem(null);
    setFile(picked.file);
  };

  const send = async () => {
    if (!file) return;
    const dryRun = preview && !previewed;
    setBusy(true);
    setProblem(null);
    try {
      const data = await apiForm<ImportResult>(
        importPath,
        { ...fields, ...(dryRun ? { dryRun: "1" } : {}) },
        file,
      );
      if (dryRun) {
        setPreviewed(data);
        return;
      }
      setPreviewed(null);
      setResult(data);
      onDone?.(data);
    } catch (e) {
      setProblem(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  /** Why a row was left out; in "phone: validation.phone" the part after the field is a key too. */
  const reasonText = (reason: string) => {
    if (t.has(reason)) return t(reason);
    const at = reason.indexOf(": ");
    const rest = at < 0 ? "" : reason.slice(at + 2);
    return rest && t.has(rest) ? `${reason.slice(0, at)}: ${t(rest)}` : reason;
  };
  const skippedRows = (rows: ImportResult["skipped"]) =>
    rows.length > 0 ? (
      <View style={styles.rows} testID={`${testID}-skipped`}>
        {rows.slice(0, ROWS_SHOWN).map((row) => (
          <Text key={row.row} variant="small" tone="mutedForeground">
            {te("skippedRow", { row: row.row, reason: reasonText(row.reason) })}
          </Text>
        ))}
      </View>
    ) : null;

  const label = previewed
    ? te("confirmImport", { count: previewed.imported })
    : preview
      ? te("previewButton")
      : te("import");

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      testID={testID}
      footer={
        result ? (
          <Button label={t("common.close")} onPress={close} testID={`${testID}-done`} />
        ) : (
          <Button
            label={label}
            loading={busy}
            disabled={!file || (previewed !== null && previewed.imported === 0)}
            onPress={() => void send()}
            testID={`${testID}-submit`}
          />
        )
      }
    >
      <View style={styles.column}>
        <Text tone="mutedForeground" testID={`${testID}-hint`}>
          {description ?? te("importHint")}
        </Text>
        <Button
          variant="outline"
          icon={<Download size={18} color={colors.foreground} />}
          label={te("downloadTemplate")}
          loading={fetching}
          onPress={() => void template()}
          style={styles.start}
          testID={`${testID}-template`}
        />
        <View style={styles.file}>
          <Text variant="smallStrong">{te("file")}</Text>
          {file ? (
            <Text tone="mutedForeground" testID={`${testID}-file`}>
              {file.name}
            </Text>
          ) : null}
          <Button
            variant="outline"
            icon={<FileSpreadsheet size={18} color={colors.foreground} />}
            label={t(file ? "mobile.import.another" : "mobile.import.choose")}
            disabled={busy}
            onPress={() => void choose()}
            style={styles.start}
            testID={`${testID}-choose`}
          />
        </View>
        {problem ? (
          <Notice tone="destructive" testID={`${testID}-problem`}>
            {problem}
          </Notice>
        ) : null}
        {previewed && !result ? (
          <View style={styles.block} testID={`${testID}-preview`}>
            <Notice tone={previewed.imported > 0 ? "neutral" : "destructive"}>
              {te("preview", { count: previewed.imported, skipped: previewed.skipped.length })}
            </Notice>
            {previewed.byHeader === false ? (
              <Text variant="small" tone="mutedForeground" testID={`${testID}-no-header`}>
                {te("noHeader")}
              </Text>
            ) : null}
            {(previewed.matched?.length ?? 0) > 0 ? (
              <View style={styles.rows} testID={`${testID}-matched`}>
                <Text variant="smallStrong">{te("matchedRows")}</Text>
                {previewed.matched!.slice(0, ROWS_SHOWN).map((row) => (
                  <Text key={row.row} variant="small" tone="mutedForeground">
                    {row.row}: {row.label}
                  </Text>
                ))}
              </View>
            ) : null}
            {skippedRows(previewed.skipped)}
          </View>
        ) : null}
        {result ? (
          <View style={styles.block} testID={`${testID}-result`}>
            <Notice tone={result.imported > 0 ? "success" : "destructive"}>
              {te("imported", { count: result.imported, skipped: result.skipped.length })}
            </Notice>
            {skippedRows(result.skipped)}
            {(result.logins?.length ?? 0) > 0 ? (
              <View style={styles.rows} testID={`${testID}-logins`}>
                <Text variant="smallStrong">{te("logins")}</Text>
                <View style={[styles.logins, { borderColor: colors.border }]}>
                  {result.logins!.map((login) => (
                    // Held down, a line can be copied: these are shown this once.
                    <Text key={login.row} variant="small" selectable>
                      {login.label}: {login.secret}
                    </Text>
                  ))}
                </View>
                <Text variant="small" tone="mutedForeground">
                  {te("loginsHint")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4] },
  block: { gap: space[2] },
  file: { gap: space[2] },
  rows: { gap: space[1] },
  logins: { borderWidth: 1, borderRadius: radius.md, padding: space[3], gap: space[1] },
  start: { alignSelf: "flex-start" },
});
