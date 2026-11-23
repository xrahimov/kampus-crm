import { useLocalSearchParams } from "expo-router";
import { Share2 } from "lucide-react-native";
import { useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { usePortalReferral } from "@/api/portal-own";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Card, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useLocaleChoice, useTranslations } from "@/lib/i18n";
import { font, radius, space, useTheme } from "@/lib/theme";

/**
 * "Invite a friend" on the student's side, in the app (A-216, the site's
 * A-120): the student's code, the link that carries it when the centre has a
 * sign-up form, and how many friends joined. **Share** hands the link to the
 * phone's own share sheet (Telegram, messages, copy).
 */
export function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const { locale } = useLocaleChoice();
  const { colors } = useTheme();
  const portal = usePortal(token);
  const query = usePortalReferral(token, locale);
  const [unshared, setUnshared] = useState(false);

  const header = (
    <Header back title={t("portal.referral.title")} subtitle={portal.data?.portal.group.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const { code, link, joined } = query.data;
  // A browser without a share sheet: the link is on the page to be copied by hand.
  const share = () => void Share.share({ message: link ?? code }).catch(() => setUnshared(true));

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Card testID="invite">
        <Text tone="mutedForeground">{t("portal.referral.intro")}</Text>
        <View style={styles.codeLine}>
          <Text variant="small" tone="mutedForeground">
            {t("portal.referral.code")}
          </Text>
          <View
            style={[styles.code, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Text selectable style={styles.codeText} testID="invite-code">
              {code}
            </Text>
          </View>
        </View>
        {link ? (
          <Text selectable variant="small" tone="mutedForeground" testID="invite-link">
            {link}
          </Text>
        ) : null}
        <Button
          label={t("mobile.invite.share")}
          icon={<Share2 size={18} color={colors.primaryForeground} />}
          onPress={share}
          testID="invite-share"
        />
        {unshared ? (
          <Text variant="small" tone="mutedForeground" testID="invite-unshared">
            {t("mobile.invite.copyByHand")}
          </Text>
        ) : null}
        <Text testID="invite-joined">{t("portal.referral.joined", { count: joined })}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeLine: { flexDirection: "row", alignItems: "center", gap: space[3] },
  code: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  codeText: { fontFamily: font.semibold, fontSize: 20, letterSpacing: 3 },
});
