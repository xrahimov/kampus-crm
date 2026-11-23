import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button } from "@/components/button";
import { EmptyState, Loading, Screen } from "@/components/surface";
import { errorText, useTranslations } from "@/lib/i18n";

/**
 * A screen whose data is not there: waiting for the first answer, or the
 * reason it did not come with **Try again**. A screen returns this while its
 * query has no data.
 */
export function PendingScreen({
  header,
  query,
}: {
  header: ReactNode;
  query: Pick<UseQueryResult<unknown>, "isLoading" | "error" | "refetch">;
}) {
  const t = useTranslations();
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  return (
    <Screen header={header}>
      <EmptyState
        title={errorText(t, query.error)}
        action={
          <Button
            variant="outline"
            label={t("mobile.retry")}
            onPress={() => void query.refetch()}
            testID="retry"
          />
        }
      />
    </Screen>
  );
}
