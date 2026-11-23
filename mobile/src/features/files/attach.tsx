import { useRouter } from "expo-router";
import { Camera, Image as ImageIcon, Paperclip } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import type { PickedFile } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

import { fileRoute } from "./file-screen";
import { chooseFile, choosePhoto, takePhoto, type Picked } from "./pick";

/**
 * One file to send with something a teacher writes (a task, a post): a new
 * photo, a photo from the gallery or any file from this device. `saved` is a
 * file the record already has; it can be opened, replaced or taken off.
 */
export function Attach({
  file,
  onFile,
  saved = null,
  onRemoveSaved,
  disabled = false,
  testID = "attach",
}: {
  file: PickedFile | null;
  onFile: (file: PickedFile | null) => void;
  /** The address of the file saved earlier, when there is one. */
  saved?: string | null;
  onRemoveSaved?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTranslations();
  const tm = useTranslations("mobile.homework");
  const router = useRouter();
  const { colors } = useTheme();
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (from: () => Promise<Picked>) => {
    setProblem(null);
    const picked = await from().catch((): Picked => ({ kind: "none" }));
    if (picked.kind === "refused") setProblem(tm(picked.reason));
    if (picked.kind === "file") onFile(picked.file);
  };

  const has = file !== null || saved !== null;
  return (
    <View style={styles.wrap} testID={testID}>
      {file ? (
        <View style={[styles.attached, { borderColor: colors.border }]}>
          <Paperclip size={16} color={colors.mutedForeground} />
          <Text variant="small" style={styles.fill} numberOfLines={1} testID={`${testID}-name`}>
            {tm("attached", { name: file.name })}
          </Text>
          <Button
            compact
            variant="ghost"
            label={tm("removeFile")}
            disabled={disabled}
            onPress={() => onFile(null)}
            testID={`${testID}-remove`}
          />
        </View>
      ) : saved ? (
        <View style={[styles.attached, { borderColor: colors.border }]}>
          <Paperclip size={16} color={colors.mutedForeground} />
          <Text variant="small" style={styles.fill} numberOfLines={1}>
            {t("groups.homework.file")}
          </Text>
          <Button
            compact
            variant="ghost"
            label={t("groups.homework.openFile")}
            onPress={() => router.push(fileRoute(saved, t("groups.homework.file")))}
            testID={`${testID}-open`}
          />
          {onRemoveSaved ? (
            <Button
              compact
              variant="ghost"
              label={tm("removeFile")}
              disabled={disabled}
              onPress={onRemoveSaved}
              testID={`${testID}-remove-saved`}
            />
          ) : null}
        </View>
      ) : null}
      {file ? null : (
        <View style={styles.row}>
          <Button
            compact
            variant="outline"
            label={tm("takePhoto")}
            icon={<Camera size={16} color={colors.foreground} />}
            disabled={disabled}
            onPress={() => void pick(takePhoto)}
            testID={`${testID}-take-photo`}
          />
          <Button
            compact
            variant="outline"
            label={tm("choosePhoto")}
            icon={<ImageIcon size={16} color={colors.foreground} />}
            disabled={disabled}
            onPress={() => void pick(choosePhoto)}
            testID={`${testID}-choose-photo`}
          />
          <Button
            compact
            variant="outline"
            label={has ? t("groups.homework.replaceFile") : tm("chooseFile")}
            icon={<Paperclip size={16} color={colors.foreground} />}
            disabled={disabled}
            onPress={() => void pick(chooseFile)}
            testID={`${testID}-choose-file`}
          />
        </View>
      )}
      {problem ? (
        <Notice tone="destructive" testID={`${testID}-problem`}>
          {problem}
        </Notice>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  fill: { flex: 1 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  attached: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: space[3],
    paddingVertical: space[1],
  },
});
