import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  useCoinReasonRows,
  useCoinReasonStep,
  useCoinSettings,
  useSaveCoinSettings,
  type CoinEvent,
  type CoinReasonRow,
  type CoinSettings,
} from "@/api/office-settings";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

import { RowPress } from "./parts";

/** A whole number of coins from 1 to 100,000, or null for anything else typed. */
export function typedCoins(typed: string): number | null {
  const value = typed.trim();
  if (!/^\d{1,6}$/.test(value)) return null;
  const coins = Number(value);
  return coins >= 1 && coins <= 100_000 ? coins : null;
}

/**
 * Coin settings (A-242): the site's Settings → Coin settings. The switch for
 * automatic coins with how many each event gives, and the reasons a teacher
 * picks from when giving coins by hand, each with its most.
 */
export function CoinsSettingsScreen() {
  const tr = useTranslations("coins.settings");
  const query = useCoinSettings();
  const header = <Header back title={tr("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {tr("description")}
      </Text>
      <Rules settings={query.data} />
      <Reasons />
    </Screen>
  );
}

function Rules({ settings }: { settings: CoinSettings }) {
  const t = useTranslations();
  const tr = useTranslations("coins.settings");
  const { wide } = useLayout();
  const save = useSaveCoinSettings();
  const [autoCoins, setAutoCoins] = useState(settings.autoCoins);
  const [rules, setRules] = useState(
    settings.rules.map((rule) => ({ ...rule, amount: String(rule.amount) })),
  );
  const [checked, setChecked] = useState(false);
  const touch = () => {
    if (save.isSuccess || save.error) save.reset();
  };
  const change = (event: CoinEvent, next: { amount?: string; isActive?: boolean }) => {
    touch();
    setRules((now) => now.map((rule) => (rule.event === event ? { ...rule, ...next } : rule)));
  };

  const submit = () => {
    setChecked(true);
    const amounts = rules.map((rule) => typedCoins(rule.amount));
    if (amounts.some((amount) => amount === null)) return;
    save.mutate({
      autoCoins,
      rules: rules.map((rule, index) => ({ ...rule, amount: amounts[index] ?? 1 })),
    });
  };

  return (
    <Card testID="coin-rules">
      <Check
        label={tr("autoCoins")}
        hint={tr("autoCoinsHint")}
        value={autoCoins}
        onChange={(on) => {
          touch();
          setAutoCoins(on);
        }}
        testID="coin-auto"
      />
      <Text variant="heading">{tr("rulesTitle")}</Text>
      <View style={styles.rules}>
        {rules.map((rule) => (
          <View
            key={rule.event}
            style={[styles.ruleRow, wide ? styles.half : styles.full]}
            testID={`coin-rule-${rule.event}`}
          >
            <View style={styles.amount}>
              <Field
                label={tr(`events.${rule.event}`)}
                value={rule.amount}
                onChangeText={(amount) => change(rule.event, { amount })}
                keyboardType="number-pad"
                maxLength={6}
                error={
                  checked && typedCoins(rule.amount) === null
                    ? t(rule.amount.trim() === "" ? "validation.required" : "validation.min")
                    : null
                }
                testID={`coin-rule-amount-${rule.event}`}
              />
            </View>
            <View style={styles.active}>
              <Check
                label={t("common.active")}
                value={rule.isActive}
                onChange={(isActive) => change(rule.event, { isActive })}
                testID={`coin-rule-active-${rule.event}`}
              />
            </View>
          </View>
        ))}
      </View>
      {save.error ? (
        <Notice tone="destructive" testID="coin-rules-problem">
          {errorText(t, save.error)}
        </Notice>
      ) : null}
      {save.isSuccess ? (
        <Notice tone="success" testID="coin-rules-saved">
          {t("common.saved")}
        </Notice>
      ) : null}
      <Button
        label={t("common.save")}
        loading={save.isPending}
        onPress={submit}
        testID="coin-rules-save"
      />
    </Card>
  );
}

function Reasons() {
  const t = useTranslations();
  const tr = useTranslations("coins.settings");
  const { colors } = useTheme();
  const query = useCoinReasonRows();
  const [form, setForm] = useState<CoinReasonRow | "new" | null>(null);
  const [shown, setShown] = useState<CoinReasonRow | "new">("new");
  const openForm = (next: CoinReasonRow | "new") => {
    setShown(next);
    setForm(next);
  };
  return (
    <Card testID="coin-reasons">
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="heading">{tr("reasonsTitle")}</Text>
          <Text variant="small" tone="mutedForeground">
            {tr("reasonsDescription")}
          </Text>
        </View>
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={tr("addReason")}
          onPress={() => openForm("new")}
          testID="coin-reason-add"
        />
      </View>
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {!query.data && !query.error ? <Loading /> : null}
      {query.data && query.data.length === 0 ? (
        <Text tone="mutedForeground" testID="coin-reasons-empty">
          {t("common.nothingFound")}
        </Text>
      ) : null}
      {query.data && query.data.length > 0 ? (
        <View style={styles.list}>
          {query.data.map((reason, index) => (
            <View key={reason.id}>
              {index > 0 ? <Divider /> : null}
              <RowPress onPress={() => openForm(reason)} testID={`coin-reason-${reason.id}`}>
                <View style={styles.fill}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {reason.name}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {tr("upTo", { max: reason.maxCoins })}
                  </Text>
                </View>
                <Badge
                  tone={reason.isActive ? "success" : "neutral"}
                  label={t(reason.isActive ? "common.active" : "common.inactive")}
                />
              </RowPress>
            </View>
          ))}
        </View>
      ) : null}
      <ReasonSheet
        key={shown === "new" ? "new" : shown.id}
        open={form !== null}
        onClose={() => setForm(null)}
        reason={shown === "new" ? undefined : shown}
      />
    </Card>
  );
}

function ReasonSheet({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason?: CoinReasonRow;
}) {
  const t = useTranslations();
  const tr = useTranslations("coins.settings");
  const save = useCoinReasonStep();
  const remove = useCoinReasonStep();
  const [name, setName] = useState(reason?.name ?? "");
  const [maxCoins, setMaxCoins] = useState(String(reason?.maxCoins ?? 10));
  const [isActive, setIsActive] = useState(reason?.isActive ?? true);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(reason?.name ?? "");
      setMaxCoins(String(reason?.maxCoins ?? 10));
      setIsActive(reason?.isActive ?? true);
      setMissing(false);
      save.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  const most = typedCoins(maxCoins);

  const submit = () => {
    if (!name.trim() || most === null) {
      setMissing(true);
      return;
    }
    save.mutate(
      { id: reason?.id ?? null, input: { name: name.trim(), maxCoins: most, isActive } },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={reason ? tr("editReason") : tr("addReason")}
        testID="coin-reason-form"
        footer={
          <View style={styles.footer}>
            <Button
              label={t("common.save")}
              loading={save.isPending}
              onPress={submit}
              testID="coin-reason-save"
            />
            {reason ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => setDeleting(true)}
                testID="coin-reason-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          {save.error && !hasFieldErrors(save.error) ? (
            <Notice tone="destructive" testID="coin-reason-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          <Field
            label={tr("reasonName")}
            value={name}
            onChangeText={setName}
            maxLength={80}
            error={
              fieldError("name") ?? (missing && !name.trim() ? t("validation.required") : null)
            }
            testID="coin-reason-name"
          />
          <Field
            label={tr("maxCoins")}
            value={maxCoins}
            onChangeText={setMaxCoins}
            keyboardType="number-pad"
            maxLength={6}
            hint={tr("maxCoinsHint")}
            error={
              fieldError("maxCoins") ??
              (missing && most === null
                ? t(maxCoins.trim() === "" ? "validation.required" : "validation.min")
                : null)
            }
            testID="coin-reason-max"
          />
          <Check
            label={tr("reasonActive")}
            value={isActive}
            onChange={setIsActive}
            testID="coin-reason-active"
          />
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={tr("deleteReasonTitle")}
        text={tr("deleteReasonText", { name: reason?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!reason) return;
          remove.mutate(
            { id: reason.id, input: null },
            {
              onSuccess: () => {
                setDeleting(false);
                onClose();
              },
            },
          );
        }}
        testID="coin-reason-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  rules: { flexDirection: "row", flexWrap: "wrap", rowGap: space[3] },
  full: { width: "100%" },
  half: { width: "50%", paddingRight: space[6] },
  ruleRow: { flexDirection: "row", alignItems: "flex-start", gap: space[4] },
  amount: { flex: 1 },
  // Level with the field, under its label, also when the field has words under it.
  active: { paddingTop: 28 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  list: { marginHorizontal: -space[4] },
  form: { gap: space[4] },
  footer: { gap: space[2] },
});
