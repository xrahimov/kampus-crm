import { useLocalSearchParams } from "expo-router";
import {
  Check as CheckIcon,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  TriangleAlert,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  usePayrollRun,
  usePayrollStep,
  type PayrollLine,
  type PayrollStep,
  type PayrollSums,
} from "@/api/office-finance";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Badge, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { ExcelButton } from "@/features/files/excel-button";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { useMonthName } from "./period";

/** The parts a salary is made of, in the site's column order. */
const PARTS = [
  "fixed",
  "percent",
  "perLesson",
  "perStudent",
  "bonus",
  "penalty",
  "advance",
] as const;

/** The names the system roles are created with, back to their codes (the site's role-label.ts). */
const SYSTEM_ROLE_CODES: Record<string, string> = {
  CEO: "CEO",
  Admin: "ADMIN",
  "Branch manager": "BRANCH_MANAGER",
  Cashier: "CASHIER",
  Teacher: "TEACHER",
  "Support teacher": "SUPPORT_TEACHER",
  Marketer: "MARKETER",
  Watcher: "WATCHER",
};

/** "2026-11" from the address: the site's "2026-11-01" is read too. */
export function payrollMonth(value: string | undefined): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])(-01)?$/.test(value) ? value.slice(0, 7) : null;
}

/**
 * One month's payroll (A-237): the site's salary page. Every staff member's
 * salary with what it is made of and from which groups, **Approve** on a
 * line, and for the month **Recalculate**, **Save draft** and **Save**. The
 * Excel file comes to the phone (A-256).
 */
export function PayrollScreen() {
  const t = useTranslations();
  const tp = useTranslations("finance.payroll");
  const me = useMe();
  const money = useMoney();
  const monthName = useMonthName();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ month?: string }>();
  const month = payrollMonth(params.month);
  const run = usePayrollRun(month);
  const step = usePayrollStep(month ?? "");
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<string | null>(null);
  const mayUpdate = can(me, "finance.update");
  const mayApprove = can(me, "finance.payroll.approve");
  const [y = "0", m = "1"] = (month ?? "").split("-");
  const label = month ? monthName(Number(m), Number(y)) : "";

  const header = <Header back title={month ? tp("monthTitle", { month: label }) : tp("title")} />;
  if (!month) {
    return (
      <Screen header={header}>
        <EmptyState title={t("errors.notFound")} />
      </Screen>
    );
  }
  if (!run.data) return <PendingScreen header={header} query={run} />;
  const data = run.data;
  const words = typed.trim().toLocaleLowerCase();
  const lines = data.lines.filter((line) => line.fullName.toLocaleLowerCase().includes(words));
  const act = (next: PayrollStep, said: string | null) => {
    setDone(null);
    step.mutate(next, { onSuccess: () => setDone(said) });
  };
  const busy = step.isPending;
  const doing = (what: PayrollStep["do"], status?: string) =>
    busy &&
    step.variables?.do === what &&
    (status === undefined || (step.variables.do === "save" && step.variables.status === status));

  return (
    <Screen
      header={header}
      onRefresh={() => void run.refetch()}
      refreshing={run.isRefetching}
      footer={
        mayUpdate ? (
          <View style={styles.footer}>
            <Button
              compact
              variant="outline"
              icon={<RefreshCw size={16} color={colors.foreground} />}
              label={tp("recalculate")}
              loading={doing("recalculate")}
              disabled={busy}
              onPress={() => act({ do: "recalculate" }, tp("recalculated"))}
              testID="payroll-recalculate"
            />
            <Button
              compact
              variant="outline"
              label={tp("saveDraft")}
              loading={doing("save", "DRAFT")}
              disabled={busy}
              onPress={() => act({ do: "save", status: "DRAFT" }, tp("savedDraft"))}
              testID="payroll-save-draft"
            />
            <Button
              compact
              label={t("common.save")}
              loading={doing("save", "SAVED")}
              disabled={busy}
              onPress={() => act({ do: "save", status: "SAVED" }, tp("saved"))}
              style={styles.fill}
              testID="payroll-save"
            />
          </View>
        ) : undefined
      }
    >
      <View style={styles.between}>
        <Text tone="mutedForeground" style={styles.fill} testID="payroll-summary">
          {tp("summary", { staff: data.staffCount, approved: data.approvedCount })}
        </Text>
        <Badge
          tone={data.status === "SAVED" ? "success" : "neutral"}
          label={tp(`statuses.${data.status}`)}
          testID="payroll-status"
        />
      </View>
      <Text variant="small" tone="mutedForeground">
        {tp("rulesNote")}
      </Text>
      {step.error ? (
        <Notice tone="destructive" testID="payroll-problem">
          {errorText(t, step.error)}
        </Notice>
      ) : done ? (
        <Notice tone="success" testID="payroll-done">
          {done}
        </Notice>
      ) : null}

      <Card testID="payroll-totals">
        <View style={styles.between}>
          <Text variant="heading" style={styles.fill}>
            {tp("total")}
          </Text>
          <Text variant="heading" style={styles.number} testID="payroll-total-net">
            {money(data.totals.net)}
          </Text>
        </View>
        <Parts sums={data.totals} wide={wide} />
      </Card>

      <View style={styles.between}>
        <View style={styles.fill}>
          <Field
            label={tp("columns.staffMember")}
            placeholder={tp("search")}
            value={typed}
            onChangeText={setTyped}
            autoCorrect={false}
            testID="payroll-search"
          />
        </View>
      </View>
      {lines.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <View style={styles.cards} testID="payroll-lines">
          {lines.map((line) => (
            <View key={line.id} style={wide ? styles.cell : styles.full}>
              <Line
                line={line}
                open={!!open[line.id]}
                onToggle={() => setOpen((o) => ({ ...o, [line.id]: !o[line.id] }))}
                approve={
                  mayApprove && line.status !== "APPROVED"
                    ? {
                        busy,
                        loading:
                          busy &&
                          step.variables?.do === "approve" &&
                          step.variables.lineId === line.id,
                        press: () => act({ do: "approve", lineId: line.id }, null),
                      }
                    : null
                }
              />
            </View>
          ))}
        </View>
      )}
      <ExcelButton path={`/payroll/${month}/export.xlsx`} testID="payroll-excel" />
    </Screen>
  );
}

/** What a salary is made of: seven sums, the fines with how many there were. */
function Parts({ sums, wide }: { sums: PayrollSums; wide: boolean }) {
  const tp = useTranslations("finance.payroll");
  const money = useMoney();
  return (
    <View style={styles.parts}>
      {PARTS.map((part) => (
        <View key={part} style={wide ? styles.partWide : styles.part}>
          <Text variant="small" tone="mutedForeground" numberOfLines={1}>
            {tp(`columns.${part}`)}
            {part === "penalty" && sums.penaltyCount > 0 ? ` (${sums.penaltyCount})` : ""}
          </Text>
          <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
            {money(sums[part])}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Line({
  line,
  open,
  onToggle,
  approve,
}: {
  line: PayrollLine;
  open: boolean;
  onToggle: () => void;
  approve: { busy: boolean; loading: boolean; press: () => void } | null;
}) {
  const t = useTranslations();
  const tp = useTranslations("finance.payroll");
  const money = useMoney();
  const { colors } = useTheme();
  const code = SYSTEM_ROLE_CODES[line.roleName];
  const role = code && t.has(`roles.${code}`) ? t(`roles.${code}`) : line.roleName;
  const Arrow = open ? ChevronUp : ChevronDown;
  return (
    <Card style={styles.card} testID={`payroll-line-${line.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${line.fullName}: ${tp("details")}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.between}
        testID={`payroll-line-${line.id}-toggle`}
      >
        <View style={styles.fill}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {line.fullName}
          </Text>
          {role ? (
            <Text variant="small" tone="mutedForeground" numberOfLines={1}>
              {role}
            </Text>
          ) : null}
        </View>
        <View style={styles.net}>
          {line.net < 0 ? (
            <TriangleAlert
              size={16}
              color={colors.destructive}
              accessibilityLabel={tp("negative")}
            />
          ) : null}
          <Text
            variant="figure"
            tone={line.net < 0 ? "destructive" : "foreground"}
            style={styles.number}
            testID={`payroll-line-${line.id}-net`}
          >
            {money(line.net)}
          </Text>
          <Arrow size={18} color={colors.mutedForeground} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.details} testID={`payroll-line-${line.id}-details`}>
          {/* A line's card is half a tablet's width: two columns there too. */}
          <Parts sums={line} wide={false} />
          <Divider />
          {line.details.length === 0 ? (
            <Text variant="small" tone="mutedForeground">
              {tp("noGroups")}
            </Text>
          ) : (
            line.details.map((d) => (
              <View key={d.groupId} style={styles.group}>
                <View style={styles.between}>
                  <Text variant="smallStrong" style={styles.fill} numberOfLines={1}>
                    {d.groupName}
                  </Text>
                  <Text variant="small" style={styles.number}>
                    {money(d.amount)}
                  </Text>
                </View>
                <Text variant="small" tone="mutedForeground">
                  {tp(`shareTypes.${d.shareType}`, {
                    value: d.shareValue,
                    students: d.students,
                    lessons: d.lessons,
                    price: money(d.coursePrice),
                  })}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
      <View style={styles.between}>
        {line.status === "APPROVED" ? (
          <Badge
            tone="success"
            label={
              line.approvedByName
                ? `${tp("lineStatuses.APPROVED")}: ${line.approvedByName}`
                : tp("lineStatuses.APPROVED")
            }
            testID={`payroll-line-${line.id}-status`}
          />
        ) : approve ? (
          <Button
            compact
            variant="outline"
            icon={<CheckIcon size={16} color={colors.foreground} />}
            label={tp("approve")}
            loading={approve.loading}
            disabled={approve.busy}
            onPress={approve.press}
            testID={`payroll-line-${line.id}-approve`}
          />
        ) : (
          <Badge label={tp("lineStatuses.MODERATION")} testID={`payroll-line-${line.id}-status`} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
  between: { flexDirection: "row", alignItems: "center", gap: space[2] },
  footer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  number: { fontVariant: ["tabular-nums"] },
  net: { flexDirection: "row", alignItems: "center", gap: space[1] },
  cards: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flex: 1 },
  details: { gap: space[2] },
  group: { gap: 2 },
  parts: { flexDirection: "row", flexWrap: "wrap", rowGap: space[2] },
  part: { width: "50%", paddingRight: space[2] },
  partWide: { width: "25%", paddingRight: space[2] },
});
