import { StyleSheet, View } from "react-native";

import { useStudentPayments } from "@/api/office-students";
import { Card, Divider, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/**
 * A student's payments on their page (A-231), newest first: the sum, how and
 * when it was paid, the group and the month it was for, who took it. A refund
 * taken from a payment is written under its sum.
 */
export function StudentPayments({ id }: { id: string }) {
  const t = useTranslations();
  const th = useTranslations("payments.history");
  const money = useMoney();
  const date = useDate();
  const query = useStudentPayments(id);
  if (query.error) return <Notice tone="destructive">{errorText(t, query.error)}</Notice>;
  if (!query.data) return <Loading />;
  const rows = query.data.items;
  if (rows.length === 0) {
    return (
      <Text tone="mutedForeground" testID="student-payments-empty">
        {th("empty")}
      </Text>
    );
  }
  const total = rows.reduce((sum, p) => sum + p.amount - p.refunded, 0);
  return (
    <View style={styles.block} testID="student-payments">
      <Card style={styles.flush}>
        {rows.map((p, index) => (
          <View key={p.id}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.row} testID={`payment-${p.id}`}>
              <View style={styles.fill}>
                <Text variant="bodyStrong">
                  {date(dayAsDate(p.paidAt.slice(0, 10)), { dateStyle: "medium" })}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {[
                    p.groupName,
                    `${th("month")}: ${date(dayAsDate(p.effectiveMonth.slice(0, 10)), {
                      month: "short",
                      year: "numeric",
                    })}`,
                  ].join(", ")}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {[p.methodName, p.receivedByName].filter(Boolean).join(", ")}
                </Text>
                {p.comment ? (
                  <Text variant="small" tone="mutedForeground">
                    {p.comment}
                  </Text>
                ) : null}
              </View>
              <View style={styles.end}>
                <Text variant="figure" style={styles.number}>
                  {money(p.amount)}
                </Text>
                {p.refunded > 0 ? (
                  <Text variant="small" tone="destructive">
                    {th("refunded")}: {money(p.refunded)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ))}
      </Card>
      <Text variant="smallStrong" style={styles.total} testID="student-payments-total">
        {th("total", { amount: money(total) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { alignItems: "flex-end" },
  block: { gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  number: { fontVariant: ["tabular-nums"] },
  total: { textAlign: "right" },
});
