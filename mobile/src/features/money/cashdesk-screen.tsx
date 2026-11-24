import { Wallet } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  useAcceptClose,
  useCashCloses,
  useCashDay,
  useCloseDay,
  type CashClose,
} from "@/api/office-money";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Fact } from "@/components/rows";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { typedMoney } from "@/features/office/payment-sheet";
import { useOpenPath } from "@/features/office/site-paths";
import { PendingScreen } from "@/features/shared/pending-screen";
import { centreToday, dayAsDate } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
/** The years on offer, as the site's: next year, this one and three back. */
const YEAR_STEPS = [1, 0, -1, -2, -3];

/** A sum with its sign: what is over is "+", what is short is "−" and red. */
function useSigned(): (value: number) => {
  text: string;
  tone: "destructive" | "success" | "foreground";
} {
  const money = useMoney();
  return (value) => ({
    text: value > 0 ? `+${money(value)}` : money(value),
    tone: value < 0 ? "destructive" : value > 0 ? "success" : "foreground",
  });
}

/**
 * The cash desk (A-236): the site's page of day closes. What each cashier
 * took on a day, the cash the drawer should hold, the cash counted and the
 * difference; "Close the day" for whoever takes payments, "Accept" for the
 * manager the money is handed to. The sheet to print opens on the site.
 */
export function CashDeskScreen() {
  const t = useTranslations();
  const tc = useTranslations("cashdesk");
  const me = useMe();
  const date = useDate();
  const money = useMoney();
  const signed = useSigned();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const site = useOpenPath();
  const today = centreToday();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState<number | null>(Number(today.slice(5, 7)));
  const [branchId, setBranchId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const query = useCashCloses({ branchId, year, month });
  const accept = useAcceptClose();
  const mayClose = can(me, "payments.create");
  const mayAccept = can(me, "finance.update");
  const seesAll = can(me, "finance.view");
  const branchChoice = !me.activeBranch && me.branches.length > 1;
  const monthName = (m: number) =>
    date(dayAsDate(`2026-${String(m).padStart(2, "0")}-01`), { month: "short" });
  const day = (iso: string) =>
    `${date(dayAsDate(iso), { weekday: "short" })}, ${date(dayAsDate(iso), { dateStyle: "medium" })}`;

  const header = (
    <Header
      back
      title={tc("title")}
      right={
        mayClose ? (
          <Button
            compact
            icon={<Wallet size={16} color={colors.primaryForeground} />}
            label={tc("closeDay")}
            onPress={() => setClosing(true)}
            testID="cash-close-day"
          />
        ) : undefined
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const { items, totals } = query.data;
  const difference = signed(totals.difference);

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {tc("subtitle")}
      </Text>
      <View style={styles.grid}>
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={tc("filters.year")}
            value={String(year)}
            onChange={(value) => setYear(value ? Number(value) : thisYear)}
            options={YEAR_STEPS.map((step) => {
              const y = String(thisYear + step);
              return { value: y, label: y };
            })}
            testID="cash-year"
          />
        </View>
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={tc("filters.month")}
            value={month === null ? "all" : String(month)}
            onChange={(value) => setMonth(!value || value === "all" ? null : Number(value))}
            options={[
              { value: "all", label: tc("filters.wholeYear") },
              ...MONTHS.map((m) => ({ value: String(m), label: monthName(m) })),
            ]}
            testID="cash-month"
          />
        </View>
        {branchChoice ? (
          <View style={wide ? styles.quarter : styles.half}>
            <Select
              compact
              label={tc("columns.branch")}
              value={branchId}
              onChange={setBranchId}
              clearLabel={t("common.allBranches")}
              placeholder={t("common.allBranches")}
              options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
              testID="cash-branch"
            />
          </View>
        ) : null}
      </View>
      {accept.error ? (
        <Notice tone="destructive" testID="cash-accept-problem">
          {errorText(t, accept.error)}
        </Notice>
      ) : null}
      {site.error ? <Notice tone="destructive">{site.error}</Notice> : null}
      {items.length === 0 ? (
        <EmptyState title={tc("empty")} text={mayClose ? tc("emptyHint") : undefined} />
      ) : (
        <>
          <Card testID="cash-totals">
            <Text variant="heading">{tc("totals")}</Text>
            <View style={wide ? styles.sums : styles.facts}>
              <Sum
                wide={wide}
                label={tc("columns.expectedCash")}
                value={money(totals.expectedCash)}
              />
              <Sum
                wide={wide}
                label={tc("columns.countedCash")}
                value={money(totals.countedCash)}
              />
              <Sum
                wide={wide}
                label={tc("columns.difference")}
                value={difference.text}
                tone={difference.tone}
                testID="cash-totals-difference"
              />
            </View>
            {totals.pending > 0 ? (
              <Text variant="small" tone="mutedForeground" testID="cash-pending">
                {tc("pendingCount", { count: totals.pending })}
              </Text>
            ) : null}
          </Card>
          <View style={styles.cards} testID="cash-list">
            {items.map((close) => (
              <View key={close.id} style={wide ? styles.cell : styles.full}>
                <CloseCard
                  close={close}
                  day={day(close.date)}
                  showCashier={seesAll}
                  accepting={accept.isPending && accept.variables === close.id}
                  onAccept={mayAccept && !close.acceptedAt ? () => accept.mutate(close.id) : null}
                  onPrint={() => site.open(`/cashdesk/${close.id}`)}
                />
              </View>
            ))}
          </View>
        </>
      )}
      <CloseDaySheet open={closing} onClose={() => setClosing(false)} />
    </Screen>
  );
}

/** One figure of the totals: beside its name on a phone, under it on a tablet's row of three. */
function Sum({
  label,
  value,
  tone = "foreground",
  wide,
  testID,
}: {
  label: string;
  value: string;
  tone?: "destructive" | "success" | "foreground";
  wide: boolean;
  testID?: string;
}) {
  return (
    <View style={wide ? styles.sum : styles.fact}>
      <Text variant="small" tone="mutedForeground" style={wide ? undefined : styles.factLabel}>
        {label}
      </Text>
      <Text variant="figure" tone={tone} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function CloseCard({
  close,
  day,
  showCashier,
  accepting,
  onAccept,
  onPrint,
}: {
  close: CashClose;
  day: string;
  showCashier: boolean;
  accepting: boolean;
  onAccept: (() => void) | null;
  onPrint: () => void;
}) {
  const tc = useTranslations("cashdesk");
  const money = useMoney();
  const signed = useSigned();
  const difference = signed(close.difference);
  return (
    <Card style={styles.card} testID={`cash-${close.id}`}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="heading">{day}</Text>
          <Text variant="small" tone="mutedForeground" numberOfLines={1}>
            {[close.branchName, showCashier ? close.cashierName : null].filter(Boolean).join(", ")}
          </Text>
        </View>
        {close.acceptedAt ? (
          <Badge
            tone="success"
            label={
              close.acceptedByName
                ? tc("acceptedBy", { name: close.acceptedByName })
                : tc("status.accepted")
            }
            testID={`cash-${close.id}-status`}
          />
        ) : (
          <Badge label={tc("status.pending")} testID={`cash-${close.id}-status`} />
        )}
      </View>
      <View style={styles.facts}>
        <Fact
          label={tc("columns.payments")}
          value={`${money(close.received)}, ${tc("paymentsCount", { count: close.paymentsCount })}`}
        />
        <Fact label={tc("columns.expectedCash")} value={money(close.expectedCash)} />
        <Fact label={tc("columns.countedCash")} value={money(close.countedCash)} />
        <View style={styles.fact}>
          <Text variant="small" tone="mutedForeground" style={styles.factLabel}>
            {tc("columns.difference")}
          </Text>
          <Text variant="figure" tone={difference.tone} testID={`cash-${close.id}-difference`}>
            {difference.text}
          </Text>
        </View>
      </View>
      {close.note ? (
        <Text variant="small" tone="mutedForeground">
          {close.note}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {onAccept ? (
          <Button
            compact
            variant="outline"
            label={tc("accept")}
            loading={accepting}
            onPress={onAccept}
            testID={`cash-${close.id}-accept`}
          />
        ) : null}
        <Button
          compact
          variant="ghost"
          label={tc("print")}
          onPress={onPrint}
          testID={`cash-${close.id}-print`}
        />
      </View>
    </Card>
  );
}

/**
 * "Close the day": what the cashier recorded that day in the branch, by
 * payment type, and the cash the drawer should hold; the cashier counts the
 * money and enters it. A day closed before and not yet accepted is replaced.
 */
export function CloseDaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const tc = useTranslations("cashdesk");
  const td = useTranslations("cashdesk.dialog");
  const me = useMe();
  const money = useMoney();
  const signed = useSigned();
  const today = centreToday();
  const firstBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [branchId, setBranchId] = useState<string | null>(firstBranch);
  const [date, setDate] = useState<string | null>(today);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const save = useCloseDay();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBranchId(firstBranch);
      setDate(today);
      setCounted("");
      setNote("");
      setMissing(false);
      save.reset();
    }
  }
  const future = date !== null && date > today;
  const preview = useCashDay(branchId, date, open && !future);
  // While the day is being counted again, nothing of the earlier count is acted on.
  const day = preview.isFetching ? null : (preview.data ?? null);
  const accepted = !!day?.existing?.acceptedAt;
  const fieldError = fieldErrorOf(t, save.error);
  const countedSum = counted.trim() === "" ? null : typedMoney(counted);
  const difference = day ? signed((countedSum ?? 0) - day.expectedCash) : null;

  const submit = () => {
    if (!branchId || !date || future || countedSum === null) {
      setMissing(true);
      return;
    }
    save.mutate(
      { branchId, date, countedCash: countedSum, note: note.trim() || null },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={td("title")}
      testID="cash-close"
      footer={
        <Button
          label={td("save")}
          loading={save.isPending}
          disabled={accepted}
          onPress={submit}
          testID="cash-close-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {td("hint")}
        </Text>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="cash-close-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        {me.branches.length > 1 ? (
          <Select
            label={td("branch")}
            value={branchId}
            onChange={(value) => setBranchId(value ?? firstBranch)}
            options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
            error={fieldError("branchId")}
            testID="cash-close-branch"
          />
        ) : null}
        <DateField
          label={td("date")}
          value={date}
          onChange={setDate}
          error={
            fieldError("date") ??
            (future
              ? t("validation.futureDate")
              : missing && !date
                ? t("validation.required")
                : null)
          }
          testID="cash-close-date"
        />
        {day?.existing && !accepted ? (
          <Notice tone="warning" testID="cash-close-again">
            {td("reclose")}
          </Notice>
        ) : null}
        {accepted ? (
          <Notice tone="destructive" testID="cash-close-accepted">
            {t("errors.cashCloseAccepted")}
          </Notice>
        ) : null}
        <View testID="cash-close-preview">
          {future || !date ? null : preview.isFetching ? (
            <Loading />
          ) : !day ? (
            <Notice tone="destructive">{errorText(t, preview.error)}</Notice>
          ) : (
            <View style={styles.form}>
              {day.methods.map((method, index) => (
                <View key={method.methodId ?? "none"}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.method} testID={`cash-method-${method.methodId ?? "none"}`}>
                    <View style={styles.head}>
                      <Text variant="bodyStrong" style={styles.fill}>
                        {method.name ?? tc("noMethod")}
                        {method.isCash ? ` (${tc("cash")})` : ""}
                      </Text>
                      <Text variant="figure">{money(method.net)}</Text>
                    </View>
                    <Text variant="small" tone="mutedForeground">
                      {[
                        `${td("payments")}: ${money(method.payments)}`,
                        method.refunds > 0 ? `${td("refunds")}: ${money(method.refunds)}` : null,
                        method.expenses > 0
                          ? `${tc("sheet.expenses")}: ${money(method.expenses)}`
                          : null,
                        method.income > 0 ? `${tc("sheet.income")}: ${money(method.income)}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  </View>
                </View>
              ))}
              <Text variant="small" tone="mutedForeground">
                {tc("paymentsCount", { count: day.paymentsCount })}, {money(day.received)}
              </Text>
              <View style={styles.head}>
                <Text variant="bodyStrong" style={styles.fill}>
                  {td("expectedCash")}
                </Text>
                <Text variant="heading" testID="cash-close-expected">
                  {money(day.expectedCash)}
                </Text>
              </View>
            </View>
          )}
        </View>
        {day && !day.hasCashMethod ? (
          <Notice tone="warning" testID="cash-close-no-cash">
            {td("noCashMethod")}
          </Notice>
        ) : null}
        <Field
          label={td("countedCash")}
          value={counted}
          onChangeText={setCounted}
          keyboardType="number-pad"
          editable={!accepted}
          error={
            fieldError("countedCash") ??
            (missing && countedSum === null ? t("validation.required") : null)
          }
          testID="cash-close-counted"
        />
        <View style={styles.head}>
          <Text variant="bodyStrong" style={styles.fill}>
            {td("difference")}
          </Text>
          <Text
            variant="heading"
            tone={difference && countedSum !== null ? difference.tone : "foreground"}
            testID="cash-close-difference"
          >
            {difference && countedSum !== null ? difference.text : "—"}
          </Text>
        </View>
        <Field
          label={td("note")}
          value={note}
          onChangeText={setNote}
          placeholder={td("notePlaceholder")}
          multiline
          maxLength={500}
          editable={!accepted}
          error={fieldError("note")}
          testID="cash-close-note"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: space[4] },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[1], rowGap: space[2] },
  half: { width: "50%", paddingHorizontal: space[1] },
  quarter: { width: "25%", paddingHorizontal: space[1] },
  cards: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flex: 1 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  facts: { gap: space[2] },
  sums: { flexDirection: "row", flexWrap: "wrap", columnGap: space[8], rowGap: space[2] },
  sum: { gap: 2 },
  fact: { flexDirection: "row", gap: space[3] },
  factLabel: { width: 110, paddingTop: 2 },
  method: { gap: space[1], paddingVertical: space[1] },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
