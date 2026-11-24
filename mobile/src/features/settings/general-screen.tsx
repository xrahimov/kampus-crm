import { useState } from "react";

import { useOrgSettings } from "@/api/office-general-settings";
import { Header } from "@/components/header";
import { Screen } from "@/components/surface";
import { Tabs } from "@/features/reports/parts";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useTranslations } from "@/lib/i18n";

import { AutoSmsCard } from "./general-auto-sms";
import { BranchesCard, GradingSystemsCard, PaymentMethodsCard } from "./general-lists";
import { OrgForm } from "./general-org";

const TABS = ["center", "branches", "methods", "grading", "sms"] as const;
type Tab = (typeof TABS)[number];

/**
 * General settings (A-243): the site's Settings → General settings. The site
 * stacks the centre's form, branches, payment methods and grading systems on
 * one long page with the automatic SMS on a second tab; here each has its own
 * tab, so a phone shows one thing at a time.
 */
export function GeneralSettingsScreen() {
  const t = useTranslations();
  const query = useOrgSettings();
  const [tab, setTab] = useState<Tab>("center");
  const header = <Header back title={t("settings.nav.general")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const labels: Record<Tab, string> = {
    center: t("settings.general.tabs.center"),
    branches: t("settings.branches.title"),
    methods: t("settings.paymentMethods.title"),
    grading: t("settings.gradingSystems.title"),
    sms: t("settings.general.tabs.sms"),
  };
  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Tabs
        options={TABS.map((value) => ({ value, label: labels[value] }))}
        value={tab}
        onChange={setTab}
        testID="general-tabs"
      />
      {tab === "center" ? <OrgForm settings={query.data} /> : null}
      {tab === "branches" ? <BranchesCard /> : null}
      {tab === "methods" ? <PaymentMethodsCard /> : null}
      {tab === "grading" ? <GradingSystemsCard /> : null}
      {tab === "sms" ? <AutoSmsCard /> : null}
    </Screen>
  );
}
