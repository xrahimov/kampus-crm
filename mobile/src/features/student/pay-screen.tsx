import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { paymentStatus, startPayment } from "@/api/portal-own";
import type { PayOptions, PayProvider, PaymentStatus } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { WordChip } from "./answer-parts";

const PROVIDER_NAME: Record<PayProvider, string> = { PAYME: "Payme", CLICK: "Click" };
/** The smallest sum the server takes. */
const MIN_AMOUNT = 1000;
export const PAY_POLL_MS = 3000;
/** Two minutes of asking; after that the page says the payment is still being confirmed. */
const POLL_LIMIT = 40;

/** The provider's own page, where the card is entered: a sheet over the app, a new tab on the web. */
async function openCheckout(url: string): Promise<void> {
  if (Platform.OS === "web") await Linking.openURL(url);
  else await WebBrowser.openBrowserAsync(url, { enableBarCollapsing: true });
}

/**
 * "Pay online" on the student's side, in the app (A-216, the site's A-106):
 * an amount and the month it is for, then one button per provider the centre
 * switched on. The card is entered on Payme's or Click's own page, which
 * opens over the app; the app then asks the server until the payment has
 * landed and shows the outcome.
 */
export function PayScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const portal = usePortal(token);
  const header = (
    <Header back title={t("portal.pay.title")} subtitle={portal.data?.portal.group.name} />
  );
  if (!portal.data) return <PendingScreen header={header} query={portal} />;
  return (
    <Screen header={header} contentStyle={styles.block}>
      {portal.data.pay.providers.length === 0 ? (
        <EmptyState title={t("mobile.pay.none")} />
      ) : (
        <PayForm token={token} options={portal.data.pay} onPaid={() => void portal.refetch()} />
      )}
    </Screen>
  );
}

function PayForm({
  token,
  options,
  onPaid,
}: {
  token: string;
  options: PayOptions;
  onPaid: () => void;
}) {
  const t = useTranslations();
  const money = useMoney();
  const formatDate = useDate();
  const client = useQueryClient();
  const [amount, setAmount] = useState(
    options.suggestedAmount ? String(options.suggestedAmount) : "",
  );
  const [month, setMonth] = useState(options.suggestedMonth);
  const [busy, setBusy] = useState<PayProvider | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The payment being watched, and what the server last said about it. */
  const [order, setOrder] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PaymentStatus | "checking" | null>(null);

  // After the provider's page opened: ask until the payment is confirmed or given up.
  useEffect(() => {
    if (!order) return;
    let tries = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      tries += 1;
      const status = await paymentStatus(token, order).catch(() => null);
      if (stopped) return;
      if (status && status.status !== "PENDING") {
        setOutcome(status);
        setOrder(null);
        if (status.status === "PAID") {
          onPaid();
          void client.invalidateQueries({ queryKey: ["student", "home"] });
        }
        return;
      }
      if (tries >= POLL_LIMIT) {
        setOutcome(status ?? null);
        setOrder(null);
        return;
      }
      timer = setTimeout(() => void check(), PAY_POLL_MS);
    };
    timer = setTimeout(() => void check(), PAY_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // `onPaid` and the cache are the same for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, token]);

  const sum = Number(amount.replace(/\s/g, ""));
  const valid = Number.isFinite(sum) && sum >= MIN_AMOUNT;
  const pay = (provider: PayProvider) => {
    setBusy(provider);
    setProblem(null);
    setOutcome(null);
    startPayment(token, { provider, amount: sum, effectiveMonth: month })
      .then(async ({ id, url }) => {
        setOutcome("checking");
        setOrder(id);
        await openCheckout(url).catch(() => undefined);
      })
      .catch((error: unknown) => {
        const text = errorText(t, error);
        setProblem(text === t("errors.internal") ? t("portal.pay.failed") : text);
      })
      .finally(() => setBusy(null));
  };

  return (
    <>
      {outcome === "checking" ? (
        <Notice testID="pay-outcome">{t("portal.pay.checking")}</Notice>
      ) : outcome?.status === "PAID" ? (
        <Notice tone="success" testID="pay-outcome">
          {t("portal.pay.paid", { amount: money(outcome.amount) })}
        </Notice>
      ) : outcome?.status === "CANCELLED" ? (
        <Notice tone="destructive" testID="pay-outcome">
          {t("portal.pay.cancelled")}
        </Notice>
      ) : outcome?.status === "PENDING" ? (
        <Notice testID="pay-outcome">{t("mobile.pay.pending")}</Notice>
      ) : null}
      <Card testID="pay">
        <Text tone="mutedForeground">{t("portal.pay.intro")}</Text>
        <Field
          label={t("portal.pay.amount")}
          value={amount}
          onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ""))}
          keyboardType="number-pad"
          inputMode="numeric"
          hint={valid ? money(sum) : undefined}
          testID="pay-amount"
        />
        <View style={styles.part}>
          <Text variant="smallStrong">{t("portal.pay.month")}</Text>
          <View style={styles.chips}>
            {options.months.map((m) => (
              <WordChip
                key={m}
                label={formatDate(dayAsDate(m), { month: "short", year: "numeric" })}
                chosen={m === month}
                onPress={() => setMonth(m)}
                testID={`pay-month-${m}`}
              />
            ))}
          </View>
        </View>
        {problem ? (
          <Text variant="small" tone="destructive" accessibilityRole="alert" testID="pay-problem">
            {problem}
          </Text>
        ) : null}
        <View style={styles.part}>
          {options.providers.map((provider) => (
            <Button
              key={provider}
              variant="saffron"
              label={
                busy === provider
                  ? t("portal.pay.redirecting", { provider: PROVIDER_NAME[provider] })
                  : t("portal.pay.payWith", { provider: PROVIDER_NAME[provider] })
              }
              loading={busy === provider}
              disabled={busy !== null || !valid}
              onPress={() => pay(provider)}
              testID={`pay-${provider.toLowerCase()}`}
            />
          ))}
        </View>
        <Text variant="small" tone="mutedForeground">
          {t("mobile.pay.where")}
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[4] },
  part: { gap: space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
