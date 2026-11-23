import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { CALL_RANGES, useCalls, useLeadOptions, type CallRange, type LeadCall } from "@/api/leads";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { CountTiles } from "@/features/office/count-tile";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { LeadRow } from "./lead-bits";
import { LeadFlow } from "./lead-flow";

/**
 * "Calls today" (A-232): the leads whose next contact is due, the person's own
 * first. The four numbers on top are what waits in each range. A press on a
 * lead opens its card: the numbers to dial on top, **Log a contact** under
 * them, and everything else that is done with a lead.
 */
export function CallsScreen() {
  const t = useTranslations();
  const tc = useTranslations("leads.calls");
  const me = useMe();
  const date = useDate();
  const [range, setRange] = useState<CallRange>("DUE");
  const [ownerId, setOwnerId] = useState<string | null>("me");
  const [typed, setTyped] = useState("");
  const q = useRested(typed);
  const [picked, setPicked] = useState<LeadCall | null>(null);
  // "unassigned" here is the server's "none": the list's own "all owners" row goes by that name.
  const query = useCalls({ range, ownerId: ownerId === "unassigned" ? "none" : ownerId, q });
  const options = useLeadOptions();

  const header = <Header title={tc("title")} back />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const pages = query.data.pages;
  const rows = pages.flatMap((page) => page.items);
  const summary = pages[0]?.summary;
  const today = pages[0]?.today ?? "";
  const total = pages[0]?.total ?? 0;
  const owners = options.data?.owners ?? [];

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      contentStyle={styles.column}
    >
      {summary ? (
        <CountTiles
          testID="calls"
          tiles={[
            { key: "overdue", label: tc("summary.overdue"), value: summary.overdue, alert: true },
            { key: "today", label: tc("summary.today"), value: summary.today },
            { key: "upcoming", label: tc("summary.upcoming"), value: summary.upcoming },
            { key: "none", label: tc("summary.none"), value: summary.none },
          ]}
        />
      ) : null}
      <View style={styles.filters}>
        <View style={styles.fill}>
          <Select
            compact
            label={tc("filters.range")}
            value={range}
            onChange={(value) => setRange(value ?? "DUE")}
            options={CALL_RANGES.map((r) => ({ value: r, label: tc(`filters.${r}`) }))}
            testID="calls-range"
          />
        </View>
        <View style={styles.fill}>
          <Select
            compact
            label={tc("filters.owner")}
            value={ownerId}
            onChange={setOwnerId}
            placeholder={tc("filters.allOwners")}
            clearLabel={tc("filters.allOwners")}
            options={[
              { value: "me", label: tc("filters.me") },
              { value: "unassigned", label: tc("filters.unassigned") },
              ...owners
                .filter((o) => o.id !== me.user.id)
                .map((o) => ({ value: o.id, label: o.fullName })),
            ]}
            testID="calls-owner"
          />
        </View>
      </View>
      <Field
        label={tc("filters.search")}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="calls-search"
      />
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      <Text variant="small" tone="mutedForeground" testID="calls-count">
        {tc("count", { count: total })}
      </Text>
      {rows.length === 0 ? (
        <EmptyState title={tc("empty")} text={tc("emptyHint")} />
      ) : (
        <Card style={styles.flush} testID="calls-list">
          {rows.map((lead, index) => (
            <View key={lead.id}>
              {index > 0 ? <Divider /> : null}
              <LeadRow
                lead={lead}
                today={today}
                note={[
                  `${lead.boardName} · ${lead.columnName}`,
                  lead.lastContactAt
                    ? `${tc("columns.last")}: ${date(new Date(lead.lastContactAt), {
                        dateStyle: "medium",
                      })}`
                    : tc("noContact"),
                ].join(" · ")}
                onPress={() => setPicked(lead)}
              />
            </View>
          ))}
        </Card>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={t("mobile.studentsPage.more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          style={styles.start}
          testID="calls-more"
        />
      ) : null}
      <LeadFlow lead={picked} onClose={() => setPicked(null)} today={today} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4] },
  fill: { flex: 1 },
  filters: { flexDirection: "row", gap: space[2] },
  flush: { padding: 0, overflow: "hidden" },
  start: { alignSelf: "flex-start" },
});
