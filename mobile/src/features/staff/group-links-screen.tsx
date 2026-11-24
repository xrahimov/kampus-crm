import { useLocalSearchParams } from "expo-router";
import { RefreshCw, Send, Share2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";

import {
  useNewStudentLink,
  useSmsStudentLinks,
  useStudentLinks,
  type StudentLink,
} from "@/api/group-lessons";
import { useGroup } from "@/api/hooks";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { API_ORIGIN } from "@/lib/api";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

/** What the SMS text keeps for the server to fill in for each student. */
const PLACEHOLDERS = { link: "{link}", studentName: "{studentName}" };

/** The address a student opens. A build served by Kampus itself has the page's own address. */
export function classLink(token: string): string {
  const origin =
    API_ORIGIN || (typeof location !== "undefined" && location.origin ? location.origin : "");
  return `${origin}/class/${token}`;
}

/**
 * Each student's own link to the group's video lessons (A-262), as the site's
 * "Students' links": the link is the same for every lesson, so it is handed
 * over once, through whatever the phone shares with. A new link cuts off one
 * that was passed on. Whoever may send SMS can text everybody theirs.
 */
export function GroupLinksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const tl = useTranslations("video.links");
  const { colors } = useTheme();
  const me = useMe();
  const group = useGroup(id);
  const links = useStudentLinks(id);
  const renew = useNewStudentLink(id);
  const sms = useSmsStudentLinks(id);
  const [text, setText] = useState(() => tl("smsDefault", PLACEHOLDERS));
  const [renewing, setRenewing] = useState<StudentLink | null>(null);
  const [renewed, setRenewed] = useState<string | null>(null);
  const [unshared, setUnshared] = useState(false);

  const header = <Header back title={t("video.card.links")} subtitle={group.data?.name} />;
  if (!links.data) return <PendingScreen header={header} query={links} />;

  const share = (message: string) => {
    setUnshared(false);
    // Closing the phone's share sheet without choosing is not a failure.
    void Share.share({ message }).catch(() => setUnshared(true));
  };
  const rows = links.data;
  const everyone = rows.map((row) => `${row.fullName}: ${classLink(row.token)}`).join("\n");
  const smsField = fieldErrorOf(t, sms.error)("text");

  return (
    <Screen
      header={header}
      onRefresh={() => void links.refetch()}
      refreshing={links.isRefetching}
      contentStyle={styles.column}
    >
      <Text tone="mutedForeground">{t("mobile.lessons.linksHint")}</Text>
      {renewed ? (
        <Notice tone="success" testID="link-renewed">
          {tl("resetDone", { name: renewed })}
        </Notice>
      ) : null}
      {unshared ? (
        <Notice tone="warning" testID="link-unshared">
          {t("mobile.lessons.unshared")}
        </Notice>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={tl("empty")} />
      ) : (
        <>
          <Card style={styles.flush} testID="links-list">
            {rows.map((row, index) => (
              <View key={row.membershipId}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.row} testID={`link-${row.membershipId}`}>
                  <View style={styles.fill}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {row.fullName}
                    </Text>
                    <Text
                      variant="small"
                      tone="mutedForeground"
                      numberOfLines={1}
                      selectable
                      testID={`link-address-${row.membershipId}`}
                    >
                      {classLink(row.token)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => share(classLink(row.token))}
                    accessibilityRole="button"
                    accessibilityLabel={t("mobile.lessons.shareLinkOf", { name: row.fullName })}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.icon,
                      { borderColor: colors.input },
                      pressed ? { backgroundColor: colors.muted } : null,
                    ]}
                    testID={`link-share-${row.membershipId}`}
                  >
                    <Share2 size={18} color={colors.foreground} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      renew.reset();
                      setRenewed(null);
                      setRenewing(row);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={tl("reset", { name: row.fullName })}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.icon,
                      { borderColor: colors.input },
                      pressed ? { backgroundColor: colors.muted } : null,
                    ]}
                    testID={`link-new-${row.membershipId}`}
                  >
                    <RefreshCw size={18} color={colors.foreground} />
                  </Pressable>
                </View>
              </View>
            ))}
          </Card>
          <Button
            variant="outline"
            label={t("mobile.lessons.shareAll")}
            icon={<Share2 size={16} color={colors.foreground} />}
            onPress={() => share(everyone)}
            style={styles.start}
            testID="links-share-all"
          />
          {can(me, "sms.send") ? (
            <Card style={styles.form} testID="links-sms">
              <Field
                label={tl("smsLabel")}
                hint={tl("smsHint", PLACEHOLDERS)}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={600}
                style={styles.text}
                error={smsField}
                testID="links-sms-text"
              />
              {sms.error && !hasFieldErrors(sms.error) ? (
                <Notice tone="destructive" testID="links-sms-problem">
                  {errorText(t, sms.error)}
                </Notice>
              ) : null}
              {sms.data ? (
                <Notice
                  tone={sms.data.failed > 0 ? "destructive" : "success"}
                  testID="links-sms-result"
                >
                  {tl("smsResult", { ...sms.data })}
                </Notice>
              ) : null}
              <Button
                label={tl("sendSms")}
                icon={<Send size={16} color={colors.primaryForeground} />}
                loading={sms.isPending}
                disabled={!text.trim()}
                onPress={() => sms.mutate(text.trim())}
                style={styles.start}
                testID="links-sms-send"
              />
            </Card>
          ) : null}
        </>
      )}
      <Confirm
        open={renewing !== null}
        onClose={() => setRenewing(null)}
        title={tl("reset", { name: renewing?.fullName ?? "" })}
        text={t("mobile.lessons.newLinkText")}
        label={t("mobile.lessons.newLink")}
        loading={renew.isPending}
        problem={renew.error ? errorText(t, renew.error) : null}
        onConfirm={() => {
          if (!renewing) return;
          const name = renewing.fullName;
          renew.mutate(renewing.membershipId, {
            onSuccess: () => {
              setRenewing(null);
              setRenewed(name);
            },
          });
        }}
        testID="link-new"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  form: { gap: space[3] },
  text: { minHeight: 96, textAlignVertical: "top" },
  start: { alignSelf: "flex-start" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 60,
  },
  icon: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
