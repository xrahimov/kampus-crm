import { StyleSheet, View } from "react-native";

import { useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { Button } from "./button";
import { Sheet } from "./sheet";
import { Notice } from "./surface";
import { Text } from "./text";

/**
 * A question before something that is not easily taken back: what will
 * happen, Cancel, and the button that does it. The buttons are `<id>-cancel`
 * and `<id>-confirm` for the tests.
 */
export function Confirm({
  open,
  onClose,
  title,
  text,
  label,
  destructive = true,
  loading = false,
  problem,
  onConfirm,
  testID = "confirm",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text?: string;
  /** What the button that does it says. */
  label: string;
  destructive?: boolean;
  loading?: boolean;
  /** What went wrong the last time it was pressed. */
  problem?: string | null;
  onConfirm: () => void;
  testID?: string;
}) {
  const t = useTranslations();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <View style={styles.row}>
          <Button
            variant="outline"
            label={t("common.cancel")}
            onPress={onClose}
            style={styles.fill}
            testID={`${testID}-cancel`}
          />
          <Button
            variant={destructive ? "destructive" : "primary"}
            label={label}
            loading={loading}
            onPress={onConfirm}
            style={styles.fill}
            testID={`${testID}-confirm`}
          />
        </View>
      }
    >
      <View style={styles.body}>
        {text ? <Text>{text}</Text> : null}
        {problem ? <Notice tone="destructive">{problem}</Notice> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[2] },
  fill: { flex: 1 },
  body: { gap: space[3] },
});
