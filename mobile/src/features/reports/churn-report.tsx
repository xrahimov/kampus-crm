import { useRouter } from "expo-router";
import { Settings2, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  CHURN_BREAKDOWNS,
  reportQuery,
  useChurnOptions,
  useChurnReport,
  useLeaveReasonStep,
  type ChurnBreakdown,
  type ChurnReport,
  type LeaveReason,
  type LeftStudentRow,
  type YesNo,
} from "@/api/office-reports";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Notice, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { centreMonth, useMonthName } from "@/features/finance/period";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import {
  CountBars,
  ExcelOnSite,
  FilterCell,
  Filters,
  Kpis,
  monthBounds,
  OptionFilter,
  Pair,
  Rows,
  Section,
  SeriesBars,
  useDays,
  type SeriesStep,
} from "./parts";

/**
 * Reports, Left students (A-238): who left between two days and what it cost,
 * the leavers by day and by reason, by course, teacher, branch and status,
 * the moves between groups, and the list of who left. With the right to the
 * catalogue, the reasons offered when a student leaves are set up here too.
 */
export function ChurnReportScreen() {
  const t = useTranslations();
  const tr = useTranslations("reports.churn");
  const tf = useTranslations("reports.filters");
  const tg = useTranslations("groups.statuses");
  const me = useMe();
  const router = useRouter();
  const money = useMoney();
  const date = useDate();
  const monthName = useMonthName();
  const { colors } = useTheme();
  const now = centreMonth();
  const [start] = useState(() => monthBounds(now.year, now.month));
  const days = useDays(start);
  const [pickedBranch, setBranch] = useState<string | null>(null);
  const [courseId, setCourse] = useState<string | null>(null);
  const [teacherId, setTeacher] = useState<string | null>(null);
  const [groupId, setGroup] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [discount, setDiscount] = useState<YesNo | null>(null);
  const [by, setBy] = useState<ChurnBreakdown>("course");
  const [reasonsOpen, setReasonsOpen] = useState(false);
  // A branch chosen at the top of the app already narrows every list.
  const branchChoice = !me.activeBranch && me.branches.length > 1;
  const branchId = branchChoice ? pickedBranch : null;
  const filters = {
    from: days.applied.from,
    to: days.applied.to,
    branchId,
    courseId,
    teacherId,
    groupId,
    reason,
    discount,
  };
  const query = useChurnReport(filters);
  const options = useChurnOptions(branchId);
  const mayOpen = can(me, "students.view");

  const header = (
    <Header
      back
      title={tr("title")}
      right={
        can(me, "settings.catalog") && query.data ? (
          <Button
            compact
            variant="outline"
            icon={<Settings2 size={16} color={colors.foreground} />}
            label={tr("manageReasons")}
            onPress={() => setReasonsOpen(true)}
            testID="churn-reasons-open"
          />
        ) : undefined
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const k = report.kpis;
  const breakdown = (key: ChurnBreakdown) =>
    key === "joinedThisMonth"
      ? [{ name: tr("breakdown.joinedThisMonth"), count: report.breakdown.joinedThisMonth }]
      : key === "status"
        ? report.breakdown.status.map((s) => ({
            name: tg.has(s.name) ? tg(s.name) : s.name || "—",
            count: s.count,
          }))
        : report.breakdown[key].map((s) => ({ name: s.name || tr("noReason"), count: s.count }));
  // A day each for up to two months; a longer period has more days than a phone has room for
  // bars, and is added up by month.
  const steps: SeriesStep[] =
    report.dynamics.length <= DAYS_AS_BARS
      ? report.dynamics.map((d) => ({
          label: String(Number(d.date.slice(8))),
          name: date(dayAsDate(d.date), { dateStyle: "medium" }),
          values: [d.count],
        }))
      : leaversByMonth(report.dynamics).map((m) => ({
          label: monthName(m.month),
          name: monthName(m.month, m.year),
          values: [m.count],
        }));
  const reasonNames = [
    ...new Set([
      ...report.reasons.filter((r) => r.kind === "LEAVE").map((r) => r.name),
      ...report.breakdown.reason.map((r) => r.name).filter(Boolean),
    ]),
  ];

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={styles.dates}>
        <View style={styles.fill}>
          <DateField
            label={tf("from")}
            value={days.typed.from}
            onChange={(value) => days.set("from", value)}
            testID="churn-from"
          />
        </View>
        <View style={styles.fill}>
          <DateField
            label={tf("to")}
            value={days.typed.to}
            onChange={(value) => days.set("to", value)}
            error={days.backwards ? t("validation.endAfterStart") : null}
            testID="churn-to"
          />
        </View>
      </View>
      {branchChoice || options.data ? (
        <Filters testID="report-filters">
          {branchChoice ? (
            <FilterCell>
              <Select
                compact
                label={tf("branch")}
                value={pickedBranch}
                onChange={(value) => {
                  setBranch(value);
                  // Courses and groups belong to a branch.
                  setCourse(null);
                  setGroup(null);
                }}
                clearLabel={tf("allBranches")}
                placeholder={tf("allBranches")}
                options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
                testID="churn-branch"
              />
            </FilterCell>
          ) : null}
          {options.data ? (
            <>
              <OptionFilter
                label={tf("course")}
                value={courseId}
                onChange={setCourse}
                options={options.data.courses.map((c) => ({ value: c.id, label: c.name }))}
                testID="churn-course"
              />
              <OptionFilter
                label={tf("teacher")}
                value={teacherId}
                onChange={setTeacher}
                options={options.data.teachers.map((p) => ({ value: p.id, label: p.name }))}
                testID="churn-teacher"
              />
            </>
          ) : null}
        </Filters>
      ) : null}

      <Kpis
        items={[
          {
            key: "churnRate",
            label: tr("kpis.churnRate"),
            value: `${k.churnRate}%`,
            hint: tr("kpis.ofActive", { count: k.activeAtStart }),
          },
          { key: "leftCount", label: tr("kpis.leftCount"), value: String(k.leftCount) },
          {
            key: "lostRevenue",
            label: tr("kpis.lostRevenue"),
            value: money(k.lostRevenue),
            hint: tr("kpis.perMonth"),
          },
          {
            key: "avgLifetime",
            label: tr("kpis.avgLifetime"),
            value:
              k.avgLifetimeMonths === null
                ? "—"
                : tr("kpis.months", { count: k.avgLifetimeMonths }),
          },
        ]}
      />

      <Pair>
        <Section title={tr("dynamicsTitle")} testID="churn-dynamics">
          <SeriesBars
            steps={steps}
            series={[tr("kpis.leftCount")]}
            labelEvery={Math.max(1, Math.ceil(steps.length / 8))}
            empty={tr("noData")}
            testID="churn-days"
          />
        </Section>
        <Section title={tr("reasonsTitle")}>
          <CountBars items={breakdown("reason")} empty={tr("noData")} testID="churn-by-reason" />
        </Section>
      </Pair>

      <Section title={tr("breakdownTitle")} testID="churn-breakdown">
        <Select
          compact
          label={tr("breakdownTitle")}
          value={by}
          onChange={(value) => setBy(value ?? "course")}
          options={CHURN_BREAKDOWNS.map((b) => ({ value: b, label: tr(`breakdown.${b}`) }))}
          testID="churn-by"
        />
        <CountBars items={breakdown(by)} empty={tr("noData")} testID="churn-by-list" />
      </Section>

      <Pair>
        <Section title={tr("transfersTitle")} testID="churn-transfers">
          <View style={styles.figures}>
            <View style={styles.fill}>
              <Text variant="small" tone="mutedForeground">
                {tr("transfers.total")}
              </Text>
              <Text variant="figure" testID="churn-transfers-total">
                {report.transfers.total}
              </Text>
            </View>
            <View style={styles.fill}>
              <Text variant="small" tone="mutedForeground">
                {tr("transfers.leftAfter")}
              </Text>
              <Text variant="figure">{report.transfers.leftAfterPercent}%</Text>
            </View>
          </View>
          <Text variant="small" tone="mutedForeground">
            {tr("transfers.why")}
          </Text>
          <CountBars
            items={report.transfers.reasons.map((r) => ({
              name: r.name || tr("noReason"),
              count: r.count,
            }))}
            empty={tr("noData")}
          />
        </Section>
        <Section title={tr("discountsTitle")} testID="churn-discounts">
          <CountBars
            items={[
              { name: tr("discounts.withDiscount"), count: report.discounts.withDiscount },
              { name: tr("discounts.fullPrice"), count: report.discounts.fullPrice },
            ]}
            empty={tr("noData")}
          />
        </Section>
      </Pair>

      <Text variant="heading" accessibilityRole="header">
        {tr("listTitle")}
      </Text>
      <Filters>
        {options.data ? (
          <OptionFilter
            label={tf("group")}
            value={groupId}
            onChange={setGroup}
            options={options.data.groups.map((g) => ({ value: g.id, label: g.name }))}
            testID="churn-group"
          />
        ) : null}
        <OptionFilter
          label={tr("columns.reason")}
          value={reason}
          onChange={setReason}
          options={reasonNames.map((name) => ({ value: name, label: name }))}
          testID="churn-reason"
        />
        <OptionFilter<YesNo>
          label={tr("columns.discount")}
          value={discount}
          onChange={setDiscount}
          options={[
            { value: "yes", label: tr("discounts.has") },
            { value: "no", label: tr("discounts.none") },
          ]}
          testID="churn-discount"
        />
      </Filters>
      {report.rows.length === 0 ? (
        <EmptyState title={tr("emptyList")} />
      ) : (
        <Rows testID="churn-list">
          {report.rows.map((row) => (
            <LeftCard
              key={row.membershipId}
              row={row}
              onPress={
                mayOpen
                  ? () =>
                      router.push({
                        pathname: "/staff/student/[id]",
                        params: { id: row.studentId },
                      })
                  : undefined
              }
            />
          ))}
        </Rows>
      )}
      <ExcelOnSite path={`/reports/churn${reportQuery({ ...filters })}`} />

      <ReasonsSheet
        open={reasonsOpen}
        onClose={() => setReasonsOpen(false)}
        reasons={report.reasons}
      />
    </Screen>
  );
}

/** The longest period drawn a day at a time. */
const DAYS_AS_BARS = 62;

/** The days of a long period added up by month, in the order the days come. */
export function leaversByMonth(
  days: ChurnReport["dynamics"],
): Array<{ year: number; month: number; count: number }> {
  const months: Array<{ year: number; month: number; count: number }> = [];
  for (const day of days) {
    const year = Number(day.date.slice(0, 4));
    const month = Number(day.date.slice(5, 7));
    const last = months.at(-1);
    if (last && last.year === year && last.month === month) last.count += day.count;
    else months.push({ year, month, count: day.count });
  }
  return months;
}

function LeftCard({ row, onPress }: { row: LeftStudentRow; onPress?: () => void }) {
  const tr = useTranslations("reports.churn");
  const date = useDate();
  return (
    <Card onPress={onPress} style={styles.card} testID={`churn-left-${row.membershipId}`}>
      <View style={styles.between}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
          {row.fullName}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {date(dayAsDate(row.leftAt), { dateStyle: "medium" })}
        </Text>
      </View>
      <Text variant="small" tone="mutedForeground">
        {[row.groupName, row.courseName, row.teacherName].filter(Boolean).join(", ")}
      </Text>
      <View style={styles.badges}>
        <Badge tone={row.reason ? "neutral" : "warning"} label={row.reason ?? tr("noReason")} />
        {row.hasDiscount ? <Badge tone="success" label={tr("columns.discount")} /> : null}
      </View>
      {row.leftByName ? (
        <Text variant="small" tone="mutedForeground">
          {tr("columns.leftBy")}: {row.leftByName}
        </Text>
      ) : null}
      {row.note ? <Text>{row.note}</Text> : null}
    </Card>
  );
}

const KINDS = ["LEAVE", "TRANSFER"] as const;

/** "Set up reasons": the reasons offered when a student is removed from a group or moved. */
function ReasonsSheet({
  open,
  onClose,
  reasons,
}: {
  open: boolean;
  onClose: () => void;
  reasons: ChurnReport["reasons"];
}) {
  const t = useTranslations();
  const tr = useTranslations("reports.churn.reasons");
  const { colors } = useTheme();
  const step = useLeaveReasonStep();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LeaveReason["kind"]>("LEAVE");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setKind("LEAVE");
      step.reset();
    }
  }
  const add = () => {
    const typed = name.trim();
    if (!typed) return;
    step.mutate({ do: "add", name: typed, kind }, { onSuccess: () => setName("") });
  };
  return (
    <Sheet open={open} onClose={onClose} title={tr("title")} testID="churn-reasons">
      <Text variant="small" tone="mutedForeground">
        {tr("hint")}
      </Text>
      {step.error ? (
        <Notice tone="destructive" testID="churn-reasons-problem">
          {errorText(t, step.error)}
        </Notice>
      ) : null}
      {reasons.length === 0 ? (
        <Text tone="mutedForeground">{tr("empty")}</Text>
      ) : (
        <View>
          {reasons.map((reason, index) => (
            <View key={reason.id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.reason} testID={`churn-reason-${reason.id}`}>
                <View style={styles.fill}>
                  <Check
                    label={reason.name}
                    hint={tr(`kinds.${reason.kind}`)}
                    value={reason.isActive}
                    onChange={() => step.mutate({ do: "toggle", reason })}
                    disabled={step.isPending}
                    testID={`churn-reason-${reason.id}-active`}
                  />
                </View>
                <Pressable
                  onPress={() => step.mutate({ do: "remove", reason })}
                  disabled={step.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("common.delete")}: ${reason.name}`}
                  hitSlop={8}
                  style={styles.remove}
                  testID={`churn-reason-${reason.id}-remove`}
                >
                  <Trash2 size={18} color={colors.destructive} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      <Divider />
      <Field
        label={tr("newReason")}
        value={name}
        onChangeText={setName}
        maxLength={100}
        testID="churn-reasons-name"
      />
      <Segmented
        options={KINDS.map((value) => ({ value, label: tr(`kinds.${value}`) }))}
        value={kind}
        onChange={setKind}
        testID="churn-reasons-kind"
      />
      <Button
        label={tr("add")}
        onPress={add}
        loading={step.isPending}
        disabled={!name.trim()}
        testID="churn-reasons-add"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  dates: { flexDirection: "row", gap: space[3] },
  figures: { flexDirection: "row", gap: space[3] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  card: { flex: 1, gap: space[1] },
  reason: { flexDirection: "row", alignItems: "center", gap: space[2] },
  remove: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
