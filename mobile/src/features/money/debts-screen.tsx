import { useLocalSearchParams, useRouter } from "expo-router";
import { History, NotebookPen, Phone, Send, UserRound } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  DEBT_FILTERS,
  DEBT_SORTS,
  useDebtList,
  useDebtReminder,
  type DebtCase,
  type DebtChannel,
  type DebtFilter,
  type DebtSort,
} from "@/api/office-money";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { ActionRow } from "@/components/rows";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { DebtContactSheet, DebtHistorySheet, PhoneLine } from "./debt-sheets";

const SUMMARY = ["debtors", "amount", "promised", "needsCall"] as const;
const SORTS = Object.keys(DEBT_SORTS) as DebtSort[];

type Doing = "menu" | "contact" | "history";

/**
 * Who owes the centre money (A-236): the site's Debtors page. Four figures on
 * top, the site's filter and search, and a card per debtor with what they
 * owe, for how long, what they promised and who last spoke to them. A press
 * offers a call or another contact to write down, a Telegram reminder, the
 * history and the student's page.
 */
export function DebtsScreen() {
  const t = useTranslations();
  const td = useTranslations("debts");
  const me = useMe();
  const router = useRouter();
  const money = useMoney();
  const { wide } = useLayout();
  const { colors } = useTheme();
  // A notification arrives with what to show: "the debtors to call in this branch", one student.
  const arrived = useLocalSearchParams<{ status?: string; branchId?: string; q?: string }>();
  const arrivedStatus = DEBT_FILTERS.find((s) => s === arrived.status) ?? "ACTIVE";
  const [status, setStatus] = useState<DebtFilter>(arrivedStatus);
  const [branchId, setBranchId] = useState<string | null>(arrived.branchId ?? null);
  const [sort, setSort] = useState<DebtSort>("overdue");
  const [typed, setTyped] = useState(arrived.q ?? "");
  const arrival = `${arrived.status ?? ""}:${arrived.branchId ?? ""}:${arrived.q ?? ""}`;
  const [seen, setSeen] = useState(arrival);
  if (seen !== arrival) {
    setSeen(arrival);
    setStatus(arrivedStatus);
    setBranchId(arrived.branchId ?? null);
    setTyped(arrived.q ?? "");
  }
  const q = useRested(typed.trim());
  const query = useDebtList({ status, branchId, q, sort });
  const remind = useDebtReminder();
  const [debt, setDebt] = useState<DebtCase | null>(null);
  const [doing, setDoing] = useState<Doing | null>(null);
  const [channel, setChannel] = useState<DebtChannel>("CALL");
  const [reminded, setReminded] = useState<number | null>(null);

  const first = query.data?.pages[0];
  const debts = (query.data?.pages ?? []).flatMap((page) => page.items);
  // A branch chosen at the top of the app already narrows every list.
  const branchChoice = !me.activeBranch && me.branches.length > 1;
  const start = (next: DebtCase) => {
    setDebt(next);
    setDoing("menu");
  };
  const contact = (how: DebtChannel) => {
    setChannel(how);
    setDoing("contact");
  };
  const sendReminder = () => {
    if (!debt) return;
    setDoing(null);
    setReminded(null);
    remind.mutate(debt.id, { onSuccess: (sent) => setReminded(sent.queued) });
  };

  const header = (
    <Header
      back
      title={td("title")}
      subtitle={first ? td("count", { count: first.total }) : undefined}
    />
  );

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      {first ? (
        <View style={styles.grid} testID="debts-summary">
          {SUMMARY.map((key) => (
            <View key={key} style={wide ? styles.quarter : styles.half}>
              <View
                style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
                testID={`debts-summary-${key}`}
              >
                <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                  {td(`summary.${key}`)}
                </Text>
                <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit>
                  {key === "amount" ? money(first.summary.amount) : first.summary[key]}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <Field
        label={td("filters.search")}
        value={typed}
        onChangeText={setTyped}
        autoCorrect={false}
        testID="debts-search"
      />
      <View style={styles.grid}>
        <View style={wide && branchChoice ? styles.third : styles.half}>
          <Select
            compact
            label={td("filters.status")}
            value={status}
            onChange={(value) => setStatus(value ?? "ACTIVE")}
            options={DEBT_FILTERS.map((f) => ({ value: f, label: td(`filters.${f}`) }))}
            testID="debts-status"
          />
        </View>
        <View style={wide && branchChoice ? styles.third : styles.half}>
          <Select
            compact
            label={t("mobile.money.sortBy")}
            value={sort}
            onChange={(value) => setSort(value ?? "overdue")}
            options={SORTS.map((s) => ({ value: s, label: td(`columns.${s}`) }))}
            testID="debts-sort"
          />
        </View>
        {branchChoice ? (
          <View style={wide ? styles.third : styles.half}>
            <Select
              compact
              label={t("branch.select")}
              value={branchId}
              onChange={setBranchId}
              clearLabel={t("common.allBranches")}
              placeholder={t("common.allBranches")}
              options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
              testID="debts-branch"
            />
          </View>
        ) : null}
      </View>
      {remind.error ? (
        <Notice tone="destructive" testID="debts-remind-problem">
          {errorText(t, remind.error)}
        </Notice>
      ) : reminded !== null ? (
        <Notice tone={reminded > 0 ? "success" : "warning"} testID="debts-reminded">
          {reminded > 0 ? td("remind.sent", { count: reminded }) : td("remind.none")}
        </Notice>
      ) : null}
      {query.isLoading ? (
        <Loading />
      ) : !query.data ? (
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
      ) : debts.length === 0 ? (
        <EmptyState title={td("empty")} text={td("emptyHint")} />
      ) : (
        <>
          <View style={styles.cards} testID="debts-list">
            {debts.map((item) => (
              <View key={item.id} style={wide ? styles.cell : styles.full}>
                <DebtCard debt={item} onPress={() => start(item)} />
              </View>
            ))}
          </View>
          {query.hasNextPage ? (
            <Button
              variant="outline"
              label={t("mobile.studentsPage.more")}
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
              style={styles.start}
              testID="debts-more"
            />
          ) : null}
        </>
      )}

      <Sheet
        open={doing === "menu"}
        onClose={() => setDoing(null)}
        title={debt?.studentName ?? ""}
        testID="debt-menu"
      >
        <View>
          {debt && debt.status !== "CLOSED" ? (
            <>
              <ActionRow
                icon={Phone}
                label={td("actions.call")}
                onPress={() => contact("CALL")}
                testID="debt-do-call"
              />
              <Divider />
              <ActionRow
                icon={NotebookPen}
                label={td("actions.log")}
                onPress={() => contact("NOTE")}
                testID="debt-do-log"
              />
              <Divider />
              <ActionRow
                icon={Send}
                label={td("actions.remind")}
                onPress={sendReminder}
                testID="debt-do-remind"
              />
              <Divider />
            </>
          ) : null}
          <ActionRow
            icon={History}
            label={td("actions.history")}
            onPress={() => setDoing("history")}
            testID="debt-do-history"
          />
          {can(me, "students.view") ? (
            <>
              <Divider />
              <ActionRow
                icon={UserRound}
                label={td("actions.profile")}
                onPress={() => {
                  setDoing(null);
                  if (debt) {
                    router.push({
                      pathname: "/staff/student/[id]",
                      params: { id: debt.studentId },
                    });
                  }
                }}
                testID="debt-do-profile"
              />
            </>
          ) : null}
        </View>
      </Sheet>
      {debt ? (
        <DebtContactSheet
          key={debt.id}
          debt={debt}
          channel={channel}
          open={doing === "contact"}
          onClose={() => setDoing(null)}
        />
      ) : null}
      <DebtHistorySheet debt={doing === "history" ? debt : null} onClose={() => setDoing(null)} />
    </Screen>
  );
}

function DebtCard({ debt, onPress }: { debt: DebtCase; onPress: () => void }) {
  const td = useTranslations("debts");
  const date = useDate();
  const money = useMoney();
  const day = (iso: string) => date(dayAsDate(iso.slice(0, 10)), { dateStyle: "medium" });
  const groups = debt.groups
    .filter((g) => g.balance < 0)
    .map((g) => g.groupName)
    .join(", ");
  const closed = debt.status === "CLOSED";
  return (
    <Card onPress={onPress} style={styles.card} testID={`debt-${debt.id}`}>
      <View style={styles.head}>
        <Text variant="heading" numberOfLines={2} style={styles.fill}>
          {debt.studentName}
        </Text>
        <Badge
          tone={closed ? "neutral" : "destructive"}
          label={money(debt.amount)}
          testID={`debt-${debt.id}-amount`}
        />
      </View>
      {debt.status !== "OPEN" || debt.needsCall ? (
        <View style={styles.badges}>
          {debt.status === "PROMISED" ? (
            <Badge tone="accent" label={td("status.PROMISED")} />
          ) : null}
          {closed ? (
            <Badge
              label={debt.closedReason ? td(`closed.${debt.closedReason}`) : td("status.CLOSED")}
            />
          ) : null}
          {debt.needsCall ? (
            <Badge tone="warning" label={td("needsCall")} testID={`debt-${debt.id}-call`} />
          ) : null}
        </View>
      ) : null}
      {debt.phone ? <PhoneLine phone={debt.phone} testID={`debt-${debt.id}-phone`} /> : null}
      {groups ? (
        <Text variant="small" tone="mutedForeground" numberOfLines={2}>
          {groups}
        </Text>
      ) : null}
      <Text testID={`debt-${debt.id}-overdue`}>
        <Text variant="figure">{td("days", { count: debt.daysOverdue })}</Text>
        {`, ${td("since", { date: day(debt.openedAt) })}`}
      </Text>
      {debt.promisedAt ? (
        <Text
          tone={debt.promiseMissed ? "destructive" : "foreground"}
          testID={`debt-${debt.id}-promise`}
        >
          {[
            `${td("columns.promise")}: ${day(debt.promisedAt)}`,
            debt.promiseMissed ? td("missed") : null,
            debt.promisedAmount !== null ? money(debt.promisedAmount) : null,
          ]
            .filter(Boolean)
            .join(", ")}
        </Text>
      ) : null}
      {debt.brokenPromises > 0 ? (
        <Text variant="small" tone="destructive">
          {td("brokenPromises", { count: debt.brokenPromises })}
        </Text>
      ) : null}
      <Text variant="small" tone="mutedForeground" testID={`debt-${debt.id}-contact`}>
        {debt.lastContactAt
          ? [
              `${td("columns.lastContact")}: ${day(debt.lastContactAt)}`,
              debt.lastChannel ? td(`channels.${debt.lastChannel}`) : null,
              debt.lastOutcome ? td(`outcomes.${debt.lastOutcome}`) : null,
              debt.lastContactBy ? td("by", { name: debt.lastContactBy }) : null,
            ]
              .filter(Boolean)
              .join(", ")
          : td("noContact")}
      </Text>
      {debt.telegramAt || debt.smsAt ? (
        <View style={styles.badges}>
          {debt.telegramAt ? <Badge label={td("sentTelegram")} /> : null}
          {debt.smsAt ? <Badge label={td("sentSms")} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[1], rowGap: space[2] },
  half: { width: "50%", paddingHorizontal: space[1] },
  third: { width: "33.333%", paddingHorizontal: space[1] },
  quarter: { width: "25%", paddingHorizontal: space[1] },
  tile: { gap: space[1], padding: space[3], borderWidth: 1, borderRadius: 16 },
  cards: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flex: 1, gap: space[1] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  start: { alignSelf: "flex-start" },
});
