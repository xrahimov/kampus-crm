import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Coins } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { giveCoins, staffGroupKeys, useCoinReasons, useGroupCoins } from "@/api/staff-group";
import type { CoinReason, GroupCoinRow } from "@/api/types";
import { Button } from "@/components/button";
import { ChoiceList } from "@/components/choice-list";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/**
 * A group's coins on the teacher's side, in the app (A-218): who has how
 * many, and giving coins to one student for one of the centre's reasons.
 */
export function GroupCoinsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const tc = useTranslations("coins.group");
  const client = useQueryClient();
  const me = useMe();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const group = useGroup(id);
  const query = useGroupCoins(id);
  const canGive = can(me, "coins.give") && group.data?.status !== "ARCHIVED";
  const reasons = useCoinReasons(canGive);
  const [giving, setGiving] = useState<GroupCoinRow | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const header = <Header back title={t("groups.detail.tabs.coins")} subtitle={group.data?.name} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data;

  // On a phone the button sits under the name, so the name keeps its room.
  const give = (row: GroupCoinRow) => (
    <Button
      compact
      variant="outline"
      label={tc("give")}
      icon={<Coins size={16} color={colors.foreground} />}
      onPress={() => {
        setDone(null);
        setGiving(row);
      }}
      style={wide ? undefined : styles.under}
      testID={`coins-give-${row.membershipId}`}
    />
  );

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      {done ? (
        <Notice tone="success" testID="coins-given">
          {done}
        </Notice>
      ) : null}
      {giving ? (
        <GiveForm
          groupId={id}
          row={giving}
          reasons={reasons.data ?? []}
          onCancel={() => setGiving(null)}
          onGiven={(amount) => {
            setDone(t("mobile.coins.given", { count: amount, name: giving.fullName }));
            setGiving(null);
            void client.invalidateQueries({ queryKey: staffGroupKeys.coins(id) });
          }}
        />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={tc("noMembers")} />
      ) : (
        <Card style={styles.flush}>
          {rows.map((row, index) => (
            <View key={row.membershipId}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row} testID={`coins-${row.membershipId}`}>
                <Text variant="figure" tone="mutedForeground" style={styles.rank}>
                  {row.rank}
                </Text>
                <View style={styles.fill}>
                  <View style={styles.line}>
                    <Text variant="bodyStrong" numberOfLines={1} style={styles.fill}>
                      {row.fullName}
                    </Text>
                    <Text variant="figure" testID="coins-balance">
                      {row.balance}
                    </Text>
                  </View>
                  <View style={styles.line}>
                    <Text variant="small" tone="mutedForeground" style={styles.fill}>
                      {tc("columns.groupCoins")}: {row.groupCoins}
                      {row.lastComment ? `, ${row.lastComment}` : ""}
                    </Text>
                    <Text variant="small" tone="mutedForeground">
                      {tc("columns.total")}
                    </Text>
                  </View>
                  {canGive && !wide ? give(row) : null}
                </View>
                {canGive && wide ? give(row) : null}
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function GiveForm({
  groupId,
  row,
  reasons,
  onCancel,
  onGiven,
}: {
  groupId: string;
  row: GroupCoinRow;
  reasons: CoinReason[];
  onCancel: () => void;
  onGiven: (amount: number) => void;
}) {
  const t = useTranslations();
  const tg = useTranslations("coins.give");
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reason = reasons.find((r) => r.id === reasonId) ?? null;
  const count = Number(amount);
  const valid = reason !== null && Number.isInteger(count) && count >= 1;

  const give = () => {
    if (!reason || !valid || busy) return;
    setBusy(true);
    setProblem(null);
    giveCoins({
      studentId: row.studentId,
      groupId,
      reasonId: reason.id,
      amount: count,
      comment: comment.trim() || null,
    })
      .then(() => onGiven(count))
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  return (
    <Card testID="coins-form">
      <View>
        <Text variant="heading">{tg("title")}</Text>
        <Text tone="mutedForeground">{row.fullName}</Text>
      </View>
      {reasons.length === 0 ? (
        <Text tone="mutedForeground" testID="coins-no-reasons">
          {tg("noReasons")}
        </Text>
      ) : (
        <ChoiceList
          label={tg("reason")}
          options={reasons.map((r) => ({
            value: r.id,
            label: `${r.name}, ${tg("upTo", { max: r.maxCoins })}`,
          }))}
          value={reasonId}
          onChange={(next) => {
            setReasonId(next);
            // The usual gift is the most the reason allows.
            const max = reasons.find((r) => r.id === next)?.maxCoins;
            if (max && !amount) setAmount(String(max));
          }}
          testID="coins-reason"
        />
      )}
      <Field
        label={tg("amount")}
        value={amount}
        onChangeText={(next) => setAmount(next.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        maxLength={6}
        hint={reason ? tg("maxHint", { max: reason.maxCoins }) : undefined}
        testID="coins-amount"
      />
      <Field
        label={tg("comment")}
        value={comment}
        onChangeText={setComment}
        maxLength={300}
        testID="coins-comment"
      />
      {problem ? (
        <Notice tone="destructive" testID="coins-problem">
          {problem}
        </Notice>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={tg("title")}
          loading={busy}
          disabled={!valid}
          onPress={give}
          testID="coins-send"
        />
        <Button
          variant="ghost"
          label={t("common.cancel")}
          disabled={busy}
          onPress={onCancel}
          testID="coins-cancel"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4], maxWidth: 720 },
  flush: { padding: 0, gap: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  rank: { width: 24, textAlign: "center" },
  line: { flexDirection: "row", alignItems: "baseline", gap: space[3] },
  under: { alignSelf: "flex-start", marginTop: space[2] },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
});
