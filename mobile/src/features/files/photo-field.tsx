import { ImagePlus, X } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Press } from "@/components/motion";
import { Avatar } from "@/components/surface";
import { Text } from "@/components/text";
import { apiForm, type PickedFile } from "@/lib/api";
import { fieldErrorOf } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

import { choosePhoto } from "./pick";

/** Sends a person's photo; the answer is the address their card keeps. */
export function uploadPhoto(file: PickedFile): Promise<{ url: string }> {
  return apiForm<{ url: string }>("/uploads", {}, file);
}

/**
 * A person's photo in a form (A-255), the site's photo field: the photo or the
 * initials, **Choose photo**, and a way to take the photo off. The photo is
 * sent as soon as it is chosen (cropped square by the phone and made light,
 * the server takes up to 2 MB) and the form keeps the address it got back;
 * nothing changes on the person's card until the form is saved.
 */
export function PhotoField({
  value,
  name,
  onChange,
  onBusy,
  testID = "photo",
}: {
  value: string | null;
  /** Whose photo it is: the initials stand in while there is none. */
  name: string;
  onChange: (url: string | null) => void;
  /** Hears when a photo is on its way, so the form can hold its Save. */
  onBusy?: (busy: boolean) => void;
  testID?: string;
}) {
  const t = useTranslations();
  const tf = useTranslations("staff.form");
  const th = useTranslations("mobile.homework");
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async () => {
    setProblem(null);
    const picked = await choosePhoto({ smallSquare: true }).catch(() => ({
      kind: "none" as const,
    }));
    if (picked.kind === "refused") setProblem(th(picked.reason));
    if (picked.kind !== "file") return;
    setBusy(true);
    onBusy?.(true);
    try {
      onChange((await uploadPhoto(picked.file)).url);
    } catch (e) {
      setProblem(fieldErrorOf(t, e)("file") ?? errorText(t, e));
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text variant="smallStrong">{tf("photo")}</Text>
      <View style={styles.row}>
        <Avatar name={name} photo={value} size={56} />
        <Button
          compact
          variant="outline"
          icon={<ImagePlus size={16} color={colors.foreground} />}
          label={busy ? tf("uploading") : tf("choosePhoto")}
          disabled={busy}
          onPress={() => void pick()}
          testID={`${testID}-choose`}
        />
        {value && !busy ? (
          <Press
            onPress={() => {
              setProblem(null);
              onChange(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={tf("removePhoto")}
            hitSlop={8}
            sink={0.88}
            style={styles.remove}
            testID={`${testID}-remove`}
          >
            <X size={18} color={colors.mutedForeground} />
          </Press>
        ) : null}
      </View>
      {problem ? (
        <Text variant="small" tone="destructive" testID={`${testID}-problem`}>
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  remove: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
