import { FileUp } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { IMPORT_KINDS, useImportDetect, useImportRun, type ImportRun } from "@/api/office-import";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Badge, Card, Divider, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { chooseSheet } from "@/features/files/pick";
import type { PickedFile } from "@/lib/api";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { FORM_CARD } from "./integration-form";

/** How many rows of a list show; the site shows as many. */
const SHOWN = 50;

/**
 * Import from the old CRM (A-251): the site's Settings → Import from SOFF CRM.
 * One of the old CRM's Excel exports is chosen from this device; the server
 * says which list it is and how its columns are read; a preview says what
 * would go in; only then can it be imported. A preview belongs to its file
 * and its branch: another file or another branch starts over.
 */
export function ImportScreen() {
  const t = useTranslations();
  const tm = useTranslations("settings.migration");
  const me = useMe();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const detect = useImportDetect();
  const run = useImportRun();
  const [branchId, setBranchId] = useState(me.activeBranch?.id ?? me.branches[0]?.id ?? "");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [refused, setRefused] = useState<"tooBig" | "wrongType" | null>(null);
  const [preview, setPreview] = useState<ImportRun | null>(null);
  const [result, setResult] = useState<ImportRun | null>(null);

  const detection = detect.data ?? null;
  const kind = detection?.kind ?? null;
  const busy = detect.isPending || run.isPending;
  const shown = result ?? preview;
  // A reason the server gives as a key is said in words; one it has no words for is shown as it came.
  const said = (key: string) => (t.has(key) ? t(key) : key);
  /** Why a row was left out. "fullName: validation.required" reads "Full name: Required." */
  const reasonOf = (reason: string, of: string) => {
    const at = reason.indexOf(": ");
    if (at < 0) return said(reason);
    const field = reason.slice(0, at);
    const label = `fields.${of}.${field}`;
    return `${tm.has(label) ? tm(label) : field}: ${said(reason.slice(at + 2))}`;
  };

  const startOver = () => {
    setPreview(null);
    setResult(null);
    run.reset();
  };

  const choose = async () => {
    const picked = await chooseSheet();
    if (picked.kind === "none") return;
    startOver();
    detect.reset();
    if (picked.kind === "refused") {
      setFile(null);
      setRefused(picked.reason === "tooBig" ? "tooBig" : "wrongType");
      return;
    }
    setRefused(null);
    setFile(picked.file);
    detect.mutate(picked.file);
  };

  const start = (dryRun: boolean) => {
    if (!file || !kind || !branchId) return;
    run.mutate(
      { file, kind, branchId, dryRun },
      {
        onSuccess: (data) => {
          if (dryRun) setPreview(data);
          else {
            setPreview(null);
            setResult(data);
          }
        },
      },
    );
  };

  const problem = refused
    ? t(refused === "tooBig" ? "validation.importFileSize" : "validation.importFileType")
    : detect.error
      ? errorText(t, detect.error)
      : run.error
        ? errorText(t, run.error)
        : null;

  return (
    <Screen header={<Header back title={tm("title")} />}>
      <Text variant="small" tone="mutedForeground">
        {tm("description")}
      </Text>

      <Card style={FORM_CARD} testID="import-steps">
        <Text variant="bodyStrong">{tm("stepsTitle")}</Text>
        <Text variant="small" tone="mutedForeground">
          {tm("stepsHint")}
        </Text>
        <View style={wide ? styles.stepsWide : styles.steps}>
          {IMPORT_KINDS.map((one, index) => (
            <View
              key={one}
              style={[styles.step, wide ? styles.half : null, { borderColor: colors.border }]}
              testID={`import-step-${one}`}
            >
              <Text variant="small" tone="mutedForeground">
                {tm("step", { n: index + 1 })}
              </Text>
              <Text variant="bodyStrong">{tm(`kinds.${one}`)}</Text>
              <Text variant="small" tone="mutedForeground">
                {tm(`kindHints.${one}`)}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={FORM_CARD} testID="import-form">
        {me.branches.length > 1 ? (
          <Select
            label={t("branch.select")}
            value={branchId}
            onChange={(next) => {
              if (!next || next === branchId) return;
              setBranchId(next);
              // What an import answered stays (its passwords show once); only the preview goes.
              setPreview(null);
              run.reset();
            }}
            options={me.branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            testID="import-branch"
          />
        ) : null}
        <View style={styles.tight}>
          <Text variant="smallStrong">{tm("file")}</Text>
          {file ? (
            <Text variant="body" numberOfLines={2} testID="import-file-name">
              {file.name}
            </Text>
          ) : (
            <Text variant="small" tone="mutedForeground">
              {t("mobile.import.onDevice")}
            </Text>
          )}
          <Button
            variant="outline"
            icon={<FileUp size={16} color={colors.foreground} />}
            label={t(file ? "mobile.import.another" : "mobile.import.choose")}
            onPress={() => void choose()}
            disabled={busy}
            style={styles.start}
            testID="import-choose"
          />
        </View>

        {problem ? (
          <Notice tone="destructive" testID="import-problem">
            {problem}
          </Notice>
        ) : null}

        {detection ? (
          <View style={styles.block} testID="import-detection">
            {kind ? (
              <View style={styles.line}>
                <Badge tone="accent" label={tm(`kinds.${kind}`)} testID="import-kind" />
                <Text variant="small" tone="mutedForeground">
                  {tm("rows", { count: detection.rows })}
                </Text>
              </View>
            ) : (
              <Notice tone="destructive" testID="import-not-recognised">
                {tm("notRecognised")}
              </Notice>
            )}
            {kind ? (
              <View testID="import-columns">
                {Object.entries(detection.columns).map(([key, heading], index) => (
                  <View key={key}>
                    {index > 0 ? <Divider /> : null}
                    <View style={styles.column} testID={`import-column-${key}`}>
                      <Text variant="bodyStrong">{heading}</Text>
                      <Text variant="small">
                        {tm("kampusField")}: {tm(`fields.${kind}.${key}`)}
                      </Text>
                      <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                        {tm("sampleValue")}:{" "}
                        {detection.sample.map((row) => row[key]).find(Boolean) ?? "—"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            {detection.unknown.length > 0 ? (
              <Text variant="small" tone="mutedForeground" testID="import-unknown">
                {tm("unknown", { columns: detection.unknown.join(", ") })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {shown ? (
          <View style={styles.block} testID={result ? "import-result" : "import-preview"}>
            <Notice
              tone={shown.imported > 0 ? (result ? "success" : "neutral") : "destructive"}
              testID="import-count"
            >
              {tm(result ? "imported" : "preview", {
                count: shown.imported,
                skipped: shown.skipped.length,
              })}
            </Notice>
            {shown.extra.map((extra) => (
              <Text
                key={extra.key}
                variant="small"
                tone="mutedForeground"
                testID={`import-extra-${extra.key}`}
              >
                {tm(`extra.${extra.key}`, { count: extra.imported, skipped: extra.skipped })}
              </Text>
            ))}
            {!result && shown.matched.length > 0 ? (
              <View style={styles.rows} testID="import-matched">
                {shown.matched.slice(0, SHOWN).map((match) => (
                  <Text key={match.row} variant="small" tone="mutedForeground">
                    {match.row}: {match.label}
                  </Text>
                ))}
              </View>
            ) : null}
            {shown.skipped.length > 0 ? (
              <View style={styles.rows} testID="import-skipped">
                {shown.skipped.slice(0, SHOWN).map((skip) => (
                  <Text key={`${skip.row}-${skip.reason}`} variant="small" tone="mutedForeground">
                    {t("excel.skippedRow", {
                      row: skip.row,
                      reason: reasonOf(skip.reason, shown.kind),
                    })}
                  </Text>
                ))}
              </View>
            ) : null}
            {(shown.logins?.length ?? 0) > 0 ? (
              <View style={styles.tight} testID="import-logins">
                <Text variant="smallStrong">{t("excel.logins")}</Text>
                <View style={[styles.logins, { borderColor: colors.border }]}>
                  {shown.logins!.map((login) => (
                    <Text key={login.row} variant="small" selectable>
                      {login.label}: {login.secret}
                    </Text>
                  ))}
                </View>
                <Text variant="small" tone="mutedForeground">
                  {t("excel.loginsHint")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.buttons}>
          <Button
            variant="outline"
            label={tm("previewButton")}
            onPress={() => start(true)}
            loading={run.isPending && run.variables?.dryRun === true}
            disabled={!file || !kind || busy || !branchId}
            testID="import-preview-button"
          />
          <Button
            icon={<FileUp size={16} color={colors.primaryForeground} />}
            label={tm("importButton")}
            onPress={() => start(false)}
            loading={run.isPending && run.variables?.dryRun === false}
            disabled={!file || !kind || busy || !branchId || !preview || result !== null}
            testID="import-button"
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: space[2] },
  stepsWide: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  step: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: space[3],
    gap: space[1],
  },
  half: { flexGrow: 1, flexBasis: "45%" },
  tight: { gap: space[2] },
  block: { gap: space[3] },
  line: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space[2] },
  column: { paddingVertical: space[2], gap: 2 },
  rows: { gap: space[1] },
  logins: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: space[3],
    gap: space[1],
  },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  start: { alignSelf: "flex-start" },
});
