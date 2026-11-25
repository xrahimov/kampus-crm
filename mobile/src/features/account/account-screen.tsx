import { useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import {
  useAccount,
  useAccountSessions,
  useAskDeletion,
  useSetSignInCode,
  useSignOutOthers,
  useSignOutSession,
  useWithdrawDeletion,
  type AccountSession,
} from "@/api/account";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { Header } from "@/components/header";
import { Badge, Card, Divider, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { API_ORIGIN, ApiError } from "@/lib/api";
import { errorText, useDate, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

/**
 * "My account" (A-261), the site's page of the same name: the person's own
 * password, whether a Telegram code is asked for at sign-in, and the devices
 * they are signed in on, each of which can be signed out from here.
 */
export function AccountScreen() {
  const t = useTranslations();
  const ta = useTranslations("account");
  const date = useDate();
  const router = useRouter();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const account = useAccount();
  const sessions = useAccountSessions();
  const code = useSetSignInCode();
  const signOutOne = useSignOutSession();
  const signOutOthers = useSignOutOthers();
  const askDeletion = useAskDeletion();
  const withdrawDeletion = useWithdrawDeletion();
  const { locale } = useLocaleChoice();
  const [asking, setAsking] = useState(false);

  // The page's one-line description fits a tablet's header; on a phone it would be cut short.
  const header = (
    <Header title={ta("title")} subtitle={wide ? ta("description") : undefined} back />
  );
  if (!account.data) return <PendingScreen header={header} query={account} />;
  const me = account.data;
  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current);
  // The server names the field when the switch cannot be turned: no Telegram chat is linked.
  const codeProblem = code.error
    ? code.error instanceof ApiError && code.error.fields?.signInCode?.[0]
      ? t.has(code.error.fields.signInCode[0])
        ? t(code.error.fields.signInCode[0])
        : errorText(t, code.error)
      : errorText(t, code.error)
    : null;

  return (
    <Screen
      header={header}
      onRefresh={() => {
        void account.refetch();
        void sessions.refetch();
      }}
      refreshing={account.isRefetching || sessions.isRefetching}
      contentStyle={styles.page}
    >
      <View style={wide ? styles.pair : styles.stack}>
        <Card style={wide ? styles.half : null} testID="account-password">
          <Text variant="heading">{ta("password.title")}</Text>
          <Text tone="mutedForeground" testID="account-password-state">
            {me.mustChangePassword
              ? ta("password.none")
              : me.passwordChangedAt
                ? ta("password.changed", {
                    date: date(new Date(me.passwordChangedAt), { dateStyle: "medium" }),
                  })
                : ta("password.never")}
          </Text>
          {me.telegramSession ? (
            <Text variant="small" tone="mutedForeground" testID="account-password-by-telegram">
              {ta("password.byTelegram")}
            </Text>
          ) : null}
          <Button
            variant="outline"
            label={
              me.mustChangePassword
                ? t("studentApp.choosePassword")
                : t("studentApp.changePassword")
            }
            icon={<KeyRound size={18} color={colors.foreground} />}
            onPress={() =>
              router.push({
                pathname: "/set-password",
                // A session a Telegram code opened sets a password without the old one (A-196).
                params: me.telegramSession ? {} : { current: "1" },
              })
            }
            style={styles.start}
            testID="account-change-password"
          />
          {me.telegramSession ? null : (
            <Text variant="small" tone="mutedForeground">
              {ta("password.forgot")}
            </Text>
          )}
        </Card>
        <Card style={wide ? styles.half : null} testID="account-code">
          <Text variant="heading">{ta("signInCode.title")}</Text>
          <Text tone="mutedForeground">{ta("signInCode.hint")}</Text>
          <Check
            label={ta("signInCode.label")}
            value={me.signInCode === "TELEGRAM"}
            onChange={(on) => code.mutate(on)}
            disabled={!me.telegramLinked || code.isPending}
            testID="account-sign-in-code"
          />
          <Text variant="small" tone="mutedForeground" testID="account-code-state">
            {me.signInCode === "TELEGRAM" ? ta("signInCode.on") : ta("signInCode.off")}
          </Text>
          {me.telegramLinked ? null : (
            <Notice testID="account-needs-telegram">{ta("signInCode.needsTelegram")}</Notice>
          )}
          {codeProblem ? (
            <Notice tone="destructive" testID="account-code-problem">
              {codeProblem}
            </Notice>
          ) : null}
        </Card>
      </View>
      <Card testID="account-sessions">
        <Text variant="heading">{ta("sessions.title")}</Text>
        <Text tone="mutedForeground">{ta("sessions.hint")}</Text>
        {sessions.error ? (
          <Notice tone="destructive" testID="account-sessions-problem">
            {errorText(t, sessions.error)}
          </Notice>
        ) : null}
        {signOutOthers.data ? (
          <Notice tone="success" testID="account-signed-out-others">
            {ta("sessions.signedOutOthers", { count: signOutOthers.data.revoked })}
          </Notice>
        ) : null}
        {signOutOne.error || signOutOthers.error ? (
          <Notice tone="destructive" testID="account-sign-out-problem">
            {errorText(t, signOutOne.error ?? signOutOthers.error)}
          </Notice>
        ) : null}
        <View>
          {list.map((session, index) => (
            <View key={session.id}>
              {index > 0 ? <Divider /> : null}
              <SessionRow
                session={session}
                busy={signOutOne.isPending && signOutOne.variables === session.id}
                onSignOut={() => signOutOne.mutate(session.id)}
              />
            </View>
          ))}
        </View>
        <Button
          variant="outline"
          label={ta("sessions.signOutOthers")}
          disabled={others.length === 0}
          loading={signOutOthers.isPending}
          onPress={() => signOutOthers.mutate()}
          style={styles.start}
          testID="account-sign-out-others"
        />
      </Card>
      {/* The app stores ask that an account can be deleted where it is used (A-267). */}
      <Card testID="account-deletion">
        <Text variant="heading">{ta("deletion.title")}</Text>
        <Text tone="mutedForeground">{ta("deletion.hint")}</Text>
        {me.deletionRequestedAt ? (
          <Notice testID="account-deletion-asked">
            {ta("deletion.asked", {
              date: date(new Date(me.deletionRequestedAt), { dateStyle: "medium" }),
            })}
          </Notice>
        ) : null}
        {withdrawDeletion.error ? (
          <Notice tone="destructive" testID="account-deletion-problem">
            {errorText(t, withdrawDeletion.error)}
          </Notice>
        ) : null}
        <View style={styles.actions}>
          {me.deletionRequestedAt ? (
            <Button
              variant="outline"
              label={ta("deletion.withdraw")}
              loading={withdrawDeletion.isPending}
              onPress={() => withdrawDeletion.mutate()}
              testID="account-deletion-withdraw"
            />
          ) : (
            <Button
              variant="destructive"
              label={ta("deletion.ask")}
              onPress={() => {
                askDeletion.reset();
                setAsking(true);
              }}
              testID="account-deletion-ask"
            />
          )}
          {/* The page that says what goes and what the centre keeps is the site's, open to anyone. */}
          <Button
            variant="ghost"
            label={ta("deletion.more")}
            onPress={() =>
              void Linking.openURL(`${API_ORIGIN}/${locale}/delete-account`).catch(() => undefined)
            }
            testID="account-deletion-more"
          />
        </View>
      </Card>
      <Confirm
        open={asking}
        onClose={() => setAsking(false)}
        title={ta("deletion.confirmTitle")}
        text={ta("deletion.confirmText")}
        // One word: the two buttons share a phone's width, and the title asks the question.
        label={t("mobile.ask")}
        loading={askDeletion.isPending}
        problem={askDeletion.error ? errorText(t, askDeletion.error) : null}
        onConfirm={() => askDeletion.mutate(undefined, { onSuccess: () => setAsking(false) })}
        testID="account-deletion-confirm"
      />
    </Screen>
  );
}

function SessionRow({
  session,
  busy,
  onSignOut,
}: {
  session: AccountSession;
  busy: boolean;
  onSignOut: () => void;
}) {
  const ta = useTranslations("account.sessions");
  const date = useDate();
  const when = (iso: string) => date(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  return (
    <View style={styles.session} testID={`session-${session.id}`}>
      <View style={styles.fill}>
        <View style={styles.name}>
          <Text variant="bodyStrong">{session.device}</Text>
          {session.current ? (
            <Badge label={ta("current")} tone="success" testID="session-current" />
          ) : null}
        </View>
        {session.ip ? (
          <Text variant="small" tone="mutedForeground">
            {ta("address")}: {session.ip}
          </Text>
        ) : null}
        <Text variant="small" tone="mutedForeground">
          {ta("signedIn")}: {when(session.createdAt)}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {ta("lastSeen")}: {when(session.lastSeenAt)}
        </Text>
      </View>
      {session.current ? null : (
        <Button
          variant="ghost"
          compact
          label={ta("signOut")}
          loading={busy}
          onPress={onSignOut}
          testID={`session-sign-out-${session.id}`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: space[4], maxWidth: 960 },
  stack: { gap: space[4] },
  pair: { flexDirection: "row", alignItems: "flex-start", gap: space[4] },
  half: { flex: 1 },
  start: { alignSelf: "flex-start" },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  session: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] },
  name: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
});
