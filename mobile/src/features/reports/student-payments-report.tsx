import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  studentPaymentsQuery,
  useStudentPayments,
  useStudentPaymentsOptions,
  type StudentPaymentRow,
  type YesNo,
} from "@/api/office-reports";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { useMonthName } from "@/features/finance/period";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { ReportExcel, Filters, OptionFilter, PeriodFilters, Rows, useReportPeriod } from "./parts";

/**
 * Reports, Student payments (A-238): every payment of the month, newest
 * first, with how many there are and what they add up to. The month is the
 * one paid for, or with **By payment date** the one the money came in.
 */
export function StudentPaymentsReportScreen() {
  const t = useTranslations();
  const tr = useTranslations("reports.studentPayments");
  const tf = useTranslations("reports.filters");
  const me = useMe();
  const router = useRouter();
  const money = useMoney();
  const state = useReportPeriod();
  const [byPaidAt, setByPaidAt] = useState(false);
  const [typed, setTyped] = useState("");
  const [groupId, setGroup] = useState<string | null>(null);
  const [paymentMethodId, setMethod] = useState<string | null>(null);
  const [teacherId, setTeacher] = useState<string | null>(null);
  const [courseId, setCourse] = useState<string | null>(null);
  const [bonus, setBonus] = useState<YesNo | null>(null);
  const [receivedById, setReceivedBy] = useState<string | null>(null);
  const q = useRested(typed);
  const filters = {
    ...state.period,
    byPaidAt,
    q,
    groupId,
    paymentMethodId,
    teacherId,
    courseId,
    bonus,
    receivedById,
  };
  const query = useStudentPayments(filters);
  const options = useStudentPaymentsOptions(state.period.branchId);
  const first = query.data?.pages[0];
  const rows = (query.data?.pages ?? []).flatMap((page) => page.items);
  const mayOpen = can(me, "students.view");
  // Groups and courses belong to a branch: another branch starts without them.
  const otherBranch = () => {
    setGroup(null);
    setCourse(null);
  };

  return (
    <Screen
      header={<Header back title={tr("title")} />}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      {first ? (
        <Text tone="mutedForeground" testID="student-payments-summary">
          {tr("summary", { count: first.total, amount: money(first.totalAmount) })}
        </Text>
      ) : null}
      <Check
        label={tr("byPaidAt")}
        value={byPaidAt}
        onChange={setByPaidAt}
        testID="student-payments-by-paid-at"
      />
      <Field
        label={tf("search")}
        value={typed}
        onChangeText={setTyped}
        placeholder={tf("searchStudent")}
        autoCorrect={false}
        testID="student-payments-search"
      />
      <Filters testID="report-filters">
        <PeriodFilters state={state} onChange={otherBranch} />
        <OptionFilter
          label={tf("group")}
          value={groupId}
          onChange={setGroup}
          options={(options.data?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
          testID="student-payments-group"
        />
        <OptionFilter
          label={tf("method")}
          value={paymentMethodId}
          onChange={setMethod}
          options={(options.data?.methods ?? []).map((m) => ({ value: m.id, label: m.name }))}
          testID="student-payments-method"
        />
        <OptionFilter
          label={tf("teacher")}
          value={teacherId}
          onChange={setTeacher}
          options={(options.data?.teachers ?? []).map((p) => ({ value: p.id, label: p.fullName }))}
          testID="student-payments-teacher"
        />
        <OptionFilter
          label={tf("course")}
          value={courseId}
          onChange={setCourse}
          options={(options.data?.courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
          testID="student-payments-course"
        />
        <OptionFilter<YesNo>
          label={tr("bonus")}
          value={bonus}
          onChange={setBonus}
          options={[
            { value: "yes", label: tr("withBonus") },
            { value: "no", label: tr("withoutBonus") },
          ]}
          testID="student-payments-bonus"
        />
        <OptionFilter
          label={tr("receivedBy")}
          value={receivedById}
          onChange={setReceivedBy}
          options={(options.data?.staff ?? []).map((p) => ({ value: p.id, label: p.fullName }))}
          testID="student-payments-received-by"
        />
      </Filters>
      {options.error ? <Notice tone="destructive">{errorText(t, options.error)}</Notice> : null}
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
      ) : rows.length === 0 ? (
        <EmptyState title={tr("empty")} />
      ) : (
        <>
          <Rows testID="student-payments-list">
            {rows.map((row) => (
              <PaymentCard
                key={row.id}
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
          {query.hasNextPage ? (
            <Button
              variant="outline"
              label={t("mobile.studentsPage.more")}
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
              style={styles.start}
              testID="student-payments-more"
            />
          ) : null}
        </>
      )}
      <ReportExcel
        path="/reports/student-payments/export.xlsx"
        params={studentPaymentsQuery(filters)}
      />
    </Screen>
  );
}

function PaymentCard({ row, onPress }: { row: StudentPaymentRow; onPress?: () => void }) {
  const tr = useTranslations("reports.studentPayments");
  const money = useMoney();
  const date = useDate();
  const monthName = useMonthName();
  const [year, month] = row.effectiveMonth.split("-").map(Number);
  return (
    <Card onPress={onPress} style={styles.card} testID={`student-payment-${row.id}`}>
      <View style={styles.between}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
          {row.studentName}
        </Text>
        <View style={styles.end}>
          <Text variant="figure" style={styles.number}>
            {money(row.amount)}
          </Text>
          {row.refunded > 0 ? (
            <Text variant="small" tone="destructive" style={styles.number}>
              −{money(row.refunded)}
            </Text>
          ) : null}
        </View>
      </View>
      <Text variant="small" tone="mutedForeground">
        {[row.groupName, row.teacherName].filter(Boolean).join(", ")}
      </Text>
      <Text variant="small" tone="mutedForeground">
        {[
          date(dayAsDate(row.paidAt), { dateStyle: "medium" }),
          `${tr("columns.effectiveMonth")}: ${monthName(month ?? 1, year)}`,
          row.methodName,
        ]
          .filter(Boolean)
          .join(", ")}
      </Text>
      {row.bonus > 0 ? (
        <Text variant="small" tone="mutedForeground">
          {tr("columns.bonus")}: {money(row.bonus)}
        </Text>
      ) : null}
      {row.receivedByName ? (
        <Text variant="small" tone="mutedForeground">
          {tr("columns.receivedBy")}: {row.receivedByName}
        </Text>
      ) : null}
      {row.comment ? <Text>{row.comment}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
  between: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  end: { alignItems: "flex-end" },
  number: { fontVariant: ["tabular-nums"] },
  card: { flex: 1, gap: space[1] },
});
