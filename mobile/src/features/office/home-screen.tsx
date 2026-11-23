import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Contact,
  Eye,
  EyeOff,
  Funnel,
  Gauge,
  GraduationCap,
  HandCoins,
  Sparkles,
  UserMinus,
  UserPlus,
  UserRoundCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  useDashboardKpis,
  useFinanceOverview,
  useHideSetup,
  useRevenueForecast,
  useRoomSchedule,
  useSetupChecklist,
  type DashboardKpis,
  type FinanceOverview,
  type RevenueForecast,
  type RoomBlock,
  type RoomSchedule,
  type SetupChecklist,
} from "@/api/office";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Press } from "@/components/motion";
import { Select } from "@/components/select";
import { Card, Divider, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { Meter } from "@/features/student/meter";
import { dayAsDate, weekdayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

import { HeaderActions } from "./header-actions";
import { PairBars } from "./pair-bars";
import { useOpenPath } from "./site-paths";

type KpiKey = Exclude<keyof DashboardKpis, "utilisation">;

/** The twelve figures in the site's order, each with the page it opens. */
const KPI_ORDER: readonly KpiKey[] = [
  "activeLeads",
  "groups",
  "remainingDebt",
  "debtors",
  "dueSoon",
  "activeStudents",
  "studentsInGroups",
  "trial",
  "leftThisMonth",
  "teachers",
  "exams",
  "newAdmissions",
];

const KPI_ICON: Record<KpiKey, LucideIcon> = {
  activeLeads: Funnel,
  groups: Users,
  remainingDebt: Wallet,
  debtors: HandCoins,
  dueSoon: CalendarClock,
  activeStudents: UserRoundCheck,
  studentsInGroups: Contact,
  trial: Sparkles,
  leftThisMonth: UserMinus,
  teachers: GraduationCap,
  exams: ClipboardCheck,
  newAdmissions: UserPlus,
};

/** Where a figure leads, as on the site's home page. */
export function kpiPath(key: KpiKey, canReports: boolean): string {
  switch (key) {
    case "activeLeads":
      return "/leads";
    case "groups":
      return "/groups";
    case "remainingDebt":
      return "/students?paymentStatus=DEBTOR";
    case "debtors":
      return "/debts";
    case "dueSoon":
      return "/students?paymentStatus=DUE_SOON";
    case "activeStudents":
      return "/students?groupStatus=ACTIVE";
    case "studentsInGroups":
      return "/students";
    case "trial":
      return "/students?groupStatus=TRIAL";
    case "leftThisMonth":
      return canReports ? "/reports/churn" : "/students?archived=true";
    case "teachers":
      return "/teachers";
    case "exams":
      return "/exams";
    case "newAdmissions":
      return "/students?groupStatus=NEW";
  }
}

const HIDDEN = "***";

/**
 * The centre's home (A-230), the site's home page on a phone and a tablet:
 * the twelve figures behind **Show numbers**, the setup checklist, the revenue
 * forecast, which group is in which room on a weekday, and the money of a
 * year or a month. The server decides what each person gets; a part the
 * person may not see is not asked for.
 */
export function HomeScreen() {
  const t = useTranslations();
  const td = useTranslations("dashboard");
  const me = useMe();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const { open, error: openError } = useOpenPath();
  const money = useMoney();
  const [shown, setShown] = useState(false);
  const [branchId, setBranchId] = useState<string | null>(null);
  const seesMoney = can(me, "dashboard.finance");
  const kpis = useDashboardKpis(branchId);
  const setup = useSetupChecklist(can(me, "settings.org"));
  const forecast = useRevenueForecast(branchId, seesMoney);

  const header = <Header title={t("nav.dashboard")} right={<HeaderActions />} />;
  if (!kpis.data) return <PendingScreen header={header} query={kpis} />;

  const mask = (value: string) => (shown ? value : HIDDEN);
  const reload = () => {
    void kpis.refetch();
    if (setup.data !== undefined) void setup.refetch();
    if (seesMoney) void forecast.refetch();
  };

  return (
    <Screen
      header={header}
      onRefresh={reload}
      refreshing={kpis.isRefetching}
      contentStyle={styles.column}
    >
      <View style={styles.welcome}>
        <Text variant="display" testID="home-welcome">
          {td("welcome", { name: me.user.fullName })}
        </Text>
        <Text variant="body" tone="mutedForeground">
          {td("subtitle")}
        </Text>
      </View>
      <View style={styles.controls}>
        <Button
          compact
          variant={shown ? "outline" : "primary"}
          label={shown ? td("hideNumbers") : td("showNumbers")}
          icon={
            shown ? (
              <EyeOff size={18} color={colors.foreground} />
            ) : (
              <Eye size={18} color={colors.primaryForeground} />
            )
          }
          onPress={() => setShown((was) => !was)}
          testID="show-numbers"
        />
        {kpis.data.utilisation !== null ? (
          <Press
            accessibilityRole="button"
            onPress={() => open("/reports/statistics")}
            sink={0.97}
            style={[styles.pill, { borderColor: colors.input, backgroundColor: colors.card }]}
            testID="utilisation"
          >
            <Gauge size={16} color={colors.mutedForeground} />
            <Text variant="smallStrong">
              {td("utilisation", { percent: mask(String(kpis.data.utilisation)) })}
            </Text>
          </Press>
        ) : null}
        {me.branches.length > 1 ? (
          <View style={styles.branch}>
            <Select
              compact
              label={td("branch")}
              value={branchId}
              onChange={setBranchId}
              clearLabel={t("common.allBranches")}
              options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
              testID="home-branch"
            />
          </View>
        ) : null}
      </View>
      {openError ? <Notice tone="destructive">{openError}</Notice> : null}

      {setup.data?.shown ? <Setup data={setup.data} open={open} /> : null}

      <Grid columns={wide ? 4 : 2} testID="home-kpis">
        {KPI_ORDER.map((key) => {
          const Icon = KPI_ICON[key];
          const value = kpis.data[key];
          return (
            <Card
              key={key}
              onPress={() => open(kpiPath(key, can(me, "reports.view")))}
              style={styles.tile}
              testID={`kpi-${key}`}
            >
              <View style={styles.tileTop}>
                <Text variant="small" tone="mutedForeground" style={styles.fill} numberOfLines={2}>
                  {td(`kpis.${key}`)}
                </Text>
                <Icon size={18} color={colors.mutedForeground} strokeWidth={1.75} />
              </View>
              <Figure money={key === "remainingDebt"} testID={`kpi-${key}-value`}>
                {mask(key === "remainingDebt" ? money(value) : String(value))}
              </Figure>
            </Card>
          );
        })}
      </Grid>

      {forecast.data ? <Forecast data={forecast.data} mask={mask} /> : null}
      {forecast.error ? <Notice tone="destructive">{errorText(t, forecast.error)}</Notice> : null}

      <Rooms branchId={branchId} />

      {seesMoney ? <Finance branchId={branchId} mask={mask} open={open} /> : null}
    </Screen>
  );
}

/** A tile's number. A sum of money is a size smaller on a phone: "UZS 39,650,000" has to fit half the screen. */
function Figure({
  children,
  money = false,
  testID,
}: {
  children: ReactNode;
  money?: boolean;
  testID?: string;
}) {
  const { wide } = useLayout();
  return (
    <Text
      variant={money && !wide ? "heading" : "title"}
      style={styles.number}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      testID={testID}
    >
      {children}
    </Text>
  );
}

/** Cards side by side: two on a phone, four on a tablet. */
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
        <View key={index} style={{ width: `${100 / columns}%`, padding: space[2] / 2 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {hint ? (
        <Text variant="small" tone="mutedForeground">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** What is still to set up in a new centre (A-128); each step opens its page. */
function Setup({ data, open }: { data: SetupChecklist; open: (path: string) => void }) {
  const t = useTranslations("dashboard.setup");
  const tt = useTranslations();
  const { colors } = useTheme();
  const hide = useHideSetup();
  const todo = data.steps.filter((step) => !step.done);
  const done = data.steps.filter((step) => step.done);
  return (
    <Card testID="setup-checklist">
      <View style={styles.between}>
        <View style={styles.fill}>
          <Text variant="heading">{t("title")}</Text>
          <Text variant="small" tone="mutedForeground" testID="setup-progress">
            {t("progress", { done: data.done, total: data.total })}
          </Text>
        </View>
        <Button
          compact
          variant="ghost"
          label={t("hide")}
          loading={hide.isPending}
          onPress={() => hide.mutate()}
          testID="setup-hide"
        />
      </View>
      <Meter
        percent={Math.round((data.done / Math.max(data.total, 1)) * 100)}
        label={t("progress", { done: data.done, total: data.total })}
      />
      {hide.error ? <Notice tone="destructive">{errorText(tt, hide.error)}</Notice> : null}
      {/* A phone has no room for nine rows above the figures: what is left to do is listed,
          what is done is named in one line. */}
      <View>
        {todo.map((step, index) => (
          <View key={step.key}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => open(step.href)}
              accessibilityRole="button"
              style={styles.step}
              testID={`setup-step-${step.key}`}
            >
              <Circle size={20} color={colors.mutedForeground} />
              <View style={styles.fill}>
                <Text variant="bodyStrong">{t(`steps.${step.key}`)}</Text>
                <Text variant="small" tone="mutedForeground">
                  {t(`todo.${step.key}`)}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
      </View>
      {done.length > 0 ? (
        <View style={styles.done} testID="setup-done">
          <CheckCircle2 size={18} color={colors.success} />
          <Text variant="small" tone="mutedForeground" style={styles.fill}>
            {done.map((step) => t(`steps.${step.key}`)).join(", ")}
          </Text>
        </View>
      ) : null}
      <Text variant="small" tone="mutedForeground">
        {t("hideHint")}
      </Text>
    </Card>
  );
}

/** What this month and the next should bring in, against what is already paid (A-133). */
function Forecast({ data, mask }: { data: RevenueForecast; mask: (value: string) => string }) {
  const t = useTranslations("dashboard.forecast");
  const money = useMoney();
  const date = useDate();
  const { wide } = useLayout();
  const month = (m: string, long = false) =>
    date(dayAsDate(`${m}-01`), long ? { month: "short", year: "numeric" } : { month: "short" });
  const amount = (value: number) => mask(money(value));
  const splits = data.byBranch.length > 1 ? [...data.byCourse, ...data.byBranch] : data.byCourse;
  return (
    <View style={styles.section} testID="home-forecast">
      <SectionTitle title={t("title")} hint={t("hint", { count: data.memberships })} />
      <View style={wide ? styles.sideBySide : styles.section}>
        <Card style={wide ? styles.fill : undefined} testID="forecast-this-month">
          <Text variant="bodyStrong">{t("thisMonth", { month: month(data.month) })}</Text>
          <View style={styles.between}>
            <View>
              <Text variant="small" tone="mutedForeground">
                {t("collected")}
              </Text>
              <Figure money testID="forecast-collected">
                {amount(data.current.collected)}
              </Figure>
            </View>
            <View style={styles.end}>
              <Text variant="small" tone="mutedForeground">
                {t("expected")}
              </Text>
              <Figure money testID="forecast-expected">
                {amount(data.current.expected)}
              </Figure>
            </View>
          </View>
          <Meter
            percent={Math.min(100, data.current.percent)}
            label={t("percent", { percent: mask(String(data.current.percent)) })}
          />
          <Text variant="small" tone="mutedForeground">
            {t("percent", { percent: mask(String(data.current.percent)) })}
          </Text>
        </Card>
        <Card style={wide ? styles.fill : undefined} testID="forecast-next-month">
          <Text variant="bodyStrong">{t("nextMonth", { month: month(data.nextMonth) })}</Text>
          <View>
            <Text variant="small" tone="mutedForeground">
              {t("expected")}
            </Text>
            <Figure>{amount(data.next.expected)}</Figure>
          </View>
          <Text variant="small" tone="mutedForeground">
            {t("prepaid", { amount: amount(data.next.collected) })}
          </Text>
        </Card>
      </View>
      <Card>
        <Text variant="bodyStrong">{t("chart")}</Text>
        <PairBars
          rows={data.months.map((m) => ({
            label: month(m.month),
            name: month(m.month, true),
            first: m.expected,
            second: m.collected,
          }))}
          legend={{ first: t("series.expected"), second: t("series.collected") }}
          format={amount}
          initial={Math.max(
            0,
            data.months.findIndex((m) => m.kind === "current"),
          )}
          testID="forecast-bars"
        />
      </Card>
      {splits.length > 0 ? (
        <Card style={styles.flush} testID="forecast-split">
          {splits.map((row, index) => (
            <View key={`${row.id ?? "none"}:${index}`}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.splitRow}>
                <Text variant="bodyStrong">{row.name ?? "—"}</Text>
                <View style={wide ? styles.splitSums : styles.splitLines}>
                  <Pair label={t("columns.expected")} value={amount(row.expected)} />
                  <Pair label={t("columns.collected")} value={amount(row.collected)} />
                  <Pair label={t("columns.next")} value={amount(row.nextExpected)} />
                </View>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/** A named sum: side by side with the others on a tablet, a line of its own on a phone. */
function Pair({ label, value }: { label: string; value: string }) {
  const { wide } = useLayout();
  return (
    <View style={wide ? styles.pairCell : styles.pairLine}>
      <Text variant="small" tone="mutedForeground" numberOfLines={1}>
        {label}
      </Text>
      <Text variant={wide ? "figure" : "smallStrong"} style={styles.number} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Which group is in which room on a weekday. The site draws a grid of rooms
 * against hours; a phone is too narrow for that, so each room lists its
 * lessons in the order of the day.
 */
function Rooms({ branchId }: { branchId: string | null }) {
  const t = useTranslations("dashboard.schedule");
  const tt = useTranslations();
  const date = useDate();
  const { colors } = useTheme();
  const [weekday, setWeekday] = useState<number | null>(null);
  const query = useRoomSchedule(weekday, branchId);
  const data: RoomSchedule | undefined = query.data;
  const day = weekday ?? data?.weekday ?? null;
  return (
    <View style={styles.section} testID="home-rooms">
      <SectionTitle
        title={t("title")}
        hint={data ? t("hours", { start: data.workStart, end: data.workEnd }) : undefined}
      />
      <View
        style={[styles.days, { backgroundColor: colors.secondary }]}
        accessibilityRole="tablist"
      >
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const on = d === day;
          return (
            <Pressable
              key={d}
              onPress={() => setWeekday(d)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={date(weekdayAsDate(d), { weekday: "long" })}
              style={[styles.day, on ? { backgroundColor: colors.card } : null]}
              testID={`rooms-day-${d}`}
            >
              <Text
                variant={on ? "smallStrong" : "small"}
                tone={on ? "foreground" : "mutedForeground"}
              >
                {date(weekdayAsDate(d), { weekday: "short" })}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {query.error ? <Notice tone="destructive">{errorText(tt, query.error)}</Notice> : null}
      {!data ? null : data.rooms.length === 0 && data.unassigned.length === 0 ? (
        <Card>
          <Text variant="bodyStrong">{t("empty")}</Text>
          <Text variant="small" tone="mutedForeground">
            {t("emptyHint")}
          </Text>
        </Card>
      ) : (
        <Card style={styles.flush} testID="rooms">
          {data.rooms.map((room, index) => (
            <View key={room.id}>
              {index > 0 ? <Divider /> : null}
              <RoomRow name={room.name} blocks={room.blocks} testID={`room-${room.id}`} />
            </View>
          ))}
          {data.unassigned.length > 0 ? (
            <View>
              {data.rooms.length > 0 ? <Divider /> : null}
              <RoomRow name={t("noRoom")} blocks={data.unassigned} testID="room-none" />
            </View>
          ) : null}
        </Card>
      )}
    </View>
  );
}

function RoomRow({ name, blocks, testID }: { name: string; blocks: RoomBlock[]; testID: string }) {
  const t = useTranslations("dashboard.schedule");
  const { colors } = useTheme();
  const { open } = useOpenPath();
  return (
    <View style={styles.room} testID={testID}>
      <Text variant="bodyStrong">{name}</Text>
      {blocks.length === 0 ? (
        <Text variant="small" tone="mutedForeground">
          {t("free")}
        </Text>
      ) : (
        blocks.map((block) => (
          <Pressable
            key={`${block.groupId}:${block.startTime}`}
            onPress={() => open(`/groups/${block.groupId}`)}
            accessibilityRole="button"
            style={styles.block}
            testID={`block-${block.groupId}`}
          >
            <View style={[styles.mark, { backgroundColor: block.color ?? colors.ring }]} />
            <Text variant="figure" style={styles.time}>
              {block.startTime}–{block.endTime}
            </Text>
            <View style={styles.fill}>
              <Text variant="body" numberOfLines={1}>
                {block.groupName}
              </Text>
              <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                {[block.courseName, block.teacherName].filter(Boolean).join(", ")}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

const FINANCE_CARDS = [
  ["income", "/finance"],
  ["expenses", "/finance"],
  ["profit", "/finance"],
  ["activeBalance", "/finance/investment"],
] as const;

/** The money of a year or one month of it: four sums, the payment types, and the year by months. */
function Finance({
  branchId,
  mask,
  open,
}: {
  branchId: string | null;
  mask: (value: string) => string;
  open: (path: string) => void;
}) {
  const t = useTranslations("dashboard.finance");
  const tf = useTranslations("finance");
  const tt = useTranslations();
  const money = useMoney();
  const date = useDate();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const period = { year, month: month ? Number(month) : null, branchId };
  // Every payment type of the period: the list to choose from, and the answer when none is chosen.
  const all = useFinanceOverview({ ...period, methodId: null }, true);
  const one = useFinanceOverview({ ...period, methodId }, methodId !== null);
  const data: FinanceOverview | undefined = methodId ? one.data : all.data;
  const error = (methodId ? one.error : null) ?? all.error;
  const amount = (value: number) => mask(money(value));
  const monthName = (index: number, withYear = false) =>
    date(
      dayAsDate(`${year}-${String(index + 1).padStart(2, "0")}-01`),
      withYear ? { month: "short", year: "numeric" } : { month: "short" },
    );
  const methods = (all.data?.byMethod ?? []).flatMap((m) =>
    m.id ? [{ value: m.id, label: m.name ?? tf("noMethod") }] : [],
  );
  const largest = Math.max(1, ...(data?.byMethod ?? []).map((m) => m.amount));

  return (
    <View style={styles.section} testID="home-finance">
      <SectionTitle title={t("title")} />
      <View style={styles.controls}>
        <View
          style={[styles.stepper, { borderColor: colors.input, backgroundColor: colors.card }]}
          accessibilityLabel={`${t("year")}: ${year}`}
        >
          <Pressable
            onPress={() => setYear((y) => y - 1)}
            accessibilityRole="button"
            accessibilityLabel={String(year - 1)}
            hitSlop={8}
            style={styles.stepperButton}
            testID="finance-year-prev"
          >
            <ChevronLeft size={18} color={colors.foreground} />
          </Pressable>
          <Text variant="smallStrong" style={styles.number} testID="finance-year">
            {year}
          </Text>
          <Pressable
            onPress={() => setYear((y) => y + 1)}
            disabled={year > thisYear}
            accessibilityRole="button"
            accessibilityLabel={String(year + 1)}
            hitSlop={8}
            style={[styles.stepperButton, year > thisYear ? styles.off : null]}
            testID="finance-year-next"
          >
            <ChevronRight size={18} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.filter}>
          <Select
            compact
            label={t("month")}
            value={month}
            onChange={setMonth}
            clearLabel={t("wholeYear")}
            options={Array.from({ length: 12 }, (_, index) => ({
              value: String(index + 1),
              label: monthName(index),
            }))}
            testID="finance-month"
          />
        </View>
        {methods.length > 1 ? (
          <View style={styles.filter}>
            <Select
              compact
              label={t("method")}
              value={methodId}
              onChange={setMethodId}
              clearLabel={tf("filters.anyMethod")}
              options={methods}
              testID="finance-method"
            />
          </View>
        ) : null}
      </View>
      {error ? <Notice tone="destructive">{errorText(tt, error)}</Notice> : null}
      {data ? (
        <>
          <Grid columns={wide ? 4 : 2}>
            {FINANCE_CARDS.map(([key, path]) => (
              <Card
                key={key}
                onPress={() => open(path)}
                style={styles.tile}
                testID={`finance-${key}`}
              >
                <Text variant="small" tone="mutedForeground">
                  {tf(`kpis.${key}`)}
                </Text>
                <Figure money testID={`finance-${key}-value`}>
                  {amount(data[key])}
                </Figure>
              </Card>
            ))}
          </Grid>
          <View style={wide ? styles.sideBySide : styles.section}>
            <Card style={wide ? styles.fill : undefined} testID="finance-by-method">
              <Text variant="bodyStrong">{tf("byMethod")}</Text>
              {data.byMethod.length === 0 ? (
                <Text variant="small" tone="mutedForeground">
                  {tt("common.nothingFound")}
                </Text>
              ) : (
                data.byMethod.map((m) => (
                  <View key={m.id ?? "none"} style={styles.method}>
                    <View style={styles.between}>
                      <Text variant="body" style={styles.fill} numberOfLines={1}>
                        {m.name ?? tf("noMethod")}
                      </Text>
                      <Text variant="figure" style={styles.number}>
                        {amount(m.amount)}
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
                  label: monthName(index),
                  name: monthName(index, true),
                  first: m.income,
                  second: m.expenses,
                }))}
                legend={{ first: tf("kpis.income"), second: tf("kpis.expenses") }}
                format={amount}
                initial={
                  period.month ? period.month - 1 : year === thisYear ? new Date().getMonth() : 11
                }
                testID="finance-bars"
              />
            </Card>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { alignItems: "flex-end" },
  off: { opacity: 0.35 },
  column: { gap: space[5] },
  section: { gap: space[3] },
  sectionTitle: { gap: 2 },
  sideBySide: { flexDirection: "row", alignItems: "stretch", gap: space[3] },
  welcome: { gap: space[1] },
  controls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  branch: { minWidth: 160, flexGrow: 1, maxWidth: 280 },
  filter: { minWidth: 132, flexGrow: 1, maxWidth: 240 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", margin: -space[2] / 2 },
  tile: { gap: space[1], padding: space[3], minHeight: 84, justifyContent: "space-between" },
  tileTop: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  number: { fontVariant: ["tabular-nums"] },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  step: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] },
  done: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  splitRow: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  splitSums: { flexDirection: "row", gap: space[3] },
  splitLines: { gap: 2 },
  pairCell: { flex: 1, gap: 2 },
  pairLine: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
  days: { flexDirection: "row", borderRadius: radius.md, padding: 3, gap: 3 },
  day: { flex: 1, alignItems: "center", paddingVertical: space[2], borderRadius: radius.md - 3 },
  room: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  block: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 40 },
  mark: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  time: { fontVariant: ["tabular-nums"], minWidth: 96 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  stepperButton: { width: 36, height: 34, alignItems: "center", justifyContent: "center" },
  method: { gap: 6 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  share: { height: 6, borderRadius: 3 },
});
