import { useLocalSearchParams } from "expo-router";

import { FINANCE_SECTIONS, useFinanceCategory, type FinanceSection } from "@/api/office-finance";
import { Header } from "@/components/header";
import { EmptyState, Screen } from "@/components/surface";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useTranslations } from "@/lib/i18n";

import { EntriesScreen } from "./entries-screen";

/** "/staff/finance/advance" and its four siblings: the entries that have no category. */
export function SectionEntriesScreen() {
  const t = useTranslations();
  const { section } = useLocalSearchParams<{ section?: string }>();
  if (!section || !(section in FINANCE_SECTIONS)) {
    return (
      <Screen header={<Header back title={t("finance.title")} />}>
        <EmptyState title={t("errors.notFound")} />
      </Screen>
    );
  }
  return <EntriesScreen type={FINANCE_SECTIONS[section as FinanceSection]} category={null} />;
}

/** "/staff/finance/costs/:id": the entries of one expense or income category. */
export function CategoryEntriesScreen() {
  const t = useTranslations();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const category = useFinanceCategory(id ?? null);
  if (!category.data) {
    return <PendingScreen header={<Header back title={t("finance.title")} />} query={category} />;
  }
  return <EntriesScreen type={category.data.kind} category={category.data} />;
}
