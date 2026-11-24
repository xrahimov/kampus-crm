import { Plug } from "lucide-react-native";
import { StyleSheet } from "react-native";

import { useLeadOptions } from "@/api/leads";
import { useAmoCrmTest, useIntegration, type Integration } from "@/api/office-integrations";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Card, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { useTheme } from "@/lib/theme";

import { FORM_CARD, IntegrationForm } from "./integration-form";

/**
 * AmoCRM (A-249): the site's Settings → AmoCRM. The account's four values,
 * the webhook that brings amoCRM's leads here with the source and the board
 * column they land in, and "Test connection".
 */
export function AmoCrmScreen() {
  const t = useTranslations();
  const query = useIntegration("AMOCRM");
  const header = <Header back title={t("settings.nav.amocrm")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Card style={FORM_CARD}>
        <AmoCrmForm integration={query.data} />
      </Card>
    </Screen>
  );
}

function AmoCrmForm({ integration }: { integration: Integration }) {
  const t = useTranslations();
  const ta = useTranslations("integrations.AMOCRM");
  const me = useMe();
  const { colors } = useTheme();
  const test = useAmoCrmTest();
  // The columns come with the leads' lists; someone without leads keeps the column that is set.
  const mayList = can(me, "leads.view");
  const options = useLeadOptions(mayList);
  const branchName = (id: string) => me.branches.find((branch) => branch.id === id)?.name;
  const columns = (options.data?.boards ?? []).flatMap((board) =>
    board.columns.map((column) => ({
      value: column.id,
      label: [me.branches.length > 1 ? branchName(board.branchId) : null, board.name, column.name]
        .filter(Boolean)
        .join(" · "),
    })),
  );
  const set = String(integration.config.leadColumnId ?? "");
  // A column that is set but not in the list (the list did not come) still shows as set.
  const known = set === "" || columns.some((column) => column.value === set);
  const result = test.data;
  return (
    <IntegrationForm
      integration={integration}
      choices={{
        leadColumnId: {
          options: known ? columns : [...columns, { value: set, label: ta("fields.leadColumnId") }],
          none: ta("firstColumn"),
        },
      }}
    >
      {mayList && options.error ? (
        <Notice tone="warning" testID="amocrm-columns-problem">
          {errorText(t, options.error)}
        </Notice>
      ) : null}
      <Text variant="small" tone="mutedForeground" testID="amocrm-state">
        {integration.state.hasTokens ? ta("connected") : ta("notConnected")}
      </Text>
      {result ? (
        <Notice tone={result.ok ? "success" : "destructive"} testID="amocrm-test-result">
          {result.ok
            ? result.adapter === "fake"
              ? ta("testFake")
              : ta("testOk", { account: result.account ?? "" })
            : t.has(result.error ?? "")
              ? t(result.error ?? "")
              : t("errors.integration")}
        </Notice>
      ) : null}
      {test.error ? (
        <Notice tone="destructive" testID="amocrm-test-problem">
          {errorText(t, test.error)}
        </Notice>
      ) : null}
      <Button
        variant="outline"
        compact
        icon={<Plug size={16} color={colors.foreground} />}
        label={ta("test")}
        loading={test.isPending}
        onPress={() => test.mutate()}
        style={styles.start}
        testID="amocrm-test"
      />
    </IntegrationForm>
  );
}

const styles = StyleSheet.create({ start: { alignSelf: "flex-start" } });
