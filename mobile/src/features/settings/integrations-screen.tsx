import { Play } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  providerPath,
  useIntegrations,
  useRunQueue,
  type Integration,
  type IntegrationProvider,
} from "@/api/office-integrations";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useTranslations } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

import { INTEGRATIONS_PAGE } from "./integration-fields";
import { IntegrationForm } from "./integration-form";
import { RowPress } from "./parts";

/**
 * Integrations (A-249): the site's Settings → Integrations. The site stacks
 * nine forms on one long page; here the services are a list that says which
 * are on, and a press opens one service's form. Under them, the button that
 * runs the waiting SMS and bot messages on a server without its worker.
 */
export function IntegrationsScreen() {
  const t = useTranslations();
  const query = useIntegrations();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<IntegrationProvider>("SMS");
  // Counts the openings: a service opened again starts from what the server holds, not from
  // what was typed, while a save (which brings the list anew) leaves the open form alone.
  const [opening, setOpening] = useState(0);
  const header = <Header back title={t("settings.nav.integrations")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const services = INTEGRATIONS_PAGE.flatMap((provider) => {
    const one = query.data.find((item) => item.provider === provider);
    return one ? [one] : [];
  });
  const current = services.find((one) => one.provider === shown);
  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Card style={styles.flush} testID="integrations-list">
        {services.map((one, index) => (
          <View key={one.provider}>
            {index > 0 ? <Divider /> : null}
            <RowPress
              onPress={() => {
                setShown(one.provider);
                setOpening((count) => count + 1);
                setOpen(true);
              }}
              testID={`integration-row-${providerPath(one.provider)}`}
            >
              <View style={styles.fill}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {t(`integrations.${one.provider}.title`)}
                </Text>
                <Text variant="small" tone="mutedForeground" numberOfLines={2}>
                  {t(`integrations.${one.provider}.description`)}
                </Text>
              </View>
              <Badge
                tone={one.isEnabled ? "success" : "neutral"}
                label={t(one.isEnabled ? "integrations.enabled" : "common.inactive")}
                testID={`integration-state-${providerPath(one.provider)}`}
              />
            </RowPress>
          </View>
        ))}
      </Card>
      <QueueCard />
      <Sheet
        open={open && current !== undefined}
        onClose={() => setOpen(false)}
        title={t(`integrations.${shown}.title`)}
        testID="integration-form"
      >
        {current ? <ServiceForm key={opening} integration={current} /> : null}
      </Sheet>
    </Screen>
  );
}

/** One service's form with what only that service has: Telegram's notes on sign-in and the shared bot. */
function ServiceForm({ integration }: { integration: Integration }) {
  const t = useTranslations("integrations.TELEGRAM");
  if (integration.provider !== "TELEGRAM") return <IntegrationForm integration={integration} />;
  // The server's owner may offer their bot to every centre (A-135); nobody else sees the tick.
  const mayShare = integration.state.mayShare === true;
  const sharedBot = integration.state.sharedBot as { username: string | null } | null | undefined;
  return (
    <IntegrationForm integration={integration} hidden={mayShare ? [] : ["sharedWithAllCentres"]}>
      <Text variant="small" tone="mutedForeground" testID="telegram-login-hint">
        {t("loginHint", { url: "/api/v1/student-auth/telegram/callback" })}
      </Text>
      {mayShare ? (
        <Text variant="small" tone="mutedForeground">
          {t("sharedHint")}
        </Text>
      ) : null}
      {sharedBot ? (
        <Notice testID="telegram-shared-bot">
          {sharedBot.username
            ? t("sharedNote", { username: sharedBot.username })
            : t("sharedNoteNoUsername")}
        </Notice>
      ) : null}
    </IntegrationForm>
  );
}

function QueueCard() {
  const t = useTranslations();
  const { colors } = useTheme();
  const run = useRunQueue();
  return (
    <Card testID="queue">
      <Text variant="heading">{t("integrations.queue.title")}</Text>
      <Text variant="small" tone="mutedForeground">
        {t("integrations.queue.description")}
      </Text>
      {run.data ? (
        <Notice tone="success" testID="queue-result">
          {t("integrations.queue.result", { ...run.data })}
        </Notice>
      ) : null}
      {run.error ? (
        <Notice tone="destructive" testID="queue-problem">
          {errorText(t, run.error)}
        </Notice>
      ) : null}
      <Button
        variant="outline"
        icon={<Play size={16} color={colors.foreground} />}
        label={t("integrations.queue.run")}
        loading={run.isPending}
        onPress={() => run.mutate()}
        style={styles.start}
        testID="run-queue"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  start: { alignSelf: "flex-start" },
});
