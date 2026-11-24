import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ACTION_ENTITIES, useActionLog, useLogActors, type ActionRow } from "@/api/office-logs";
import { Header } from "@/components/header";
import { Badge, Card, Divider, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { Filters, OptionFilter } from "@/features/reports/parts";
import { useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { DayFilters, LogBody, SearchField, useLogDays, useLogSearch } from "./log-parts";

/** How many changed fields a row writes out, as on the site. */
const DETAILS = 4;

/**
 * What changed, from the row's before and after, as short "field: old → new"
 * lines: only plain values, and at most four of them.
 */
export function changesOf(before: unknown, after: unknown): string[] {
  const was = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const is = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(was), ...Object.keys(is)])];
  const plain = (value: unknown) => value === null || typeof value !== "object";
  return keys
    .filter((key) => JSON.stringify(was[key] ?? null) !== JSON.stringify(is[key] ?? null))
    .filter((key) => plain(was[key]) && plain(is[key]))
    .slice(0, DETAILS)
    .map((key) => {
      const old = before && key in was ? `${String(was[key])} → ` : "";
      return `${key}: ${old}${String(is[key] ?? "—")}`;
    });
}

/**
 * Action log (A-246): the site's Settings → Action log. Every change the
 * staff made, newest first: what was done, to what, in which branch, about
 * which student, what changed, and who did it when. Narrowed by a search, the
 * type of thing, the staff member and days.
 */
export function ActionLogScreen() {
  const t = useTranslations();
  const tl = useTranslations("logs.actions");
  const date = useDate();
  const search = useLogSearch();
  const days = useLogDays();
  const [entity, setEntity] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const actors = useLogActors();
  const query = useActionLog({ ...days.days, entity, actorId, q: search.q });
  const name = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);
  return (
    <Screen
      header={<Header back title={tl("title")} />}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      <Text variant="small" tone="mutedForeground">
        {tl("description")}
      </Text>
      <SearchField state={search} testID="actions-search" />
      <Filters testID="actions-filters">
        <OptionFilter
          label={tl("entity")}
          value={entity}
          onChange={setEntity}
          options={ACTION_ENTITIES.map((value) => ({
            value,
            label: tl(`entities.${value}`),
          }))}
          allLabel={tl("all")}
          testID="actions-entity"
        />
        {/* A server from before A-246 has no list of staff to choose from. */}
        {actors.data && actors.data.length > 0 ? (
          <OptionFilter
            label={tl("staff")}
            value={actorId}
            onChange={setActorId}
            options={actors.data.map((one) => ({ value: one.id, label: one.fullName }))}
            allLabel={tl("all")}
            testID="actions-actor"
          />
        ) : null}
      </Filters>
      <DayFilters state={days} testID="actions" />
      <LogBody<ActionRow> query={query} empty={tl("empty")} testID="actions">
        {(rows) => (
          <Card style={styles.flush}>
            {rows.map((row, index) => {
              const changes = changesOf(row.before, row.after);
              return (
                <View key={row.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.row} testID={`action-${row.id}`}>
                    <View style={styles.title}>
                      <Text variant="bodyStrong" style={styles.shrink}>
                        {name(`logs.actions.names.${row.action}`, row.action)}
                      </Text>
                      <Badge label={name(`logs.actions.entities.${row.entity}`, row.entity)} />
                    </View>
                    {row.subjectName ? <Text>{row.subjectName}</Text> : null}
                    {changes.length > 0 ? (
                      <View testID={`action-changes-${row.id}`}>
                        {changes.map((line) => (
                          <Text key={line} variant="small" tone="mutedForeground">
                            {line}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    <Text variant="small" tone="mutedForeground" style={styles.number}>
                      {[
                        row.actorName ?? tl("system"),
                        row.actorPhone,
                        row.branchName,
                        date(new Date(row.createdAt), { dateStyle: "medium", timeStyle: "short" }),
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </LogBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: { gap: 2, paddingHorizontal: space[4], paddingVertical: space[3] },
  title: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space[2] },
  shrink: { flexShrink: 1 },
  number: { fontVariant: ["tabular-nums"] },
});
