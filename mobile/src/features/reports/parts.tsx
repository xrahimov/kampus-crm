import { FileSpreadsheet } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { ReportPeriod } from "@/api/office-reports";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Select, type SelectOption } from "@/components/select";
import { Card, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { centreMonth, useMonthName } from "@/features/finance/period";
import { useOpenSite } from "@/features/office/site-paths";
import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

/** The years on offer, as on the site's other pages: next year, this one and three back. */
const YEAR_STEPS = [1, 0, -1, -2, -3];
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/**
 * The month and the branch a report is of. It starts on this month; the
 * branch can be chosen only by someone with several branches and none chosen
 * at the top of the app (that choice already narrows every list).
 */
export function useReportPeriod() {
  const me = useMe();
  const now = centreMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [picked, setBranch] = useState<string | null>(null);
  const branchChoice = !me.activeBranch && me.branches.length > 1;
  const period: ReportPeriod = { branchId: branchChoice ? picked : null, year, month };
  return { period, branchChoice, setYear, setMonth, setBranch };
}

/** The first and the last day of a month, as ISO days. */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

type Days = { from: string | null; to: string | null };

/**
 * Two days typed into date fields, From and To. `typed` is what the fields
 * hold, null while one of them is not a day yet; `applied` is the last pair of
 * real days in the right order, which is what the report is asked for. The
 * fields start on `start` and go back to it when it changes (another month).
 */
export function useDays(start: { from: string; to: string }) {
  const [typed, setTyped] = useState<Days>(start);
  const [applied, setApplied] = useState(start);
  const [seen, setSeen] = useState(start);
  if (start.from !== seen.from || start.to !== seen.to) {
    setSeen(start);
    setTyped(start);
    setApplied(start);
  }
  const set = (key: "from" | "to", value: string | null) => {
    const next = { ...typed, [key]: value };
    setTyped(next);
    if (next.from && next.to && next.from <= next.to) setApplied({ from: next.from, to: next.to });
  };
  /** Both are days and the last one is before the first. */
  const backwards = typed.from !== null && typed.to !== null && typed.to < typed.from;
  return { typed, applied, set, backwards };
}

/**
 * The tabs of a report whose names do not fit a row of equal parts (five of
 * them, or long ones): they keep their own widths and the row scrolls sideways.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  testID: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
      accessibilityRole="tablist"
      testID={testID}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          on={option.value === value}
          onPress={() => onChange(option.value)}
          testID={`${testID}-${option.value}`}
        />
      ))}
    </ScrollView>
  );
}

/** One filter's box in the row of filters: half the row on a phone, a quarter on a tablet. */
export function FilterCell({ children }: { children: ReactNode }) {
  const { wide } = useLayout();
  return <View style={wide ? styles.quarter : styles.half}>{children}</View>;
}

/** The row of filters a report starts with. */
export function Filters({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.filters} testID={testID}>
      {children}
    </View>
  );
}

/** Branch, year and month: what every report of a month is narrowed by. */
export function PeriodFilters({
  state,
  withMonth = true,
  onChange,
  testID = "report",
}: {
  state: ReturnType<typeof useReportPeriod>;
  /** The statistics of a week or a day have no month. */
  withMonth?: boolean;
  /** Something else that depends on the period has to start over. */
  onChange?: () => void;
  testID?: string;
}) {
  const tf = useTranslations("reports.filters");
  const me = useMe();
  const monthName = useMonthName();
  const { period } = state;
  const thisYear = centreMonth().year;
  return (
    <>
      {state.branchChoice ? (
        <FilterCell>
          <Select
            compact
            label={tf("branch")}
            value={period.branchId}
            onChange={(value) => {
              state.setBranch(value);
              onChange?.();
            }}
            clearLabel={tf("allBranches")}
            placeholder={tf("allBranches")}
            options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
            testID={`${testID}-branch`}
          />
        </FilterCell>
      ) : null}
      <FilterCell>
        <Select
          compact
          label={tf("year")}
          value={String(period.year)}
          onChange={(value) => {
            state.setYear(value ? Number(value) : thisYear);
            onChange?.();
          }}
          options={YEAR_STEPS.map((step) => {
            const y = String(thisYear + step);
            return { value: y, label: y };
          })}
          testID={`${testID}-year`}
        />
      </FilterCell>
      {withMonth ? (
        <FilterCell>
          <Select
            compact
            label={tf("month")}
            value={String(period.month)}
            onChange={(value) => {
              if (value) state.setMonth(Number(value));
              onChange?.();
            }}
            options={MONTHS.map((m) => ({ value: String(m), label: monthName(m, period.year) }))}
            testID={`${testID}-month`}
          />
        </FilterCell>
      ) : null}
    </>
  );
}

/**
 * A filter over named things with "All" as its first row. Without a choice the
 * field says what it filters by ("Group"), since a row of filters has no labels.
 */
export function OptionFilter<T extends string = string>({
  label,
  value,
  onChange,
  options,
  allLabel,
  testID,
}: {
  label: string;
  value: T | null;
  onChange: (value: T | null) => void;
  options: ReadonlyArray<SelectOption<T>>;
  allLabel?: string;
  testID: string;
}) {
  const tf = useTranslations("reports.filters");
  return (
    <FilterCell>
      <Select
        compact
        label={label}
        value={value}
        onChange={onChange}
        clearLabel={allLabel ?? tf("all")}
        emptyLabel={label}
        options={options}
        testID={testID}
      />
    </FilterCell>
  );
}

export interface Kpi {
  key: string;
  label: string;
  value: string;
  /** A small line under the value: a count, a name. */
  hint?: string | null;
  /** Percent against the period before. */
  change?: number | null;
}

/** The key figures of a report: two to a row on a phone, `columns` on a tablet. */
export function Kpis({ items, columns = 4 }: { items: Kpi[]; columns?: 3 | 4 }) {
  const { wide } = useLayout();
  const { colors } = useTheme();
  const width = `${100 / (wide ? columns : 2)}%` as const;
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const change = item.change;
        const ink =
          change === undefined || change === null || change === 0
            ? colors.mutedForeground
            : change > 0
              ? colors.success
              : colors.destructive;
        return (
          <View key={item.key} style={{ width, padding: space[1] }}>
            <Card style={styles.kpi} testID={`kpi-${item.key}`}>
              <Text variant="small" tone="mutedForeground" numberOfLines={2}>
                {item.label}
              </Text>
              <Text
                variant="figure"
                style={styles.number}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {item.value}
              </Text>
              {change !== undefined && change !== null ? (
                <Text
                  variant="smallStrong"
                  style={[styles.number, { color: ink }]}
                  testID={`kpi-${item.key}-change`}
                >
                  {change > 0 ? "+" : ""}
                  {change}%
                </Text>
              ) : null}
              {item.hint ? (
                <Text variant="small" tone="mutedForeground" numberOfLines={2}>
                  {item.hint}
                </Text>
              ) : null}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

/** A card with its name on top: one chart, one list. */
export function Section({
  title,
  note,
  children,
  testID,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { wide } = useLayout();
  return (
    <Card style={wide ? styles.sectionWide : styles.section} testID={testID}>
      <Text variant="bodyStrong" accessibilityRole="header">
        {title}
      </Text>
      {note ? (
        <Text variant="small" tone="mutedForeground">
          {note}
        </Text>
      ) : null}
      {children}
    </Card>
  );
}

/** Two sections side by side on a tablet, one under the other on a phone. */
export function Pair({ children }: { children: ReactNode }) {
  const { wide } = useLayout();
  return <View style={wide ? styles.pairWide : styles.pairNarrow}>{children}</View>;
}

/** How many of each named thing: the name and the count, and a bar as long as its share of the largest. */
export function CountBars({
  items,
  empty,
  format = String,
  testID,
}: {
  items: Array<{ name: string; count: number }>;
  empty: string;
  format?: (count: number) => string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const largest = Math.max(0, ...items.map((item) => item.count));
  if (items.length === 0 || largest <= 0) {
    return (
      <Text variant="small" tone="mutedForeground" testID={testID ? `${testID}-empty` : undefined}>
        {empty}
      </Text>
    );
  }
  return (
    <View style={styles.bars} testID={testID}>
      {items.slice(0, 12).map((item, index) => (
        <View key={`${item.name}:${index}`} style={styles.barRow}>
          <View style={styles.between}>
            <Text numberOfLines={1} style={styles.fill}>
              {item.name}
            </Text>
            <Text variant="bodyStrong" style={styles.number}>
              {format(item.count)}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.secondary }]}>
            <View
              style={[
                styles.share,
                {
                  backgroundColor: colors.series1,
                  width: `${item.count <= 0 ? 0 : Math.max(1, (item.count / largest) * 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export interface SeriesStep {
  /** Under the bars: "Mar", "14". */
  label: string;
  /** Read out and written beside the values: "March 2026". Defaults to `label`. */
  name?: string;
  values: number[];
}

const PLOT = 132;
const BAR_MAX = 12;

/**
 * One to three counts for each step of time: leads created, converted and
 * lost in each month; who left on each day. One scale, a colour per series
 * that stays with it, a legend when there is more than one series, and the
 * pressed step's numbers in words under the plot (a phone has no hover).
 */
export function SeriesBars({
  steps,
  series,
  empty,
  initial,
  labelEvery = 1,
  testID = "series-bars",
}: {
  steps: SeriesStep[];
  /** The names of the series, in the order of each step's `values`. */
  series: string[];
  empty: string;
  /** The step picked at first; the last one with a value otherwise. */
  initial?: number;
  /** Write only every n-th label under the plot: 31 days do not fit. */
  labelEvery?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const inks = [colors.series1, colors.series2, colors.series3];
  const [picked, setPicked] = useState<number | null>(null);
  const top = Math.max(0, ...steps.flatMap((step) => step.values));
  if (steps.length === 0 || top <= 0) {
    return (
      <Text variant="small" tone="mutedForeground" testID={`${testID}-empty`}>
        {empty}
      </Text>
    );
  }
  const lastWithValue = steps.reduce(
    (found, step, index) => (step.values.some((v) => v > 0) ? index : found),
    0,
  );
  const at = Math.min(picked ?? initial ?? lastWithValue, steps.length - 1);
  const height = (value: number) => (value <= 0 ? 0 : Math.max(2, (value / top) * PLOT));
  const step = steps[at];
  const words = (s: SeriesStep) =>
    `${s.name ?? s.label}. ${series.map((name, i) => `${name}: ${s.values[i] ?? 0}`).join(". ")}`;

  return (
    <View style={styles.chart} testID={testID}>
      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((name, index) => (
            <Key key={name} color={inks[index] ?? colors.series1} label={name} />
          ))}
        </View>
      ) : null}
      <View style={[styles.plot, { borderBottomColor: colors.border }]}>
        {steps.map((s, index) => (
          <Pressable
            key={`${s.label}:${index}`}
            onPress={() => setPicked(index)}
            accessibilityRole="button"
            accessibilityState={{ selected: index === at }}
            accessibilityLabel={words(s)}
            style={[styles.step, index === at ? { backgroundColor: colors.muted } : null]}
            testID={`${testID}-step-${index}`}
          >
            <View style={styles.group}>
              {series.map((name, i) => (
                <View
                  key={name}
                  style={[
                    styles.bar,
                    {
                      height: height(s.values[i] ?? 0),
                      backgroundColor: inks[i] ?? colors.series1,
                    },
                  ]}
                />
              ))}
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.labels}>
        {steps.map((s, index) => (
          <Text
            key={`${s.label}:${index}`}
            variant="small"
            tone={index === at ? "foreground" : "mutedForeground"}
            numberOfLines={1}
            style={styles.label}
          >
            {index % labelEvery === 0 || index === at ? s.label : ""}
          </Text>
        ))}
      </View>
      {step ? (
        <View
          style={[styles.picked, { backgroundColor: colors.muted }]}
          testID={`${testID}-picked`}
        >
          <Text variant="smallStrong">{step.name ?? step.label}</Text>
          <View style={styles.sums}>
            {series.map((name, i) => (
              <View key={name} style={styles.sum}>
                <Key color={inks[i] ?? colors.series1} label={name} />
                <Text variant="figure" style={styles.number}>
                  {step.values[i] ?? 0}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text variant="small" tone="mutedForeground">
        {label}
      </Text>
    </View>
  );
}

export interface Stat {
  label: string;
  value: string;
  tone?: "foreground" | "destructive" | "success";
}

/**
 * The numbers of one row of a report: a small name over each, three to a row.
 * Sums of money need more room than counts: give them a row of two.
 */
export function Stats({ items, columns = 3 }: { items: Stat[]; columns?: 2 | 3 | 4 }) {
  const width = `${100 / columns}%` as const;
  return (
    <View style={styles.stats}>
      {items.map((item, index) => (
        // Two numbers of a row can share a name: days late and time late.
        <View key={`${index}:${item.label}`} style={[styles.stat, { width }]}>
          <Text variant="small" tone="mutedForeground" numberOfLines={2}>
            {item.label}
          </Text>
          <Text
            variant="bodyStrong"
            tone={item.tone ?? "foreground"}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The rows of a report as cards: one under another on a phone, two to a row on a tablet. */
export function Rows({ children, testID }: { children: ReactNode[]; testID?: string }) {
  const { wide } = useLayout();
  return (
    <View style={styles.rows} testID={testID}>
      {children.map((child, index) => (
        <View key={index} style={wide ? styles.rowHalf : styles.rowFull}>
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * The Excel file of a report is made by the site: this opens the report there,
 * with the same filters, where its Excel button is.
 */
export function ExcelOnSite({ path }: { path: string }) {
  const t = useTranslations();
  const { colors } = useTheme();
  const site = useOpenSite();
  return (
    <>
      {site.error ? <Notice tone="destructive">{site.error}</Notice> : null}
      <Button
        variant="outline"
        icon={<FileSpreadsheet size={18} color={colors.foreground} />}
        label={t("mobile.money.excelOnSite")}
        onPress={() => site.open(path)}
        style={styles.start}
        testID="report-excel"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
  between: { flexDirection: "row", alignItems: "center", gap: space[2] },
  tabs: { gap: space[2], paddingVertical: 2 },
  number: { fontVariant: ["tabular-nums"] },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -space[1],
    rowGap: space[2],
  },
  half: { width: "50%", paddingHorizontal: space[1] },
  quarter: { width: "25%", paddingHorizontal: space[1] },
  grid: { flexDirection: "row", flexWrap: "wrap", margin: -space[1] },
  kpi: { flex: 1, gap: 2 },
  section: { gap: space[3] },
  sectionWide: { gap: space[3], flex: 1 },
  pairNarrow: { gap: space[4] },
  pairWide: { flexDirection: "row", alignItems: "flex-start", gap: space[4] },
  bars: { gap: space[3] },
  barRow: { gap: space[1] },
  track: { height: 8, borderRadius: radius.full, overflow: "hidden" },
  share: { height: 8, borderRadius: radius.full },
  chart: { gap: space[2] },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space[4] },
  key: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  plot: {
    height: PLOT + space[2],
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  step: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  group: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
  },
  bar: {
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: BAR_MAX,
    minWidth: 2,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  labels: { flexDirection: "row" },
  label: { flex: 1, textAlign: "center", fontSize: 11 },
  picked: { borderRadius: 10, padding: space[3], gap: space[2] },
  sums: { flexDirection: "row", flexWrap: "wrap", columnGap: space[6], rowGap: space[2] },
  sum: { gap: 2 },
  stats: { flexDirection: "row", flexWrap: "wrap", rowGap: space[2] },
  stat: { paddingRight: space[2], gap: 1 },
  rows: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  rowFull: { width: "100%", paddingHorizontal: space[2] },
  rowHalf: { width: "50%", paddingHorizontal: space[2] },
});
