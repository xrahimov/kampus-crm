import { ExternalLink } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/button";
import { Notice } from "@/components/surface";
import { errorText, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";
import { openOnSite } from "@/lib/web";

/**
 * A page the app does not have yet opens on the site, already signed in
 * (A-204). `path` is the site's path without the language: "/groups/abc".
 */
export function OpenOnSite({
  path,
  label,
  testID = "open-on-site",
}: {
  path: string;
  label?: string;
  testID?: string;
}) {
  const t = useTranslations();
  const { locale } = useLocaleChoice();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setError(null);
    setBusy(true);
    try {
      await openOnSite(`/${locale}${path === "/" ? "" : path}`);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: space[2], alignSelf: "stretch" }}>
      <Button
        variant="outline"
        label={label ?? t("mobile.openOnSite")}
        icon={<ExternalLink size={18} color={colors.foreground} />}
        onPress={open}
        loading={busy}
        testID={testID}
      />
      {error ? <Notice tone="destructive">{error}</Notice> : null}
    </View>
  );
}
