import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { api, ApiError } from "@/lib/api";
import { errorText, useTranslations } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { space } from "@/lib/theme";

/**
 * Choosing a password (A-196). Three moments use it: right after a first
 * sign-in with a Telegram code (offered once, "Not now" allowed), from the
 * settings, and when an administrator set the password and the person must
 * pick their own before anything else opens (A-124).
 */
export function PasswordScreen({
  forced = false,
  askCurrent = false,
  onDone,
}: {
  /** The person cannot go on without it: no "Not now". */
  forced?: boolean;
  /** The current password is asked for (a session a password opened). */
  askCurrent?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { state, refreshMe } = useSession();
  const client = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  const leave = () => {
    if (onDone) onDone();
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const save = async () => {
    setError(null);
    setField(null);
    if (next.length < 8) return setField(t("validation.passwordMin"));
    if (next !== again) return setField(t("validation.passwordMatch"));
    setBusy(true);
    try {
      if (state.status === "student") {
        await api("/student-auth/password", {
          method: "POST",
          body: { newPassword: next, ...(askCurrent ? { currentPassword: current } : {}) },
        });
      } else if (askCurrent) {
        await api("/auth/password", {
          method: "POST",
          body: { currentPassword: current, newPassword: next },
        });
      } else {
        await api("/auth/set-password", { method: "POST", body: { newPassword: next } });
      }
      if (state.status === "staff") {
        await refreshMe();
        // "My account" shows when the password was changed, and the other devices are signed out.
        void client.invalidateQueries({ queryKey: ["account"] });
      }
      leave();
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields : undefined;
      const first = fields ? Object.values(fields)[0]?.[0] : undefined;
      if (first && t.has(first)) setField(t(first));
      else setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padTop contentStyle={styles.column}>
      <View style={styles.head}>
        <Text variant="title">
          {forced ? t("auth.changePasswordTitle") : t("auth.setPasswordTitle")}
        </Text>
        <Text tone="mutedForeground">
          {forced ? t("auth.changePasswordSubtitle") : t("auth.setPasswordSubtitle")}
        </Text>
      </View>
      {error ? (
        <Notice tone="destructive" testID="password-error">
          {error}
        </Notice>
      ) : null}
      {askCurrent ? (
        <Field
          label={t("auth.currentPassword")}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
          testID="current-password"
        />
      ) : null}
      <Field
        label={t("auth.newPassword")}
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
        hint={t("auth.passwordHint")}
        testID="new-password"
      />
      <Field
        label={t("auth.confirmPassword")}
        value={again}
        onChangeText={setAgain}
        secureTextEntry
        autoComplete="new-password"
        error={field}
        onSubmitEditing={save}
        testID="confirm-password"
      />
      <Button label={t("auth.savePassword")} onPress={save} loading={busy} testID="save-password" />
      {!forced ? (
        <Button
          variant="ghost"
          label={t("auth.setPasswordLater")}
          onPress={leave}
          testID="password-later"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 460, paddingTop: space[8] },
  head: { gap: space[2] },
});
