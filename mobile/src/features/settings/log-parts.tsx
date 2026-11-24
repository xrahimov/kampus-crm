import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { LogDays } from "@/api/office-logs";
import type { Page } from "@/api/types";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { EmptyState, Loading, Notice } from "@/components/surface";
import { errorText, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { space } from "@/lib/theme";

/**
 * From and To of a log (A-246). Both start empty: a log opens on its newest
 * rows, whenever they are from. A day half typed counts as empty.
 */
export function useLogDays() {
  const [days, setDays] = useState<LogDays>({ from: null, to: null });
  const set = (key: keyof LogDays, value: string | null) =>
    setDays((now) => ({ ...now, [key]: value }));
  /** Both are days and the last one is before the first: nothing can match. */
  const backwards = days.from !== null && days.to !== null && days.to < days.from;
  return { days, set, backwards };
}

/** The two date fields every log has, side by side. */
export function DayFilters({
  state,
  testID,
}: {
  state: ReturnType<typeof useLogDays>;
  testID: string;
}) {
  const t = useTranslations();
  return (
    <View style={styles.days}>
      <View style={styles.fill}>
        <DateField
          label={t("logs.from")}
          value={state.days.from}
          onChange={(value) => state.set("from", value)}
          testID={`${testID}-from`}
        />
      </View>
      <View style={styles.fill}>
        <DateField
          label={t("logs.to")}
          value={state.days.to}
          onChange={(value) => state.set("to", value)}
          error={state.backwards ? t("validation.endAfterStart") : null}
          testID={`${testID}-to`}
        />
      </View>
    </View>
  );
}

/** What is typed into a log's search, and the same words once the typing rests. */
export function useLogSearch() {
  const [typed, setTyped] = useState("");
  return { typed, setTyped, q: useRested(typed).trim() };
}

export function SearchField({
  state,
  label,
  testID,
}: {
  state: ReturnType<typeof useLogSearch>;
  label?: string;
  testID: string;
}) {
  const t = useTranslations();
  return (
    <Field
      label={label ?? t("reports.filters.search")}
      value={state.typed}
      onChangeText={state.setTyped}
      autoCorrect={false}
      autoCapitalize="none"
      testID={testID}
    />
  );
}

/** The rows a log has fetched so far, and how many the filters let through in all. */
export function rowsOf<T>(data: InfiniteData<Page<T>> | undefined): { rows: T[]; total: number } {
  const pages = data?.pages ?? [];
  return { rows: pages.flatMap((page) => page.items), total: pages[0]?.total ?? 0 };
}

/**
 * The body of a log: waiting, the reason nothing came with **Try again**, the
 * words for an empty log, or its rows with **Show more** under them while the
 * server has more.
 */
export function LogBody<T>({
  query,
  empty,
  children,
  testID,
}: {
  query: UseInfiniteQueryResult<InfiniteData<Page<T>>>;
  empty: string;
  children: (rows: T[]) => ReactNode;
  testID: string;
}) {
  const t = useTranslations();
  if (query.isLoading) return <Loading />;
  if (!query.data) {
    return (
      <EmptyState
        title={errorText(t, query.error)}
        action={
          <Button
            variant="outline"
            label={t("mobile.retry")}
            onPress={() => void query.refetch()}
            testID={`${testID}-retry`}
          />
        }
      />
    );
  }
  const { rows } = rowsOf(query.data);
  return (
    <>
      {query.isError ? <Notice tone="warning">{errorText(t, query.error)}</Notice> : null}
      {rows.length === 0 ? (
        <View testID={`${testID}-empty`}>
          <EmptyState title={empty} />
        </View>
      ) : (
        <View testID={`${testID}-list`}>{children(rows)}</View>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={t("mobile.studentsPage.more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          style={styles.start}
          testID={`${testID}-more`}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  days: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  start: { alignSelf: "flex-start" },
});
