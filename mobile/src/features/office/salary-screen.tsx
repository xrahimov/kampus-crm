import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useMySalary } from "@/api/office";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, Divider, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { addMonths, dayAsDate } from "@/lib/days";
import { useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space, useTheme } from "@/lib/theme";

import { useOpenPath } from "./site-paths";

/**
 * "My salary" (A-127 on the site, A-230 here): what the person has earned in a
 * month, group by group, with bonuses, fines and advances, and the earlier
 * months the accountant computed. Only the person's own pay.
 */
export function SalaryScreen() {
  const t = useTranslations("salary");
  const tp = useTranslations("finance.payroll");
  const money = useMoney();
  const date = useDate();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const { open } = useOpenPath();
  // null is the running month, which the server names.
  const [asked, setAsked] = useState<string | null>(null);
  const query = useMySalary(asked);
  const [current, setCurrent] = useState<string | null>(null);

  const header = <Header title={t("title")} back />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const data = query.data;
  // The first answer is the running month: later months do not exist yet.
  if (current === null && asked === null) setCurrent(data.month);
  const isCurrent = current === null || data.month >= current;
  const monthLabel = (month: string) =>
    date(dayAsDate(`${month}-01`), { month: "short", year: "numeric" });
  const day = (iso: string) =>
    date(dayAsDate(iso.slice(0, 10)), { day: "numeric", month: "short" });
  const { line, official } = data;
  const groupsTotal = line.percent + line.perLesson + line.perStudent;
  const adjustments = line.bonus - line.penalty - line.advance;
  const signed = (value: number) => (value < 0 ? `−${money(-value)}` : `+${money(value)}`);
  const cards = [
    { key: "net", value: money(line.net) },
    { key: "groups", value: money(groupsTotal) },
    { key: "fixed", value: money(line.fixed) },
    { key: "adjustments", value: signed(adjustments) },
  ] as const;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      <Text variant="body" tone="mutedForeground">
        {t("description")}
      </Text>
      <View style={styles.monthRow}>
        <View style={[styles.stepper, { borderColor: colors.input, backgroundColor: colors.card }]}>
          <Pressable
            onPress={() => setAsked(addMonths(data.month, -1))}
            accessibilityRole="button"
            accessibilityLabel={t("prevMonth")}
            hitSlop={8}
            style={styles.stepperButton}
            testID="salary-prev"
          >
            <ChevronLeft size={18} color={colors.foreground} />
          </Pressable>
          <Text variant="smallStrong" style={styles.month} testID="salary-month">
            {monthLabel(data.month)}
          </Text>
          <Pressable
            onPress={() => setAsked(addMonths(data.month, 1))}
            disabled={isCurrent}
            accessibilityRole="button"
            accessibilityLabel={t("nextMonth")}
            hitSlop={8}
            style={[styles.stepperButton, isCurrent ? styles.off : null]}
            testID="salary-next"
          >
            <ChevronRight size={18} color={colors.foreground} />
          </Pressable>
        </View>
        {!isCurrent ? (
          <Button
            compact
            variant="outline"
            label={t("thisMonth")}
            onPress={() => setAsked(null)}
            testID="salary-this-month"
          />
        ) : null}
      </View>

      {!data.paid ? (
        <EmptyState title={t("notPaid")} text={t("notPaidHint")} />
      ) : (
        <>
          <Card testID="salary-status">
            {official ? (
              official.status === "APPROVED" ? (
                <>
                  <Badge tone="success" label={t("history.APPROVED")} />
                  <Text variant="body">
                    {t("status.approved", {
                      amount: money(official.net),
                      date: official.approvedAt
                        ? date(new Date(official.approvedAt), { dateStyle: "medium" })
                        : "",
                      name: official.approvedBy ?? "",
                    })}
                  </Text>
                </>
              ) : (
                <>
                  <Badge label={t("history.MODERATION")} />
                  <Text variant="body">{t("status.moderation")}</Text>
                </>
              )
            ) : (
              <Text variant="body" tone="mutedForeground">
                {t("status.open")}
              </Text>
            )}
          </Card>

          <View style={styles.grid}>
            {cards.map((card) => (
              <View key={card.key} style={{ width: wide ? "25%" : "50%", padding: space[2] / 2 }}>
                <Card style={styles.tile} testID={`salary-${card.key}`}>
                  <Text variant="small" tone="mutedForeground" numberOfLines={2}>
                    {t(`cards.${card.key}`)}
                  </Text>
                  <Text
                    variant="title"
                    style={styles.number}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {card.value}
                  </Text>
                </Card>
              </View>
            ))}
          </View>

          <Text variant="body" testID="salary-rule">
            <Text variant="body" tone="mutedForeground">
              {t("rule")}:{" "}
            </Text>
            {data.method
              ? t(`methods.${data.method}`, {
                  value: data.method === "PERCENT" ? (data.rate ?? 0) : money(data.rate ?? 0),
                })
              : t("noRule")}
          </Text>

          <View style={styles.section}>
            <Text variant="heading" accessibilityRole="header">
              {t("groups.title")}
            </Text>
            <Text variant="small" tone="mutedForeground">
              {tp("rulesNote")}
            </Text>
            {line.details.length === 0 ? (
              <Text variant="small" tone="mutedForeground">
                {t("groups.empty")}
              </Text>
            ) : (
              <Card style={styles.flush}>
                {line.details.map((d, index) => (
                  <View key={d.groupId}>
                    {index > 0 ? <Divider /> : null}
                    <Pressable
                      onPress={() => open(`/groups/${d.groupId}`)}
                      accessibilityRole="button"
                      style={styles.row}
                      testID={`salary-group-${d.groupId}`}
                    >
                      <View style={styles.fill}>
                        <Text variant="bodyStrong">{d.groupName}</Text>
                        <Text variant="small" tone="mutedForeground">
                          {tp(`shareTypes.${d.shareType}`, {
                            value: d.shareValue,
                            students: d.students,
                            lessons: d.lessons,
                            price: money(d.coursePrice),
                          })}
                        </Text>
                      </View>
                      <Text variant="figure" style={styles.number}>
                        {money(d.amount)}
                      </Text>
                    </Pressable>
                  </View>
                ))}
                <Divider />
                <View style={styles.row}>
                  <Text variant="bodyStrong" style={styles.fill}>
                    {tp("total")}
                  </Text>
                  <Text variant="figure" style={styles.number} testID="salary-groups-total">
                    {money(groupsTotal)}
                  </Text>
                </View>
              </Card>
            )}
          </View>

          <View style={styles.section}>
            <Text variant="heading" accessibilityRole="header">
              {t("entries.title")}
            </Text>
            {data.entries.length === 0 ? (
              <Text variant="small" tone="mutedForeground">
                {t("entries.empty")}
              </Text>
            ) : (
              <Card style={styles.flush}>
                {data.entries.map((e, index) => (
                  <View key={e.id}>
                    {index > 0 ? <Divider /> : null}
                    <View style={styles.row} testID={`salary-entry-${e.id}`}>
                      <View style={styles.fill}>
                        <View style={styles.inline}>
                          <Badge
                            tone={e.type === "BONUS" ? "success" : "neutral"}
                            label={t(`entries.types.${e.type}`)}
                          />
                          <Text variant="small" tone="mutedForeground">
                            {day(e.date)}
                          </Text>
                        </View>
                        {e.comment ? (
                          <Text variant="small" tone="mutedForeground">
                            {e.comment}
                          </Text>
                        ) : null}
                      </View>
                      <Text variant="figure" style={styles.number}>
                        {signed(e.type === "BONUS" ? e.amount : -e.amount)}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </View>
        </>
      )}

      <View style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          {t("history.title")}
        </Text>
        {data.history.length === 0 ? (
          <Text variant="small" tone="mutedForeground">
            {t("history.empty")}
          </Text>
        ) : (
          <Card style={styles.flush}>
            {data.history.map((h, index) => (
              <View key={h.month}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => setAsked(h.month)}
                  accessibilityRole="button"
                  style={styles.row}
                  testID={`salary-history-${h.month}`}
                >
                  <View style={styles.fill}>
                    <Text variant="bodyStrong">{monthLabel(h.month)}</Text>
                    <Text variant="small" tone="mutedForeground">
                      {t(`history.${h.status}`)}
                    </Text>
                  </View>
                  <Text variant="figure" style={styles.number}>
                    {money(h.net)}
                  </Text>
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  off: { opacity: 0.35 },
  column: { gap: space[5] },
  section: { gap: space[2] },
  monthRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  stepperButton: { width: 40, height: 38, alignItems: "center", justifyContent: "center" },
  month: { minWidth: 132, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", margin: -space[2] / 2 },
  tile: { gap: space[1], padding: space[3], minHeight: 84, justifyContent: "space-between" },
  number: { fontVariant: ["tabular-nums"] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  inline: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
