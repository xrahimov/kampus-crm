import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { ChoiceList } from "@/components/choice-list";
import { Header } from "@/components/header";
import { Avatar, Card, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { api, APP_VERSION } from "@/lib/api";
import { DeviceSettings } from "@/features/shared/device-settings";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useMe, useSession } from "@/lib/session";
import { space } from "@/lib/theme";

import { HoursCard } from "@/features/catalog/hours";
import { Menu } from "@/features/office/menu";

import { OpenOnSite } from "./open-on-site";

/** The person, their settings for this phone, the way to the site, and the way out. */
export function MoreScreen() {
  const t = useTranslations();
  const me = useMe();
  const { signOut, refreshMe } = useSession();
  const { wide } = useLayout();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  /** A change of view or branch changes what every list holds: ask for all of it again. */
  const change = async (path: string, body: unknown) => {
    setError(null);
    try {
      await api(path, { method: "POST", body });
      await refreshMe();
      await client.invalidateQueries();
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  const account = (
    <View style={styles.block}>
      <Card>
        <View style={styles.person}>
          <Avatar name={me.user.fullName} size={48} />
          <View style={styles.fill}>
            <Text variant="heading" testID="me-name">
              {me.user.fullName}
            </Text>
            <Text variant="small" tone="mutedForeground">
              {[me.user.phone, ...me.roles.map((r) => r.name)].join(", ")}
            </Text>
          </View>
        </View>
      </Card>
      {/* Every page the person may open, before the choices of view and branch (A-230). */}
      <Menu />
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      {me.view.canSwitch ? (
        <ChoiceList
          label={t("view.label")}
          value={me.view.current}
          onChange={(view) => void change("/auth/view", { view })}
          options={[
            { value: "TEACHING", label: t("view.teachingHint") },
            { value: "FULL", label: t("view.fullHint") },
          ]}
        />
      ) : null}
      {me.branches.length > 1 ? (
        <ChoiceList
          label={t("branch.select")}
          value={me.activeBranch?.id ?? null}
          onChange={(branchId) => void change("/auth/active-branch", { branchId })}
          options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      ) : null}
      {/* A teacher's own hours for 1:1 booking, as on the site's "My account" (A-234). */}
      {me.roles.some((r) => r.code === "TEACHER" || r.code === "SUPPORT_TEACHER") ? (
        <HoursCard userId={me.user.id} canEdit own />
      ) : null}
      <Card>
        <Text variant="heading">{t("mobile.siteTitle")}</Text>
        <Text variant="small" tone="mutedForeground">
          {t("mobile.siteText")}
        </Text>
        <OpenOnSite path="/" />
      </Card>
    </View>
  );

  const device = (
    <View style={styles.block}>
      <DeviceSettings />
      <Button
        variant="destructive"
        label={t("auth.signOut")}
        loading={leaving}
        onPress={() => {
          setLeaving(true);
          void signOut();
        }}
        testID="sign-out"
      />
      <Text variant="small" tone="mutedForeground" style={styles.version}>
        {t("mobile.version", { version: APP_VERSION })}
      </Text>
    </View>
  );

  return (
    <Screen
      header={<Header title={t("nav.more")} />}
      contentStyle={wide ? styles.split : undefined}
    >
      {wide ? (
        <>
          <View style={styles.fill}>{account}</View>
          <View style={styles.fill}>{device}</View>
        </>
      ) : (
        <>
          {account}
          {device}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  block: { gap: space[4] },
  person: { flexDirection: "row", alignItems: "center", gap: space[3] },
  version: { textAlign: "center" },
});
