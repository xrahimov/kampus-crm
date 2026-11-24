import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  STUDENT_REPORT_STATUSES,
  useStudentsReport,
  type StudentReportStatus,
} from "@/api/office-reports";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Header } from "@/components/header";
import { Card, EmptyState, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import {
  ReportExcel,
  Filters,
  Kpis,
  monthBounds,
  OptionFilter,
  PeriodFilters,
  Rows,
  Stats,
  useDays,
  useReportPeriod,
} from "./parts";

const TABS = ["attendance", "performance"] as const;
type Tab = (typeof TABS)[number];

/**
 * Reports, Students (A-238): how many students there are and how they attend
 * and learn, then attendance group by group, or each student's grades. The
 * days start as the month's and can be typed over.
 */
export function StudentsReportScreen() {
  const t = useTranslations();
  const tr = useTranslations("reports.students");
  const tf = useTranslations("reports.filters");
  const tg = useTranslations("groups.statuses");
  const me = useMe();
  const router = useRouter();
  const state = useReportPeriod();
  const days = useDays(monthBounds(state.period.year, state.period.month));
  const [tab, setTab] = useState<Tab>("attendance");
  const [groupId, setGroup] = useState<string | null>(null);
  const [teacherId, setTeacher] = useState<string | null>(null);
  const [status, setStatus] = useState<StudentReportStatus | null>(null);
  const [page, setPage] = useState(1);
  const filters = {
    ...state.period,
    from: days.applied.from,
    to: days.applied.to,
    groupId,
    teacherId,
    status,
    page,
  };
  const query = useStudentsReport(filters);

  const header = <Header back title={tr("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const k = report.kpis;
  const totals = report.attendance.totals;
  const performance = report.performance;
  const pages = Math.max(1, Math.ceil(performance.total / performance.pageSize));
  const firstShown = (performance.page - 1) * performance.pageSize + 1;
  const mayOpenStudent = can(me, "students.view");
  const mayOpenGroup = can(me, "groups.view");
  /** Any other choice starts the performance list from its first page. */
  const narrowed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Filters testID="report-filters">
        <PeriodFilters
          state={state}
          onChange={() => {
            // Groups belong to a branch, and the pages to what was chosen before.
            setGroup(null);
            setPage(1);
          }}
        />
      </Filters>
      <View style={styles.dates}>
        <View style={styles.fill}>
          <DateField
            label={tf("from")}
            value={days.typed.from}
            onChange={(value) => {
              days.set("from", value);
              setPage(1);
            }}
            testID="students-from"
          />
        </View>
        <View style={styles.fill}>
          <DateField
            label={tf("to")}
            value={days.typed.to}
            onChange={(value) => {
              days.set("to", value);
              setPage(1);
            }}
            error={days.backwards ? t("validation.endAfterStart") : null}
            testID="students-to"
          />
        </View>
      </View>
      <Kpis
        columns={3}
        items={[
          { key: "total", label: tr("kpis.total"), value: String(k.total) },
          { key: "newInPeriod", label: tr("kpis.newInPeriod"), value: String(k.newInPeriod) },
          { key: "multiCourse", label: tr("kpis.multiCourse"), value: String(k.multiCourse) },
          {
            key: "attendance",
            label: tr("kpis.attendance"),
            value: k.attendancePercent === null ? "—" : `${k.attendancePercent}%`,
          },
          {
            key: "gradeAverage",
            label: tr("kpis.gradeAverage"),
            value: k.gradeAverage === null ? "—" : String(k.gradeAverage),
          },
        ]}
      />
      <Segmented
        options={TABS.map((value) => ({ value, label: tr(`tabs.${value}`) }))}
        value={tab}
        onChange={setTab}
        testID="students-tab"
      />
      <Filters>
        <OptionFilter
          label={tf("group")}
          value={groupId}
          onChange={narrowed(setGroup)}
          options={report.options.groups.map((g) => ({ value: g.id, label: g.name }))}
          testID="students-group"
        />
        <OptionFilter
          label={tf("teacher")}
          value={teacherId}
          onChange={narrowed(setTeacher)}
          options={report.options.teachers.map((p) => ({ value: p.id, label: p.fullName }))}
          testID="students-teacher"
        />
        <OptionFilter<StudentReportStatus>
          label={tf("status")}
          value={status}
          onChange={narrowed(setStatus)}
          allLabel={tr("notArchived")}
          options={STUDENT_REPORT_STATUSES.map((s) => ({
            value: s,
            label: s === "ALL" ? tf("all") : tg(s),
          }))}
          testID="students-status"
        />
      </Filters>

      {tab === "attendance" ? (
        <>
          <Card testID="students-attendance-totals">
            <Stats
              columns={4}
              items={[
                { label: tr("totals.expected"), value: String(totals.expected) },
                { label: tr("totals.present"), value: String(totals.present), tone: "success" },
                { label: tr("totals.absent"), value: String(totals.absent), tone: "destructive" },
                { label: tr("totals.unmarked"), value: String(totals.unmarked) },
              ]}
            />
          </Card>
          {report.attendance.rows.length === 0 ? (
            <EmptyState title={tr("empty")} />
          ) : (
            <Rows testID="students-attendance">
              {report.attendance.rows.map((row) => (
                <Card
                  key={row.groupId}
                  onPress={
                    mayOpenGroup
                      ? () =>
                          router.push({
                            pathname: "/staff/group/[id]",
                            params: { id: row.groupId },
                          })
                      : undefined
                  }
                  style={styles.card}
                  testID={`students-group-${row.groupId}`}
                >
                  <View>
                    <Text variant="bodyStrong">{row.groupName}</Text>
                    {row.teacherName ? (
                      <Text variant="small" tone="mutedForeground">
                        {row.teacherName}
                      </Text>
                    ) : null}
                  </View>
                  <Stats
                    items={[
                      { label: tr("columns.students"), value: String(row.students) },
                      { label: tr("columns.lessons"), value: String(row.lessons) },
                      { label: tr("columns.unmarked"), value: String(row.unmarked) },
                      {
                        label: tr("columns.present"),
                        value: String(row.present),
                        tone: "success",
                      },
                      {
                        label: tr("columns.absent"),
                        value: String(row.absent),
                        tone: "destructive",
                      },
                    ]}
                  />
                </Card>
              ))}
            </Rows>
          )}
        </>
      ) : performance.rows.length === 0 ? (
        <EmptyState title={tr("empty")} />
      ) : (
        <>
          <Rows testID="students-performance">
            {performance.rows.map((row) => (
              <Card
                key={row.studentId}
                onPress={
                  mayOpenStudent
                    ? () =>
                        router.push({
                          pathname: "/staff/student/[id]",
                          params: { id: row.studentId },
                        })
                    : undefined
                }
                style={styles.person}
                testID={`students-student-${row.studentId}`}
              >
                <View style={styles.between}>
                  <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
                    {row.fullName}
                  </Text>
                  <View style={styles.end}>
                    <Text variant="small" tone="mutedForeground">
                      {tr("columns.average")}
                    </Text>
                    <Text variant="figure">{row.average ?? "—"}</Text>
                  </View>
                </View>
                <Text variant="small" tone="mutedForeground">
                  {[...row.courses, ...row.teachers].join(", ")}
                </Text>
                {row.grades.map((grade) => (
                  <View key={grade.groupName} style={styles.between}>
                    <Text style={styles.fill} numberOfLines={1}>
                      {grade.groupName}
                    </Text>
                    <Text variant="bodyStrong">{grade.average ?? "—"}</Text>
                  </View>
                ))}
              </Card>
            ))}
          </Rows>
          <View style={styles.pager}>
            <Button
              compact
              variant="outline"
              label={t("common.pagination.previous")}
              disabled={performance.page <= 1}
              onPress={() => setPage(performance.page - 1)}
              testID="students-previous"
            />
            <Text variant="small" tone="mutedForeground" testID="students-range">
              {t("common.pagination.range", {
                from: firstShown,
                to: firstShown + performance.rows.length - 1,
                total: performance.total,
              })}
            </Text>
            <Button
              compact
              variant="outline"
              label={t("common.pagination.next")}
              disabled={performance.page >= pages}
              onPress={() => setPage(performance.page + 1)}
              testID="students-next"
            />
          </View>
        </>
      )}
      <ReportExcel path="/reports/students/export.xlsx" params={{ ...filters, tab }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  end: { alignItems: "flex-end" },
  dates: { flexDirection: "row", gap: space[3] },
  card: { flex: 1, gap: space[3] },
  person: { flex: 1, gap: space[1] },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
});
