import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useMemberChange } from "@/api/office-groups";
import {
  useInstalmentPlan,
  useInstalmentsStep,
  useMembershipCalendar,
  useReturnToLeads,
  type CalendarDay,
  type InstalmentPlan,
} from "@/api/office-student-money";
import type { StudentDetail, StudentGroupCard } from "@/api/types";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Fact } from "@/components/rows";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, EmptyState, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { NEXT, RemoveSheet, STATUS_TONE, TransferSheet } from "@/features/groups/members-screen";
import { addDays, centreToday, dayAsDate, weekdayAsDate } from "@/lib/days";
import { fieldErrorOf } from "@/lib/form";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme, type Colors } from "@/lib/theme";

import { PaymentSheet, typedMoney } from "./payment-sheet";

const LEFT = ["ARCHIVED", "GRADUATED"];

/**
 * A student's groups for the office (A-241), a card each as on the site: the
 * balance and the status, the dates and the price, a discount, the month's
 * lessons with which of them the money covered, and what can be done with
 * the membership. Groups the student has left stay behind a button.
 */
export function StudentGroups({ student }: { student: StudentDetail }) {
  const t = useTranslations();
  const td = useTranslations("students.detail");
  const [showLeft, setShowLeft] = useState(false);
  const hasLeft = student.groups.some((g) => LEFT.includes(g.status));
  const shown = showLeft ? student.groups : student.groups.filter((g) => !LEFT.includes(g.status));
  return (
    <View style={styles.block} testID="student-groups">
      {shown.length === 0 ? <EmptyState title={t("students.detail.noGroups")} /> : null}
      {shown.map((group) => (
        <GroupCard key={group.membershipId} student={student} group={group} />
      ))}
      {hasLeft ? (
        <Button
          variant="ghost"
          compact
          label={showLeft ? td("hideArchivedGroups") : td("showArchivedGroups")}
          onPress={() => setShowLeft((v) => !v)}
          style={styles.start}
          testID="student-groups-left"
        />
      ) : null}
    </View>
  );
}

type Doing = null | "menu" | "pay" | "split" | "transfer" | "toLead" | "remove";

function GroupCard({ student, group }: { student: StudentDetail; group: StudentGroupCard }) {
  const t = useTranslations();
  const tg = useTranslations("students.groupCard");
  const tm = useTranslations("groups.members");
  const me = useMe();
  const router = useRouter();
  const money = useMoney();
  const formatDate = useDate();
  const { colors } = useTheme();
  const change = useMemberChange(group.groupId);
  const [doing, setDoing] = useState<Doing>(null);
  const close = () => setDoing(null);
  const left = LEFT.includes(group.status);
  const mayEdit = can(me, "groups.update") && !student.isArchived;
  const mayPay = can(me, "payments.create") && !student.isArchived;
  const mayLead = can(me, "leads.create");
  const hasMenu = (mayEdit || mayPay) && !left;
  const moves = mayEdit ? NEXT[group.status] : [];
  const day = (iso: string) => formatDate(dayAsDate(iso.slice(0, 10)), { dateStyle: "medium" });
  const id = group.membershipId;
  const member = { id, fullName: student.fullName };

  const facts: Array<[string, string]> = [
    [tg("grade"), group.gradeAverage === null ? t("students.noGrade") : String(group.gradeAverage)],
    [tg("interval"), `${day(group.groupStartDate)} – ${day(group.groupEndDate)}`],
    [tg("teacher"), group.teacherName ?? "—"],
    [tg("time"), group.time ?? "—"],
    [
      tg("days"),
      [...group.weekdays]
        .sort((a, b) => a - b)
        .map((d) => formatDate(weekdayAsDate(d), { weekday: "short" }))
        .join(", ") || "—",
    ],
    [tg("joined"), day(group.joinedAt)],
  ];
  if (group.billingFrom && group.billingFrom !== group.joinedAt) {
    facts.push([tg("billingFrom"), day(group.billingFrom)]);
  }
  facts.push([left ? tg("left") : tg("ends"), day(group.leftAt ?? group.groupEndDate)]);
  if (group.lessonsLeft === null) {
    facts.push([tg("nextPayment"), group.nextPaymentDate ? day(group.nextPaymentDate) : "—"]);
    facts.push([
      tg("price"),
      group.customPrice === null
        ? money(group.monthlyPrice)
        : `${money(group.monthlyPrice)} (${tg("customPrice")})`,
    ]);
  }

  return (
    <Card style={left ? styles.faded : undefined} testID={`group-card-${id}`}>
      <View style={styles.head}>
        <Pressable
          onPress={() =>
            router.push({ pathname: "/staff/group/[id]", params: { id: group.groupId } })
          }
          accessibilityRole="link"
          accessibilityLabel={group.groupName}
          style={styles.fill}
          testID={`student-group-${group.groupId}`}
        >
          <Text variant="heading" tone="primary" numberOfLines={2}>
            {group.groupName}
          </Text>
          <Text variant="small" tone="mutedForeground">
            {group.courseName}
          </Text>
        </Pressable>
        {hasMenu ? (
          <Pressable
            onPress={() => {
              change.reset();
              setDoing("menu");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("common.actionsFor", { name: group.groupName })}
            hitSlop={8}
            style={styles.icon}
            testID={`group-card-menu-${id}`}
          >
            <MoreHorizontal size={20} color={colors.foreground} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.badges}>
        <Badge
          label={money(group.balance)}
          tone={group.balance < 0 ? "destructive" : group.balance > 0 ? "success" : "neutral"}
          testID={`group-card-balance-${id}`}
        />
        <Badge
          label={t(`groups.memberStatuses.${group.status}`)}
          tone={STATUS_TONE[group.status]}
          testID={`group-card-status-${id}`}
        />
        {group.lessonsLeft !== null ? (
          <Badge
            label={`${tg("lessonsLeft")}: ${group.lessonsLeft}`}
            tone={group.lessonsLeft <= 0 ? "destructive" : "neutral"}
            testID={`group-card-lessons-${id}`}
          />
        ) : null}
      </View>
      <View style={styles.facts}>
        {facts.map(([label, value]) => (
          <Fact key={label} label={label} value={value} />
        ))}
      </View>
      {group.instalments.length > 0 ? (
        <View style={styles.tight} testID={`group-card-instalments-${id}`}>
          <Text variant="smallStrong">{tg("instalments")}</Text>
          {group.instalments.map((part) => (
            <Text key={part.id} variant="small" tone={part.paid ? "mutedForeground" : undefined}>
              {`${money(part.amount)}, ${day(part.dueDate)}`}
              {part.paid ? `, ${tg("instalmentPaid")}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
      {group.discount ? (
        <Notice tone="success" testID={`group-card-discount-${id}`}>
          {[
            group.discount.familyId
              ? tg("familyDiscount", {
                  percent: group.discount.percent,
                  price: money(group.discount.discountedPrice),
                })
              : tg("discount", {
                  price: money(group.discount.discountedPrice),
                  months: group.discount.remainingMonths,
                  date: day(group.discount.givenAt),
                }),
            group.discount.comment
              ? tg("discountComment", { comment: group.discount.comment })
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
        </Notice>
      ) : null}
      {group.note ? (
        <Text variant="small" tone="mutedForeground">
          {group.note}
        </Text>
      ) : null}
      <LessonCalendar membershipId={id} />

      <Sheet open={doing === "menu"} onClose={close} title={group.groupName} testID="group-menu">
        <View style={styles.menu}>
          {moves.length > 0 ? (
            <View style={styles.tight}>
              <Text variant="smallStrong">{tm("changeStatus")}</Text>
              <View style={styles.badges}>
                {moves.map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    compact
                    label={
                      status === "GRADUATED" ? tm("graduate") : t(`groups.memberStatuses.${status}`)
                    }
                    loading={change.isPending}
                    onPress={() =>
                      change.mutate(
                        { kind: "status", membershipId: id, status },
                        { onSuccess: close },
                      )
                    }
                    testID={`group-to-${status}`}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {mayPay ? (
            <Button
              variant="saffron"
              label={tg("actions.pay")}
              onPress={() => setDoing("pay")}
              testID="group-pay"
            />
          ) : null}
          {mayPay && group.lessonsLeft === null ? (
            <Button
              variant="outline"
              label={tg("actions.instalments")}
              onPress={() => setDoing("split")}
              testID="group-split"
            />
          ) : null}
          {mayEdit ? (
            <>
              <Button
                variant="outline"
                label={tg("actions.transfer")}
                onPress={() => setDoing("transfer")}
                testID="group-transfer"
              />
              {mayLead ? (
                <Button
                  variant="outline"
                  label={tg("actions.toLead")}
                  onPress={() => setDoing("toLead")}
                  testID="group-to-lead"
                />
              ) : null}
              <Button
                variant="destructive"
                label={tg("actions.remove")}
                onPress={() => setDoing("remove")}
                testID="group-remove"
              />
            </>
          ) : null}
          {change.error ? (
            <Notice tone="destructive" testID="group-menu-problem">
              {errorText(t, change.error)}
            </Notice>
          ) : null}
        </View>
      </Sheet>
      <PaymentSheet
        open={doing === "pay"}
        onClose={close}
        student={{ id: student.id, fullName: student.fullName, groups: [group] }}
      />
      <InstalmentsSheet
        open={doing === "split"}
        onClose={close}
        membershipId={id}
        groupName={group.groupName}
      />
      <TransferSheet
        open={doing === "transfer"}
        onClose={close}
        member={member}
        groupId={group.groupId}
      />
      <RemoveSheet
        open={doing === "remove"}
        onClose={close}
        member={member}
        groupId={group.groupId}
      />
      <ToLeadSheet
        open={doing === "toLead"}
        onClose={close}
        membershipId={id}
        studentName={student.fullName}
      />
    </Card>
  );
}

type DayKind = "paid" | "debt" | "excused" | "upcoming" | "absent";

/** A lesson day is drawn by what happened, and for a lesson attended by whether it was paid for. */
export function dayKind(day: CalendarDay): DayKind {
  if (day.status === "UPCOMING") return "upcoming";
  if (day.status === "ABSENT") return "absent";
  if (day.status === "EXCUSED") return "excused";
  return day.paid ? "paid" : "debt";
}

const KINDS: DayKind[] = ["paid", "debt", "excused", "upcoming", "absent"];

function kindLook(colors: Colors, kind: DayKind) {
  switch (kind) {
    case "paid":
      return { backgroundColor: colors.successSoft, ink: colors.foreground };
    case "debt":
      return { backgroundColor: colors.destructiveSoft, ink: colors.destructive };
    case "excused":
      return { backgroundColor: colors.secondary, ink: colors.secondaryForeground };
    case "upcoming":
      return {
        backgroundColor: "transparent",
        ink: colors.mutedForeground,
        borderColor: colors.border,
        borderWidth: 1,
        borderStyle: "dashed" as const,
      };
    case "absent":
      return { backgroundColor: colors.muted, ink: colors.mutedForeground };
  }
}

/**
 * "Lesson calendar": one month of the membership's lessons as day numbers.
 * Green was paid for, red is a debt, grey with a line was missed; a legend
 * under the days says so in words, and every day reads its date and state.
 */
function LessonCalendar({ membershipId }: { membershipId: string }) {
  const t = useTranslations();
  const tg = useTranslations("students.groupCard");
  const formatDate = useDate();
  const { colors } = useTheme();
  const [month, setMonth] = useState<string | null>(null);
  const query = useMembershipCalendar(membershipId, month);
  const calendar = query.data;
  const months = calendar?.months ?? [];
  const at = calendar ? months.indexOf(calendar.month) : -1;
  const step = (by: number) => {
    const next = months[at + by];
    if (next) setMonth(next);
  };
  return (
    <View style={styles.tight} testID={`calendar-${membershipId}`}>
      <View style={styles.line}>
        <Text variant="smallStrong" style={styles.fill} testID={`calendar-month-${membershipId}`}>
          {tg("calendar")}
          {calendar
            ? ` (${formatDate(dayAsDate(calendar.month.slice(0, 10)), {
                month: "short",
                year: "numeric",
              })})`
            : ""}
        </Text>
        <Pressable
          onPress={() => step(-1)}
          disabled={at <= 0}
          accessibilityRole="button"
          accessibilityLabel={t("mobile.prevMonth")}
          hitSlop={8}
          style={[styles.icon, at <= 0 ? styles.off : null]}
          testID={`calendar-prev-${membershipId}`}
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => step(1)}
          disabled={at < 0 || at >= months.length - 1}
          accessibilityRole="button"
          accessibilityLabel={t("mobile.nextMonth")}
          hitSlop={8}
          style={[styles.icon, at < 0 || at >= months.length - 1 ? styles.off : null]}
          testID={`calendar-next-${membershipId}`}
        >
          <ChevronRight size={20} color={colors.foreground} />
        </Pressable>
      </View>
      {query.error && !calendar ? (
        <Notice tone="destructive">{errorText(t, query.error)}</Notice>
      ) : null}
      {!calendar && !query.error ? <Loading /> : null}
      {calendar ? (
        <>
          <View style={styles.badges}>
            <Badge tone="success" label={`${tg("present")}: ${calendar.counts.present}`} />
            <Badge label={`${tg("absent")}: ${calendar.counts.absent}`} />
            <Badge label={`${tg("excused")}: ${calendar.counts.excused}`} />
            <Badge label={`${tg("notMarked")}: ${calendar.counts.notMarked}`} />
          </View>
          {calendar.days.length === 0 ? (
            <Text variant="small" tone="mutedForeground">
              {tg("noLessons")}
            </Text>
          ) : (
            <View style={styles.days}>
              {calendar.days.map((day) => {
                const kind = dayKind(day);
                const { ink, ...box } = kindLook(colors, kind);
                return (
                  <View
                    key={day.date}
                    accessible
                    accessibilityLabel={`${formatDate(dayAsDate(day.date), {
                      day: "numeric",
                      month: "short",
                    })}, ${tg(kind)}`}
                    style={[styles.day, box]}
                    testID={`calendar-day-${day.date}`}
                  >
                    <Text
                      variant="small"
                      style={[
                        { color: ink },
                        kind === "absent" ? styles.struck : null,
                        styles.digits,
                      ]}
                    >
                      {Number(day.date.slice(8, 10))}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={styles.legend}>
            {KINDS.map((kind) => {
              const { ink: _ink, ...box } = kindLook(colors, kind);
              return (
                <View key={kind} style={styles.key}>
                  <View style={[styles.swatch, box]} />
                  <Text variant="small" tone="mutedForeground">
                    {tg(kind)}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

interface PartDraft {
  dueDate: string | null;
  amount: string;
  paid: boolean;
}

/** Whole soʻm, the last part taking what is left over. */
export function equalParts(amount: number, count: number): number[] {
  const base = Math.floor(amount / count);
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? amount - base * (count - 1) : base,
  );
}

/** The parts a plan opens with: its own, or two halves fifteen days apart from today or the month's first day. */
export function draftParts(plan: InstalmentPlan, today: string): PartDraft[] {
  if (plan.parts.length > 0) {
    return plan.parts.map((p) => ({
      dueDate: p.dueDate.slice(0, 10),
      amount: String(p.amount),
      paid: p.paid,
    }));
  }
  const month = plan.month.slice(0, 10);
  const first = month > today ? month : today;
  const [a, b] = equalParts(plan.amount, 2) as [number, number];
  return [
    { dueDate: first, amount: String(a), paid: false },
    { dueDate: addDays(first, 15), amount: String(b), paid: false },
  ];
}

/**
 * "Split the month's fee": one month's fee in two or three parts, each with
 * its own day; a part is a debt only once its day has passed.
 */
function InstalmentsSheet({
  open,
  onClose,
  membershipId,
  groupName,
}: {
  open: boolean;
  onClose: () => void;
  membershipId: string;
  groupName: string;
}) {
  const t = useTranslations();
  const ti = useTranslations("students.instalments");
  const money = useMoney();
  const formatDate = useDate();
  const { colors } = useTheme();
  const [month, setMonth] = useState<string | null>(null);
  const query = useInstalmentPlan(open ? membershipId : null, month);
  const step = useInstalmentsStep(membershipId);
  const [parts, setParts] = useState<PartDraft[]>([]);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMonth(null);
      setSeeded(null);
      setParts([]);
      step.reset();
    }
  }
  const plan = query.data ?? null;
  // The form is filled once for each month that arrives, not on every answer of the server.
  if (open && plan && seeded !== plan.month) {
    setSeeded(plan.month);
    setParts(draftParts(plan, centreToday()));
  }
  const allocated = parts.reduce((sum, p) => sum + typedMoney(p.amount), 0);
  const left = plan ? plan.amount - allocated : 0;
  const fieldError = fieldErrorOf(t, step.error);
  const partsError = fieldError("parts") ?? fieldError("month");
  const update = (index: number, patch: Partial<PartDraft>) =>
    setParts((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const ready = plan !== null && parts.every((p) => p.dueDate !== null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${ti("title")}: ${groupName}`}
      testID="split"
      footer={
        <Button
          label={ti("save")}
          loading={step.isPending}
          disabled={!ready}
          onPress={() => {
            if (!plan) return;
            step.mutate(
              {
                month: plan.month,
                parts: parts.map((p) => ({
                  dueDate: p.dueDate ?? "",
                  amount: typedMoney(p.amount),
                })),
              },
              { onSuccess: onClose },
            );
          }}
          testID="split-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {ti("hint")}
        </Text>
        {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
        {!plan && !query.error ? <Loading /> : null}
        {plan ? (
          <>
            <Select
              label={ti("month")}
              value={plan.month}
              onChange={(value) => {
                if (value) setMonth(value);
              }}
              options={plan.months.map((m) => ({
                value: m,
                label: formatDate(dayAsDate(m.slice(0, 10)), { month: "short", year: "numeric" }),
              }))}
              testID="split-month"
            />
            <View style={styles.tight}>
              <Fact label={ti("amount")} value={money(plan.amount)} testID="split-amount" />
              <Text variant="small" tone="mutedForeground">
                {ti("balance", { balance: money(plan.balance) })}
              </Text>
            </View>
            <View style={styles.badges}>
              <Button
                compact
                variant="outline"
                label={ti("equal")}
                onPress={() => {
                  const amounts = equalParts(plan.amount, parts.length);
                  setParts((list) => list.map((p, i) => ({ ...p, amount: String(amounts[i]) })));
                }}
                testID="split-equal"
              />
              <Button
                compact
                variant="outline"
                label={ti("addPart")}
                icon={<Plus size={16} color={colors.foreground} />}
                disabled={parts.length >= 3}
                onPress={() =>
                  setParts((list) => [
                    ...list,
                    {
                      dueDate: addDays(list.at(-1)?.dueDate ?? centreToday(), 10),
                      amount: "0",
                      paid: false,
                    },
                  ])
                }
                testID="split-add"
              />
            </View>
            {parts.map((part, index) => (
              <View
                key={index}
                style={[styles.part, { borderColor: colors.border }]}
                testID={`split-part-${index}`}
              >
                <View style={styles.line}>
                  <Text variant="smallStrong" style={styles.fill}>
                    {ti("part", { n: index + 1 })}
                  </Text>
                  {part.paid ? <Badge tone="success" label={ti("paid")} /> : null}
                  {parts.length > 2 ? (
                    <Pressable
                      onPress={() => setParts((list) => list.filter((_, i) => i !== index))}
                      accessibilityRole="button"
                      accessibilityLabel={`${ti("removePart")}: ${ti("part", { n: index + 1 })}`}
                      hitSlop={8}
                      testID={`split-remove-${index}`}
                    >
                      <Trash2 size={18} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}
                </View>
                <DateField
                  label={ti("dueDate")}
                  value={part.dueDate}
                  onChange={(dueDate) => update(index, { dueDate })}
                  testID={`split-date-${index}`}
                />
                <Field
                  label={ti("partAmount")}
                  value={part.amount}
                  onChangeText={(amount) => update(index, { amount })}
                  keyboardType="number-pad"
                  maxLength={15}
                  testID={`split-amount-${index}`}
                />
              </View>
            ))}
            <Text
              variant="small"
              tone={left !== 0 ? "destructive" : "mutedForeground"}
              testID="split-left"
            >
              {ti("remaining", { amount: money(left) })}
            </Text>
            {partsError ? (
              <Text variant="small" tone="destructive" testID="split-parts-problem">
                {partsError}
              </Text>
            ) : null}
            {step.error && !partsError ? (
              <Notice tone="destructive" testID="split-problem">
                {errorText(t, step.error)}
              </Notice>
            ) : null}
            {plan.parts.length > 0 ? (
              <Button
                variant="outline"
                label={ti("clear")}
                loading={step.isPending}
                onPress={() =>
                  step.mutate({ month: plan.month, parts: null }, { onSuccess: onClose })
                }
                style={styles.start}
                testID="split-clear"
              />
            ) : null}
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

/** "Return to leads": the student leaves the group today and appears as a new lead on the board. */
function ToLeadSheet({
  open,
  onClose,
  membershipId,
  studentName,
}: {
  open: boolean;
  onClose: () => void;
  membershipId: string;
  studentName: string;
}) {
  const t = useTranslations();
  const tl = useTranslations("students.toLead");
  const back = useReturnToLeads();
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("");
      back.reset();
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tl("title")}
      testID="to-lead"
      footer={
        <Button
          label={tl("confirm")}
          loading={back.isPending}
          onPress={() =>
            back.mutate({ membershipId, reason: reason.trim() || null }, { onSuccess: onClose })
          }
          testID="to-lead-save"
        />
      }
    >
      <View style={styles.form}>
        <Text>{tl("text", { name: studentName })}</Text>
        <Field
          label={tl("reason")}
          value={reason}
          onChangeText={setReason}
          maxLength={200}
          testID="to-lead-reason"
        />
        {back.error ? (
          <Notice tone="destructive" testID="to-lead-problem">
            {errorText(t, back.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[3] },
  start: { alignSelf: "flex-start" },
  fill: { flex: 1 },
  faded: { opacity: 0.75 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  icon: { padding: space[1] },
  off: { opacity: 0.35 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  facts: { gap: space[1] },
  tight: { gap: space[2] },
  menu: { gap: space[3] },
  form: { gap: space[4] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  day: {
    minWidth: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  digits: { fontVariant: ["tabular-nums"] },
  struck: { textDecorationLine: "line-through" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space[3], rowGap: space[1] },
  key: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  part: { gap: space[2], borderWidth: 1, borderRadius: 12, padding: space[3] },
});
