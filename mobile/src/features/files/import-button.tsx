import { useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Button } from "@/components/button";
import { ActionRow } from "@/components/rows";
import { Sheet } from "@/components/sheet";
import { Divider } from "@/components/surface";
import { useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { useTheme } from "@/lib/theme";

import { ImportSheet, type ImportResult } from "./import-sheet";

/** One of the site's imports: what its dialog says and the calls behind it. */
export interface ImportKind {
  /** Names the import in test IDs: "students-import-balances". */
  id: string;
  title: string;
  description?: string;
  /** The template's call under /api/v1. */
  templatePath: string;
  /** The call under /api/v1 that takes the sheet. */
  importPath: string;
  /** New rows go to the branch the person works in, as on the site. */
  toBranch?: boolean;
  /** Shows what would happen before anything is written. */
  preview?: boolean;
}

/** The branch a sheet's new rows go to: the one the person works in, else their first. */
function useImportBranch(): string {
  const me = useMe();
  return me.activeBranch?.id ?? me.branches[0]?.id ?? "";
}

/** After an import the lists are stale, and one sheet can touch several of them. */
function useAfterImport() {
  const client = useQueryClient();
  return (result: ImportResult) => {
    if (result.imported > 0) void client.invalidateQueries();
  };
}

/**
 * The site's "Import from Excel" button in the app (A-257): opens the import
 * sheet for one kind of import.
 */
export function ImportButton({
  kind,
  label,
  compact,
  style,
}: {
  kind: ImportKind;
  label?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const branchId = useImportBranch();
  const done = useAfterImport();
  const [open, setOpen] = useState(false);
  return (
    <View style={style}>
      <Button
        variant="outline"
        compact={compact}
        icon={<FileUp size={compact ? 16 : 18} color={colors.foreground} />}
        label={label ?? t("excel.importButton")}
        onPress={() => setOpen(true)}
        style={styles.start}
        testID={`${kind.id}-open`}
      />
      <ImportSheet
        open={open}
        onClose={() => setOpen(false)}
        title={kind.title}
        description={kind.description}
        templatePath={kind.templatePath}
        importPath={kind.importPath}
        fields={kind.toBranch ? { branchId } : undefined}
        preview={kind.preview}
        onDone={done}
        testID={kind.id}
      />
    </View>
  );
}

/**
 * Several imports behind one button (A-257), as the site's "Import" menu on
 * the students page: the button opens the list, a line opens that import.
 * With one kind it is a plain import button; with none, nothing.
 */
export function ImportMenu({
  label,
  kinds,
  testID,
  style,
}: {
  label: string;
  kinds: ImportKind[];
  testID: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const branchId = useImportBranch();
  const done = useAfterImport();
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<ImportKind | null>(null);
  // The import last opened stays in the sheet while it slides away.
  const [shown, setShown] = useState<ImportKind | null>(null);
  if (kinds.length === 0) return null;
  const pick = (kind: ImportKind) => {
    setChoosing(false);
    setShown(kind);
    setChosen(kind);
  };
  return (
    <View style={style}>
      <Button
        variant="outline"
        icon={<FileUp size={18} color={colors.foreground} />}
        label={label}
        onPress={() => setChoosing(true)}
        style={styles.start}
        testID={testID}
      />
      <Sheet
        open={choosing}
        onClose={() => setChoosing(false)}
        title={label}
        testID={`${testID}-list`}
      >
        <View>
          {kinds.map((kind, index) => (
            <View key={kind.id}>
              {index > 0 ? <Divider /> : null}
              <ActionRow
                icon={FileUp}
                label={kind.title}
                onPress={() => pick(kind)}
                testID={`${kind.id}-open`}
              />
            </View>
          ))}
        </View>
      </Sheet>
      {shown ? (
        <ImportSheet
          key={shown.id}
          open={chosen !== null}
          onClose={() => setChosen(null)}
          title={shown.title}
          description={shown.description}
          templatePath={shown.templatePath}
          importPath={shown.importPath}
          fields={shown.toBranch ? { branchId } : undefined}
          preview={shown.preview}
          onDone={done}
          testID={shown.id}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
});
