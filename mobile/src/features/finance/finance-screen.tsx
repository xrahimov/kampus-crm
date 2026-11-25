import { useRouter, type Href } from "expo-router";
import { ChevronRight, Plus } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import {
  useCreateCategory,
  useFinanceCategories,
  useFinanceFigures,
  useFinanceOptions,
  useFinancePlan,
  useFinanceTotals,
  usePayrollRuns,
  type FinanceKind,
  type FinanceSection,
  type PayrollSummary,
} from "@/api/office-finance";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PairBars } from "@/features/office/pair-bars";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

import { centreMonth, monthKey, PeriodSelects, useMonthName } from "./period";

const FIGURES = [
  "income",
  "expenses",
  "profit",
  "activeBalance",
  "ltv",
  "cac",
  "marketingEfficiency",
  "averagePayment",
] as const;

/**
 * Finance (A-237): the site's Finance page. The key figures of a year or a
 * month with the payment types and the year by months, the month's plan,
 * expenses and income by category, what was given to and taken from staff,
 * and the payroll months. Every card opens its list.
 */
export function FinanceScreen() {
  const t = useTranslations();
  const tf = useTranslations("finance");
  const me = useMe();
  const router = useRouter();
  const money = useMoney();
  const monthName = useMonthName();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const now = centreMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState<number | null>(null);
  const [pickedBranch, setBranch] = useState<string | null>(null);
  const [paymentMethodId, setMethod] = useState<string | null>(null);
  const [effective, setEffective] = useState(true);
  const [adding, setAdding] = useState<FinanceKind | null>(null);
  // A branch chosen at the top of the app already narrows every list.
  const branchChoice = !me.activeBranch && me.branches.length > 1;
  const branchId = branchChoice ? pickedBranch : null;
  const planMonth = month ?? now.month;

  const figures = useFinanceFigures({ year, month, branchId, paymentMethodId });
  const plan = useFinancePlan(branchId, year, planMonth, effective);
  const categories = useFinanceCategories(branchId, year, month);
  const totals = useFinanceTotals(branchId, year, month);
  const options = useFinanceOptions();
  const payroll = usePayrollRuns();
  const mayAdd = can(me, "finance.create");

  const header = <Header back title={tf("title")} />;
  if (!figures.data) return <PendingScreen header={header} query={figures} />;
  const data = figures.data;
  const columns = wide ? 4 : 2;
  const sum = (type: "ADVANCE" | "MARKETING" | "BONUS" | "PENALTY") =>
    totals.data ? money(totals.data.byType[type]) : null;
  const section = (name: FinanceSection): Href => ({
    pathname: "/staff/finance/[section]",
    params: { section: name },
  });
  const largest = Math.max(1, ...data.byMethod.map((m) => m.amount));
  const left = plan.data ? Math.max(0, Math.round((100 - plan.data.achievedPercent) * 10) / 10) : 0;
  const closes = totals.data?.cashCloses;

  const categoryCards = (kind: FinanceKind) => (
    <View style={styles.section} testID={`finance-${kind}`}>
      <View style={styles.between}>
        <Text variant="heading" accessibilityRole="header" style={styles.fill}>
          {tf(kind === "EXPENSE" ? "expenseReport" : "incomeReport")}
        </Text>
        {mayAdd ? (
          <Button
            compact
            variant="outline"
            icon={<Plus size={16} color={colors.foreground} />}
            label={tf("addCategory")}
            onPress={() => setAdding(kind)}
            testID={`finance-add-${kind}`}
          />
        ) : null}
      </View>
      <Grid columns={columns}>
        {[
          ...(kind === "EXPENSE"
            ? [
                <LinkTile
                  key="advance"
                  title={tf("sections.advance")}
                  value={sum("ADVANCE")}
                  onPress={() => router.push(section("advance"))}
                  testID="finance-advance"
                />,
                <LinkTile
                  key="marketing"
                  title={tf("sections.marketing")}
                  value={sum("MARKETING")}
                  onPress={() => router.push(section("marketing"))}
                  testID="finance-marketing"
                />,
              ]
            : []),
          ...(categories.data ?? [])
            .filter((c) => c.kind === kind)
            .map((c) => (
              <LinkTile
                key={c.id}
                title={c.name}
                value={money(c.total)}
                onPress={() =>
                  router.push({ pathname: "/staff/finance/costs/[id]", params: { id: c.id } })
                }
                testID={`finance-category-${c.id}`}
              />
            )),
        ]}
      </Grid>
    </View>
  );

  return (
    <Screen
      header={header}
      onRefresh={() => {
        void figures.refetch();
        void plan.refetch();
        void categories.refetch();
        void totals.refetch();
        void payroll.refetch();
      }}
      refreshing={figures.isRefetching}
    >
      <View style={styles.filters}>
        <PeriodSelects
          year={year}
          month={month}
          onYear={setYear}
          onMonth={setMonth}
          cell={wide ? styles.quarter : styles.half}
          testID="finance"
        />
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={tf("filters.method")}
            value={paymentMethodId}
            onChange={setMethod}
            clearLabel={tf("filters.anyMethod")}
            placeholder={tf("filters.anyMethod")}
            options={(options.data?.paymentMethods ?? []).map((m) => ({
              value: m.id,
              label: m.name,
            }))}
            testID="finance-method"
          />
        </View>
        {branchChoice ? (
          <View style={wide ? styles.quarter : styles.half}>
            <Select
              compact
              label={tf("filters.branch")}
              value={pickedBranch}
              onChange={setBranch}
              clearLabel={t("common.allBranches")}
              placeholder={t("common.allBranches")}
              options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
              testID="finance-branch"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          {tf("overview")}
        </Text>
        <Grid columns={columns} testID="finance-figures">
          {FIGURES.map((key) => {
            const value =
              key === "marketingEfficiency" ? `${data.marketingEfficiency}%` : money(data[key]);
            return (
              <Card
                key={key}
                // The active balance is what the investments left: it opens them, as on the site.
                onPress={
                  key === "activeBalance" ? () => router.push(section("investment")) : undefined
                }
                style={styles.tile}
                testID={`finance-figure-${key}`}
              >
                {/* One line, so the numbers of a row stand level; a long name ("Эффективность
                    маркетинга" on a phone) is set a little smaller instead of cut (A-271). */}
                <Text
                  variant="small"
                  tone="mutedForeground"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  testID={`finance-figure-${key}-name`}
                >
                  {tf(`kpis.${key}`)}
                </Text>
                <Text
                  variant="heading"
                  style={styles.number}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {value}
                </Text>
              </Card>
            );
          })}
        </Grid>
        <View style={wide ? styles.sideBySide : styles.section}>
          <Card style={wide ? styles.fill : undefined} testID="finance-by-method">
            <Text variant="bodyStrong">{tf("byMethod")}</Text>
            {data.byMethod.length === 0 ? (
              <Text variant="small" tone="mutedForeground">
                {t("common.nothingFound")}
              </Text>
            ) : (
              data.byMethod.map((m) => (
                <View key={m.id ?? "none"} style={styles.method}>
                  <View style={styles.between}>
                    <Text style={styles.fill} numberOfLines={1}>
                      {m.name ?? tf("noMethod")}
                    </Text>
                    <Text variant="figure" style={styles.number}>
                      {money(m.amount)}
                    </Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.secondary }]}>
                    <View
                      style={[
                        styles.share,
                        {
                          backgroundColor: colors.series1,
                          width: `${Math.max(1, (m.amount / largest) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>
          <Card style={wide ? styles.fill : undefined} testID="finance-yearly">
            <Text variant="bodyStrong">{tf("yearly", { year })}</Text>
            <PairBars
              rows={data.yearly.map((m, index) => ({
                label: monthName(index + 1),
                name: monthName(index + 1, year),
                first: m.income,
                second: m.expenses,
              }))}
              legend={{ first: tf("kpis.income"), second: tf("kpis.expenses") }}
              format={money}
              initial={month ? month - 1 : year === now.year ? now.month - 1 : 11}
              testID="finance-bars"
            />
          </Card>
        </View>
      </View>

      <View style={styles.section} testID="finance-plan">
        <Text variant="heading" accessibilityRole="header">
          {tf("planTitle", { month: monthName(planMonth, year) })}
        </Text>
        <Check
          label={tf("effectiveTime")}
          value={effective}
          onChange={setEffective}
          testID="finance-effective"
        />
        {plan.error ? <Notice tone="destructive">{errorText(t, plan.error)}</Notice> : null}
        {plan.data ? (
          <Card>
            <View style={wide ? styles.sideBySide : styles.section}>
              <View style={styles.fill}>
                <Text variant="small" tone="mutedForeground">
                  {tf("plan.achieved")}
                </Text>
                <Text variant="heading" style={styles.number} testID="finance-plan-achieved">
                  {money(plan.data.achieved)}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {tf("plan.done", { percent: plan.data.achievedPercent })}
                </Text>
              </View>
              <View style={styles.fill}>
                <Text variant="small" tone="mutedForeground">
                  {tf("plan.expected")}
                </Text>
                <Text variant="heading" style={styles.number} testID="finance-plan-expected">
                  {money(plan.data.expected)}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {tf("plan.left", { percent: left })}
                </Text>
              </View>
            </View>
            <View
              style={[styles.progress, { backgroundColor: colors.secondary }]}
              accessibilityRole="progressbar"
              accessibilityLabel={tf("plan.progress")}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(plan.data.achievedPercent) }}
              testID="finance-plan-progress"
            >
              <View
                style={[
                  styles.progressDone,
                  {
                    backgroundColor: colors.primary,
                    width: `${Math.min(100, Math.max(0, plan.data.achievedPercent))}%`,
                  },
                ]}
              />
            </View>
            <Grid columns={columns}>
              {(
                [
                  ["monthlyPlan", money(plan.data.plan), null],
                  [
                    "activeDebt",
                    money(plan.data.activeDebt),
                    t("debts.count", { count: plan.data.debtors }),
                  ],
                  ["prepayments", money(plan.data.prepayments), null],
                  ["currentShare", `${plan.data.achievedPercent}%`, null],
                ] as const
              ).map(([key, value, note]) => (
                <View
                  key={key}
                  style={[styles.fact, { borderColor: colors.border }]}
                  testID={`finance-plan-${key}`}
                >
                  <Text variant="small" tone="mutedForeground" numberOfLines={2}>
                    {tf(`plan.${key}`)}
                  </Text>
                  <Text variant="figure" numberOfLines={1} adjustsFontSizeToFit>
                    {value}
                  </Text>
                  {note ? (
                    <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                      {note}
                    </Text>
                  ) : null}
                </View>
              ))}
            </Grid>
          </Card>
        ) : null}
      </View>

      {categories.error ? (
        <Notice tone="destructive">{errorText(t, categories.error)}</Notice>
      ) : null}
      {categoryCards("EXPENSE")}
      {categoryCards("INCOME")}

      <View style={styles.section} testID="finance-staff-money">
        <Text variant="heading" accessibilityRole="header">
          {tf("staffMoney")}
        </Text>
        <Grid columns={columns}>
          {[
            <LinkTile
              key="bonus"
              title={tf("sections.bonus")}
              value={sum("BONUS")}
              onPress={() => router.push(section("bonus"))}
              testID="finance-bonus"
            />,
            <LinkTile
              key="penalty"
              title={tf("sections.penalty")}
              value={sum("PENALTY")}
              onPress={() => router.push(section("penalty"))}
              testID="finance-penalty"
            />,
            <LinkTile
              key="cashdesk"
              title={tf("sections.cashdesk")}
              value={
                closes
                  ? [
                      tf("cashdeskCount", { count: closes.count }),
                      closes.pending > 0 ? tf("cashdeskPending", { count: closes.pending }) : null,
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : null
              }
              small
              onPress={() => router.push("/staff/cashdesk")}
              testID="finance-cashdesk"
            />,
          ]}
        </Grid>
      </View>

      <View style={styles.section} testID="finance-payroll">
        <View style={styles.between}>
          <Text variant="heading" accessibilityRole="header" style={styles.fill}>
            {tf("payroll.title")}
          </Text>
          <Button
            compact
            variant="outline"
            label={tf("payroll.open", { month: monthName(planMonth, year) })}
            onPress={() =>
              router.push({
                pathname: "/staff/finance/salary/[month]",
                params: { month: monthKey(year, planMonth) },
              })
            }
            testID="finance-payroll-open"
          />
        </View>
        <Text variant="small" tone="mutedForeground">
          {tf("payroll.rulesNote")}
        </Text>
        {payroll.error ? <Notice tone="destructive">{errorText(t, payroll.error)}</Notice> : null}
        {payroll.data && payroll.data.length === 0 ? (
          <Text tone="mutedForeground" testID="finance-payroll-empty">
            {tf("payroll.empty")}
          </Text>
        ) : null}
        <Grid columns={wide ? 2 : 1}>
          {(payroll.data ?? []).map((run) => (
            <PayrollCard
              key={run.id}
              run={run}
              onPress={() =>
                router.push({
                  pathname: "/staff/finance/salary/[month]",
                  params: { month: run.month },
                })
              }
            />
          ))}
        </Grid>
      </View>

      <CategorySheet kind={adding} onClose={() => setAdding(null)} />
    </Screen>
  );
}

/** Cards side by side, each as wide as its share of the row. */
function Grid({
  columns,
  children,
  testID,
}: {
  columns: number;
  children: ReactNode[];
  testID?: string;
}) {
  return (
    <View style={styles.grid} testID={testID}>
      {children.map((child, index) => (
        <View key={index} style={{ width: `${100 / columns}%`, padding: space[1] }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** A card that opens a list: its name, and the period's sum when the server gave one. */
function LinkTile({
  title,
  value,
  small = false,
  onPress,
  testID,
}: {
  title: string;
  value: string | null;
  /** The value is a sentence, not a sum. */
  small?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} style={styles.tile} testID={testID}>
      <View style={styles.between}>
        <Text variant="small" tone="mutedForeground" numberOfLines={2} style={styles.fill}>
          {title}
        </Text>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </View>
      {value !== null ? (
        <Text
          variant={small ? "small" : "figure"}
          style={small ? undefined : styles.number}
          numberOfLines={small ? 2 : 1}
          adjustsFontSizeToFit={!small}
          minimumFontScale={0.7}
        >
          {value}
        </Text>
      ) : null}
    </Card>
  );
}

function PayrollCard({ run, onPress }: { run: PayrollSummary; onPress: () => void }) {
  const tp = useTranslations("finance.payroll");
  const money = useMoney();
  const monthName = useMonthName();
  const [y = "0", m = "1"] = run.month.split("-");
  return (
    <Card onPress={onPress} testID={`payroll-${run.month}`}>
      <View style={styles.between}>
        <Text variant="bodyStrong" style={styles.fill}>
          {monthName(Number(m), Number(y))}
        </Text>
        <Badge
          tone={run.status === "SAVED" ? "success" : "neutral"}
          label={tp(`statuses.${run.status}`)}
        />
      </View>
      <View style={styles.between}>
        <Text variant="small" tone="mutedForeground" style={styles.fill}>
          {tp("summary", { staff: run.staffCount, approved: run.approvedCount })}
        </Text>
        <Text variant="figure" style={styles.number}>
          {money(run.totals.net)}
        </Text>
      </View>
    </Card>
  );
}

/** "+ Category": a new expense or income category by its name. */
function CategorySheet({ kind, onClose }: { kind: FinanceKind | null; onClose: () => void }) {
  const t = useTranslations();
  const tf = useTranslations("finance");
  const save = useCreateCategory();
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);
  const [seen, setSeen] = useState(kind);
  if (kind !== seen) {
    setSeen(kind);
    if (kind) {
      setName("");
      setMissing(false);
      save.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  const submit = () => {
    if (!kind) return;
    if (!name.trim()) {
      setMissing(true);
      return;
    }
    save.mutate({ kind, name: name.trim() }, { onSuccess: onClose });
  };
  return (
    <Sheet
      open={kind !== null}
      onClose={onClose}
      title={tf("categoryDialog")}
      testID="finance-category"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="finance-category-save"
        />
      }
    >
      <View style={styles.section}>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="finance-category-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        <Text variant="small" tone="mutedForeground">
          {kind ? tf(kind === "EXPENSE" ? "expenseReport" : "incomeReport") : ""}
        </Text>
        <Field
          label={tf("categoryName")}
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoFocus
          error={fieldError("name") ?? (missing && !name.trim() ? t("validation.required") : null)}
          testID="finance-category-name"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { gap: space[3] },
  between: { flexDirection: "row", alignItems: "center", gap: space[2] },
  sideBySide: { flexDirection: "row", alignItems: "stretch", gap: space[3] },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -space[1],
    rowGap: space[2],
  },
  half: { width: "50%", paddingHorizontal: space[1] },
  quarter: { width: "25%", paddingHorizontal: space[1] },
  grid: { flexDirection: "row", flexWrap: "wrap", margin: -space[1] },
  tile: { flex: 1, gap: space[1] },
  number: { fontVariant: ["tabular-nums"] },
  method: { gap: space[1] },
  track: { height: 8, borderRadius: radius.full, overflow: "hidden" },
  share: { height: 8, borderRadius: radius.full },
  progress: { height: 12, borderRadius: radius.full, overflow: "hidden" },
  progressDone: { height: 12, borderRadius: radius.full },
  fact: { flex: 1, gap: 2, padding: space[3], borderWidth: 1, borderRadius: radius.lg },
});
