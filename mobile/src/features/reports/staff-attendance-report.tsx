import { Check as CheckIcon, Clock, Minus, X, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  STAFF_ATTENDANCE_TABS,
  useManualCheck,
  useSaveWorkSchedule,
  useStaffAttendance,
  type DayStatus,
  type ScheduleRow,
  type StaffAttendanceReport,
  type StaffAttendanceTab,
  type StaffDayRow,
  type StaffMonthRow,
  type StaffWeekRow,
} from "@/api/office-staff-attendance";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { DateField } from "@/components/date-field";
import { Header } from "@/components/header";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { TimeField, typedToTime } from "@/components/time-field";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { Filters, Kpis, PeriodFilters, Rows, Section, Stats, Tabs, useReportPeriod } from "./parts";

/** Monday first, by the server's numbers (0 is Sunday). */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

/** A length of time as the site writes it: "8:05", "25m", and a dash for none. */
export function minutesText(n: number): string {
  if (n === 0) return "—";
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}m`;
}

/** A weekday (0 is Sunday) as a date, for spelling its name: 2024-01-07 was a Sunday. */
const weekdayDate = (weekday: number) =>
  dayAsDate(`2024-01-${String(7 + weekday).padStart(2, "0")}`);

const STATUS_TONE = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "destructive",
  NOT_WORKING_DAY: "neutral",
  NO_SCHEDULE: "neutral",
} as const;

/**
 * Reports, Staff attendance (A-239): the day's figures and the site's five
 * tabs. Daily, weekly and monthly lists, the month's statistics with a bar a
 * day, and the working hours each person is expected to keep. Someone who may
 * change staff corrects a check-in or check-out and sets a working week.
 */
export function StaffAttendanceReportScreen() {
  const t = useTranslations("staffAttendance");
  const me = useMe();
  const state = useReportPeriod();
  const [tab, setTab] = useState<StaffAttendanceTab>("daily");
  /** Null until the day field is touched: the server then picks the day itself. */
  const [day, setDay] = useState<{ typed: string | null; applied: string | null } | null>(null);
  const [checking, setChecking] = useState<StaffDayRow | null>(null);
  const [planning, setPlanning] = useState<ScheduleRow | null>(null);
  const query = useStaffAttendance({ ...state.period, date: day?.applied ?? null });
  const mayEdit = can(me, "staff.update");

  const header = <Header back title={t("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const k = report.kpis;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Filters testID="report-filters">
        {/* Another month has its own days: the server picks one again. */}
        <PeriodFilters state={state} onChange={() => setDay(null)} />
      </Filters>
      {tab === "daily" || tab === "weekly" ? (
        <DateField
          label={t("filters.date")}
          value={day ? day.typed : report.date}
          onChange={(value) =>
            setDay({ typed: value, applied: value ?? day?.applied ?? report.date })
          }
          testID="attendance-date"
        />
      ) : null}
      <Kpis
        items={[
          { key: "total", label: t("kpis.total"), value: String(k.total) },
          { key: "cameToday", label: t("kpis.cameToday"), value: String(k.cameToday) },
          { key: "lateToday", label: t("kpis.lateToday"), value: String(k.lateToday) },
          { key: "absentToday", label: t("kpis.absentToday"), value: String(k.absentToday) },
        ]}
      />
      <Tabs
        options={STAFF_ATTENDANCE_TABS.map((value) => ({ value, label: t(`tabs.${value}`) }))}
        value={tab}
        onChange={setTab}
        testID="attendance-tab"
      />

      {report.daily.length === 0 ? (
        <EmptyState title={t("noStaff")} />
      ) : tab === "daily" ? (
        <Rows testID="attendance-daily">
          {report.daily.map((row) => (
            <DayCard
              key={row.userId}
              row={row}
              onPress={mayEdit ? () => setChecking(row) : undefined}
            />
          ))}
        </Rows>
      ) : tab === "weekly" ? (
        <Rows testID="attendance-weekly">
          {report.weekly.rows.map((row) => (
            <WeekCard key={row.userId} row={row} />
          ))}
        </Rows>
      ) : tab === "monthly" ? (
        <Rows testID="attendance-monthly">
          {report.monthly.map((row) => (
            <MonthCard key={row.userId} row={row} />
          ))}
        </Rows>
      ) : tab === "statistics" ? (
        <Statistics statistics={report.statistics} />
      ) : (
        <Rows testID="attendance-schedules">
          {report.schedules.map((row) => (
            <ScheduleCard
              key={row.userId}
              row={row}
              onPress={mayEdit ? () => setPlanning(row) : undefined}
            />
          ))}
        </Rows>
      )}

      <ManualCheckSheet row={checking} date={report.date} onClose={() => setChecking(null)} />
      <ScheduleSheet row={planning} onClose={() => setPlanning(null)} />
    </Screen>
  );
}

function StatusBadge({ status, testID }: { status: DayStatus; testID?: string }) {
  const t = useTranslations("staffAttendance.statuses");
  return <Badge tone={STATUS_TONE[status]} label={t(status)} testID={testID} />;
}

function DayCard({ row, onPress }: { row: StaffDayRow; onPress?: () => void }) {
  const t = useTranslations("staffAttendance.columns");
  const time = (value: string | null) => value ?? "—";
  // A day off with nothing recorded has no times to show: the name and the badge say it all.
  const idle =
    (row.status === "NOT_WORKING_DAY" || row.status === "NO_SCHEDULE") &&
    !row.checkIn &&
    !row.checkOut;
  return (
    <Card onPress={onPress} style={styles.card} testID={`attendance-day-${row.userId}`}>
      <View style={styles.between}>
        <View style={styles.fill}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {row.fullName}
          </Text>
          {row.branchName ? (
            <Text variant="small" tone="mutedForeground">
              {row.branchName}
            </Text>
          ) : null}
        </View>
        <StatusBadge status={row.status} testID={`attendance-day-${row.userId}-status`} />
      </View>
      {idle ? null : (
        <Stats
          items={[
            { label: t("expectedIn"), value: time(row.expectedIn) },
            { label: t("checkIn"), value: time(row.checkIn) },
            {
              label: t("late"),
              value: minutesText(row.lateMinutes),
              tone: row.lateMinutes > 0 ? "destructive" : "foreground",
            },
            { label: t("expectedOut"), value: time(row.expectedOut) },
            { label: t("checkOut"), value: time(row.checkOut) },
            { label: t("earlyLeave"), value: minutesText(row.earlyLeaveMinutes) },
            { label: t("worked"), value: minutesText(row.workedMinutes) },
          ]}
        />
      )}
    </Card>
  );
}

/** The mark of a day in the week's row: a sign as well as a colour, so it reads without colour. */
const DAY_SIGN: Record<DayStatus, LucideIcon | null> = {
  PRESENT: CheckIcon,
  LATE: Clock,
  ABSENT: X,
  NOT_WORKING_DAY: Minus,
  NO_SCHEDULE: null,
};

function WeekCard({ row }: { row: StaffWeekRow }) {
  const ts = useTranslations("staffAttendance.statuses");
  const date = useDate();
  const { colors } = useTheme();
  const ink = (status: DayStatus) =>
    status === "PRESENT"
      ? colors.success
      : status === "LATE"
        ? colors.warning
        : status === "ABSENT"
          ? colors.destructive
          : colors.mutedForeground;
  return (
    <Card style={styles.card} testID={`attendance-week-${row.userId}`}>
      <Text variant="bodyStrong" numberOfLines={2}>
        {row.fullName}
      </Text>
      <View style={styles.week}>
        {row.days.map((d) => {
          const Sign = DAY_SIGN[d.status];
          const when = dayAsDate(d.date);
          return (
            <View
              key={d.date}
              accessible
              accessibilityLabel={`${date(when, { day: "numeric", month: "short" })}: ${ts(d.status)}${d.checkIn ? `, ${d.checkIn}` : ""}`}
              style={styles.weekDay}
              testID={`attendance-week-${row.userId}-${d.date}`}
            >
              <Text variant="small" tone="mutedForeground" numberOfLines={1} style={styles.tiny}>
                {date(when, { weekday: "short" })}
              </Text>
              <Text variant="smallStrong">{Number(d.date.slice(8, 10))}</Text>
              <View style={[styles.sign, { borderColor: ink(d.status) }]}>
                {Sign ? <Sign size={14} color={ink(d.status)} strokeWidth={2.5} /> : null}
              </View>
              <Text variant="small" tone="mutedForeground" numberOfLines={1} style={styles.tiny}>
                {d.checkIn ?? " "}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function MonthCard({ row }: { row: StaffMonthRow }) {
  const t = useTranslations("staffAttendance.columns");
  return (
    <Card style={styles.card} testID={`attendance-month-${row.userId}`}>
      <Text variant="bodyStrong" numberOfLines={2}>
        {row.fullName}
      </Text>
      {row.branchName ? (
        <Text variant="small" tone="mutedForeground">
          {row.branchName}
        </Text>
      ) : null}
      <Stats
        items={[
          { label: t("workingDays"), value: String(row.workingDays) },
          { label: t("presentDays"), value: String(row.presentDays) },
          {
            label: t("lateDays"),
            value: String(row.lateDays),
            tone: row.lateDays > 0 ? "destructive" : "foreground",
          },
          {
            label: t("absentDays"),
            value: String(row.absentDays),
            tone: row.absentDays > 0 ? "destructive" : "foreground",
          },
          { label: t("worked"), value: minutesText(row.workedMinutes) },
          { label: t("late"), value: minutesText(row.lateMinutes) },
        ]}
      />
    </Card>
  );
}

function Statistics({ statistics }: { statistics: StaffAttendanceReport["statistics"] }) {
  const t = useTranslations("staffAttendance.stats");
  return (
    <View style={styles.block} testID="attendance-statistics">
      <Card>
        <Stats
          items={[
            { label: t("attendanceRate"), value: `${statistics.attendanceRate}%` },
            { label: t("punctualityRate"), value: `${statistics.punctualityRate}%` },
            { label: t("avgWorked"), value: minutesText(statistics.avgWorkedMinutes) },
          ]}
        />
      </Card>
      <Section title={t("byDay")}>
        <DayStacks days={statistics.byDay} />
      </Section>
    </View>
  );
}

const PLOT = 132;
const GAP = 2;

/**
 * A bar for each day of the month: how many were on time, late and away, one
 * on another on one scale. These are states, so they wear the colours the
 * same states have in the lists (green, amber, red) and never colour alone:
 * the order in the bar is fixed, the parts have a gap between them, the legend
 * names them and the pressed day's numbers are written out under the plot.
 */
function DayStacks({ days }: { days: StaffAttendanceReport["statistics"]["byDay"] }) {
  const ts = useTranslations("staffAttendance.statuses");
  const t = useTranslations();
  const date = useDate();
  const { colors } = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const parts = [
    { key: "present", name: ts("PRESENT"), color: colors.success },
    { key: "late", name: ts("LATE"), color: colors.warning },
    { key: "absent", name: ts("ABSENT"), color: colors.destructive },
  ] as const;
  const top = Math.max(0, ...days.map((d) => d.present + d.late + d.absent));
  if (days.length === 0 || top <= 0) {
    return (
      <Text variant="small" tone="mutedForeground" testID="attendance-by-day-empty">
        {t("common.nothingFound")}
      </Text>
    );
  }
  const lastWithValue = days.reduce(
    (found, d, index) => (d.present + d.late + d.absent > 0 ? index : found),
    0,
  );
  const at = Math.min(picked ?? lastWithValue, days.length - 1);
  const shown = days[at];
  const spelled = (iso: string) => date(dayAsDate(iso), { dateStyle: "medium" });
  const words = (d: (typeof days)[number]) =>
    `${spelled(d.date)}. ${parts.map((p) => `${p.name}: ${d[p.key]}`).join(". ")}`;
  return (
    <View style={styles.chart} testID="attendance-by-day">
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.key} style={styles.key}>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <Text variant="small" tone="mutedForeground">
              {p.name}
            </Text>
          </View>
        ))}
      </View>
      <View style={[styles.plot, { borderBottomColor: colors.border }]}>
        {days.map((d, index) => (
          <Pressable
            key={d.date}
            onPress={() => setPicked(index)}
            accessibilityRole="button"
            accessibilityState={{ selected: index === at }}
            accessibilityLabel={words(d)}
            style={[styles.step, index === at ? { backgroundColor: colors.muted } : null]}
            testID={`attendance-by-day-${index}`}
          >
            {/* Drawn from the top down: away, late, then on time on the baseline. */}
            {[...parts].reverse().map((p) =>
              d[p.key] > 0 ? (
                <View
                  key={p.key}
                  style={[
                    styles.part,
                    {
                      height: Math.max(2, (d[p.key] / top) * PLOT - GAP),
                      backgroundColor: p.color,
                    },
                  ]}
                />
              ) : null,
            )}
          </Pressable>
        ))}
      </View>
      <View style={styles.labels}>
        {days.map((d, index) => (
          <Text
            key={d.date}
            variant="small"
            tone={index === at ? "foreground" : "mutedForeground"}
            numberOfLines={1}
            style={styles.label}
          >
            {index % 5 === 0 || index === at ? String(Number(d.date.slice(8, 10))) : ""}
          </Text>
        ))}
      </View>
      {shown ? (
        <View
          style={[styles.picked, { backgroundColor: colors.muted }]}
          testID="attendance-by-day-picked"
        >
          <Text variant="smallStrong">{spelled(shown.date)}</Text>
          <View style={styles.sums}>
            {parts.map((p) => (
              <View key={p.key} style={styles.sum}>
                <View style={styles.key}>
                  <View style={[styles.swatch, { backgroundColor: p.color }]} />
                  <Text variant="small" tone="mutedForeground">
                    {p.name}
                  </Text>
                </View>
                <Text variant="figure" style={styles.number}>
                  {shown[p.key]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ScheduleCard({ row, onPress }: { row: ScheduleRow; onPress?: () => void }) {
  const date = useDate();
  const { wide } = useLayout();
  return (
    <Card onPress={onPress} style={styles.card} testID={`attendance-schedule-${row.userId}`}>
      <Text variant="bodyStrong" numberOfLines={2}>
        {row.fullName}
      </Text>
      <Stats
        columns={wide ? 4 : 3}
        items={WEEKDAYS.map((weekday) => {
          const d = row.days[weekday];
          return {
            label: date(weekdayDate(weekday), { weekday: "short" }),
            value: d ? `${d.start}–${d.end}` : "—",
          };
        })}
      />
    </Card>
  );
}

/** A manager puts in or corrects when someone came and left on the day shown. */
function ManualCheckSheet({
  row,
  date: day,
  onClose,
}: {
  row: StaffDayRow | null;
  date: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const ta = useTranslations("staffAttendance");
  const date = useDate();
  const save = useManualCheck();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [seen, setSeen] = useState<string | null>(null);
  const key = row ? `${row.userId}:${day}` : null;
  if (key !== seen) {
    setSeen(key);
    if (row) {
      setCheckIn(row.checkIn ?? "");
      setCheckOut(row.checkOut ?? "");
      save.reset();
    }
  }
  // An empty field takes the time away; a half-typed one is not sent.
  const unfinished = (text: string) => text.trim() !== "" && typedToTime(text) === null;
  const submit = () => {
    if (!row || unfinished(checkIn) || unfinished(checkOut)) return;
    save.mutate(
      {
        userId: row.userId,
        date: day,
        checkIn: typedToTime(checkIn),
        checkOut: typedToTime(checkOut),
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={ta("manualCheck", { name: row?.fullName ?? "" })}
      testID="manual-check"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="manual-check-save"
        />
      }
    >
      <View style={styles.form}>
        <Text tone="mutedForeground">{date(dayAsDate(day), { dateStyle: "medium" })}</Text>
        {save.error ? (
          <Notice tone="destructive" testID="manual-check-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        <View style={styles.pair}>
          <View style={styles.fill}>
            <TimeField
              key={`in:${key}`}
              label={ta("columns.checkIn")}
              value={typedToTime(checkIn)}
              onChange={() => undefined}
              onText={setCheckIn}
              testID="manual-check-in"
            />
          </View>
          <View style={styles.fill}>
            <TimeField
              key={`out:${key}`}
              label={ta("columns.checkOut")}
              value={typedToTime(checkOut)}
              onChange={() => undefined}
              onText={setCheckOut}
              testID="manual-check-out"
            />
          </View>
        </View>
      </View>
    </Sheet>
  );
}

interface DayDraft {
  on: boolean;
  start: string | null;
  end: string | null;
}

/** "Work schedule": the working days of one person and the hours expected on each. */
function ScheduleSheet({ row, onClose }: { row: ScheduleRow | null; onClose: () => void }) {
  const t = useTranslations();
  const ta = useTranslations("staffAttendance");
  const date = useDate();
  const save = useSaveWorkSchedule();
  const [days, setDays] = useState<DayDraft[]>([]);
  const [tried, setTried] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const key = row?.userId ?? null;
  if (key !== seen) {
    setSeen(key);
    if (row) {
      setDays(
        Array.from({ length: 7 }, (_, weekday) => {
          const d = row.days[weekday];
          return d
            ? { on: true, start: d.start, end: d.end }
            : { on: false, start: "09:00", end: "18:00" };
        }),
      );
      setTried(false);
      save.reset();
    }
  }
  const change = (weekday: number, patch: Partial<DayDraft>) =>
    setDays((all) => all.map((d, index) => (index === weekday ? { ...d, ...patch } : d)));
  const wrong = (d: DayDraft) => d.on && (!d.start || !d.end || d.end <= d.start);
  const submit = () => {
    if (!row) return;
    if (days.some(wrong)) {
      setTried(true);
      return;
    }
    save.mutate(
      {
        userId: row.userId,
        days: days.flatMap((d, weekday) =>
          d.on && d.start && d.end ? [{ weekday, start: d.start, end: d.end }] : [],
        ),
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={ta("scheduleFor", { name: row?.fullName ?? "" })}
      testID="schedule"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="schedule-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {ta("scheduleHint")}
        </Text>
        {save.error ? (
          <Notice tone="destructive" testID="schedule-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        {WEEKDAYS.map((weekday, index) => {
          const d = days[weekday] ?? { on: false, start: "09:00", end: "18:00" };
          return (
            <View key={weekday} style={styles.dayForm}>
              {index > 0 ? <Divider /> : null}
              <Check
                label={date(weekdayDate(weekday), { weekday: "long" })}
                value={d.on}
                onChange={(on) => change(weekday, { on })}
                testID={`schedule-day-${weekday}`}
              />
              {d.on ? (
                <View style={styles.pair}>
                  <View style={styles.fill}>
                    <TimeField
                      label={ta("columns.expectedIn")}
                      value={d.start}
                      onChange={(start) => change(weekday, { start })}
                      error={tried && !d.start ? t("validation.time") : null}
                      testID={`schedule-start-${weekday}`}
                    />
                  </View>
                  <View style={styles.fill}>
                    <TimeField
                      label={ta("columns.expectedOut")}
                      value={d.end}
                      onChange={(end) => change(weekday, { end })}
                      error={
                        tried && !d.end
                          ? t("validation.time")
                          : tried && d.start && d.end && d.end <= d.start
                            ? t("mobile.reports.endAfterStart")
                            : null
                      }
                      testID={`schedule-end-${weekday}`}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  card: { flex: 1, gap: space[2] },
  block: { gap: space[4] },
  week: { flexDirection: "row" },
  weekDay: { flex: 1, alignItems: "center", gap: 2 },
  tiny: { fontSize: 11 },
  sign: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  form: { gap: space[3] },
  dayForm: { gap: space[2] },
  pair: { flexDirection: "row", gap: space[3] },
  number: { fontVariant: ["tabular-nums"] },
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
    alignItems: "stretch",
    gap: GAP,
    paddingHorizontal: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  part: { alignSelf: "center", width: "100%", maxWidth: 14, minWidth: 3, borderRadius: 2 },
  labels: { flexDirection: "row" },
  label: { flex: 1, textAlign: "center", fontSize: 11 },
  picked: { borderRadius: 10, padding: space[3], gap: space[2] },
  sums: { flexDirection: "row", flexWrap: "wrap", columnGap: space[6], rowGap: space[2] },
  sum: { gap: 2 },
});
