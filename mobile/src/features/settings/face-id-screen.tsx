import { useIntegration } from "@/api/office-integrations";
import { Header } from "@/components/header";
import { Card, Screen } from "@/components/surface";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useTranslations } from "@/lib/i18n";

import { FORM_CARD, IntegrationForm } from "./integration-form";

/**
 * FaceID (A-249): the site's Settings → FaceID. The webhook the terminals
 * post staff check-ins to, its secret, and after how many minutes a check-in
 * counts as late.
 */
export function FaceIdScreen() {
  const t = useTranslations();
  const query = useIntegration("FACE_ID");
  const header = <Header back title={t("settings.nav.faceId")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Card style={FORM_CARD}>
        <IntegrationForm integration={query.data} />
      </Card>
    </Screen>
  );
}
