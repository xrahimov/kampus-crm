import { useRouter } from "expo-router";
import {
  ArrowRightLeft,
  CalendarOff,
  ChevronRight,
  Flag,
  ListOrdered,
  Trash2,
  UserRoundCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { WaitlistOffer } from "@/api/group-lessons";
import {
  GROUP_TEACHER_ROLES,
  SHARE_TYPES,
  useDayOff,
  useGroupAction,
  useGroupDaysOff,
  useGroupOptions,
  type GroupDayOff,
} from "@/api/office-groups";
import type { Group, GroupTeacherRole, ShareType } from "@/api/types";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, Notice, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { TimeField } from "@/components/time-field";
import { centreToday, dayAsDate } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { GroupFormSheet } from "./group-form";
import { OfferSeatsSheet } from "./group-lesson-parts";

export const GROUP_STATUS_TONE: Record<Group["status"], Tone> = {
  ACTIVE: "success",
  TRIAL: "accent",
  FROZEN: "warning",
  ARCHIVED: "neutral",
};

/** A day off a student made themselves, moving or cancelling a 1:1 lesson: the reason is a key. */
const STUDENT_REASON = "@student.";

type Open =
  | "edit"
  | "schedule"
  | "more"
  | "support"
  | "changeTeacher"
  | "dayOff"
  | "offerSeats"
  | "move"
  | "finish"
  | "archive"
  | null;

/**
 * The office's side of a group's page (A-233): what the group is (course,
 * price, dates, who teaches it and for what share, its days off) and what the
 * office does with it: edit, change the times, change a teacher, give a day
 * off, move it to another branch, finish or archive it. A teacher sees only
 * "Change times", and only where the centre lets teachers do that (A-193).
 */
export function GroupOffice({ group }: { group: Group }) {
  const t = useTranslations();
  const td = useTranslations("groups.detail");
  const me = useMe();
  const date = useDate();
  const money = useMoney();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [removing, setRemoving] = useState<GroupDayOff | null>(null);
  const [offered, setOffered] = useState<WaitlistOffer | null>(null);
  const archived = group.status === "ARCHIVED";
  const mayUpdate = can(me, "groups.update");
  const mayDelete = can(me, "groups.delete");
  const editable = mayUpdate && !archived;
  const teachesIt = group.teachers.some((x) => x.userId === me.user.id);
  // Only a teacher of the group has to ask whether the centre lets teachers change times.
  const options = useGroupOptions(!mayUpdate && teachesIt && !archived);
  const maySchedule = editable || (teachesIt && !archived && !!options.data?.teachersChangeTimes);
  const daysOff = useGroupDaysOff(group.id);
  const action = useGroupAction(group.id);
  const dayOff = useDayOff(group.id);
  const day = (iso: string) => date(dayAsDate(iso.slice(0, 10)), { dateStyle: "medium" });
  const share = (type: ShareType, value: number) =>
    type === "PERCENT"
      ? `${value}%`
      : `${money(value)} / ${t(`groups.shareTypes.${type}`).toLowerCase()}`;
  const close = () => {
    setOpen(null);
    action.reset();
  };
  const run = (kind: "finish" | "archive") =>
    action.mutate(
      { kind },
      {
        onSuccess: () => {
          close();
          if (kind === "archive") router.back();
        },
      },
    );

  const rows: Array<{ key: Exclude<Open, null>; label: string; icon: LucideIcon; show: boolean }> =
    [
      { key: "support", label: td("supportTeachers"), icon: UsersRound, show: editable },
      { key: "changeTeacher", label: td("changeTeacher"), icon: UserRoundCog, show: editable },
      { key: "dayOff", label: td("dayOff"), icon: CalendarOff, show: editable },
      {
        // Free seats go to the people waiting for the course (A-262).
        key: "offerSeats",
        label: t("groups.actions.offerSeats"),
        icon: ListOrdered,
        show: editable && can(me, "leads.view") && can(me, "leads.update"),
      },
      {
        key: "move",
        label: t("groups.actions.moveBranch"),
        icon: ArrowRightLeft,
        show: editable && me.branches.length > 1,
      },
      { key: "finish", label: t("groups.actions.finish"), icon: Flag, show: editable },
      { key: "archive", label: t("common.archive"), icon: Trash2, show: mayDelete && !archived },
    ];
  const more = rows.filter((row) => row.show);

  return (
    <View style={styles.block} testID="group-office">
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text variant="heading" style={styles.fill}>
            {td("info")}
          </Text>
          <Badge
            label={t(`groups.statuses.${group.status}`)}
            tone={GROUP_STATUS_TONE[group.status]}
            testID="group-status-badge"
          />
        </View>
        <Fact label={t("groups.columns.course")} value={group.courseName} />
        <Fact
          label={td("price")}
          value={
            group.billingMode === "PACKAGES"
              ? t("groups.form.billingPackages")
              : money(group.coursePrice)
          }
        />
        {me.branches.length > 1 ? <Fact label={td("branch")} value={group.branchName} /> : null}
        <Fact label={t("groups.columns.opened")} value={day(group.startDate)} />
        <Fact label={t("groups.columns.ends")} value={day(group.endDate)} />
        <Fact label={td("lessonsHeld")} value={String(group.lessonsHeld)} />
        <Divider />
        <Text variant="smallStrong">{t("groups.form.teachers")}</Text>
        {group.teachers.length === 0 ? (
          <Text variant="small" tone="mutedForeground">
            —
          </Text>
        ) : (
          group.teachers.map((x) => (
            <View key={x.userId} style={styles.teacher} testID={`group-teacher-${x.userId}`}>
              <Text style={styles.fill} numberOfLines={1}>
                {x.fullName}
              </Text>
              <Text variant="small" tone="mutedForeground">
                {t(`groups.teacherRoles.${x.role}`)}
                {mayUpdate ? `, ${share(x.shareType, x.shareValue)}` : ""}
              </Text>
            </View>
          ))
        )}
        {group.supportTeachers.length > 0 ? (
          <Fact
            label={t("groups.columns.support")}
            value={group.supportTeachers.map((x) => x.fullName).join(", ")}
          />
        ) : null}
        {(daysOff.data ?? []).length > 0 ? (
          <>
            <Divider />
            <Text variant="smallStrong">{td("daysOff")}</Text>
            {(daysOff.data ?? []).map((off) => (
              <View key={off.id} style={styles.teacher} testID={`day-off-${off.id}`}>
                <View style={styles.fill}>
                  <Text>
                    {day(off.date)}:{" "}
                    {off.reason.startsWith(STUDENT_REASON)
                      ? td(`dayOffReasons.${off.reason.slice(STUDENT_REASON.length)}`)
                      : off.reason}
                  </Text>
                  {off.movedTo ? (
                    <Text variant="small" tone="mutedForeground">
                      {td("movedTo", {
                        date: day(off.movedTo.date),
                        start: off.movedTo.startTime,
                        end: off.movedTo.endTime,
                      })}
                    </Text>
                  ) : null}
                </View>
                {editable ? (
                  <Button
                    variant="ghost"
                    compact
                    label={t("mobile.groups.undoDayOff")}
                    onPress={() => {
                      dayOff.reset();
                      setRemoving(off);
                    }}
                    testID={`day-off-undo-${off.id}`}
                  />
                ) : null}
              </View>
            ))}
          </>
        ) : null}
        {editable || maySchedule || more.length > 0 ? (
          <View style={styles.actions}>
            {editable ? (
              <Button
                variant="outline"
                compact
                label={t("common.edit")}
                onPress={() => setOpen("edit")}
                testID="group-edit"
              />
            ) : null}
            {maySchedule ? (
              <Button
                variant="outline"
                compact
                label={td("changeSchedule")}
                onPress={() => setOpen("schedule")}
                testID="group-times"
              />
            ) : null}
            {more.length > 0 ? (
              <Button
                variant="outline"
                compact
                label={td("more")}
                onPress={() => setOpen("more")}
                testID="group-more"
              />
            ) : null}
          </View>
        ) : null}
      </Card>
      {offered ? (
        <Notice tone="success" testID="group-seats-offered">
          {t("groups.waitlist.done", { ...offered })}
        </Notice>
      ) : null}

      <GroupFormSheet
        open={open === "edit" || open === "schedule"}
        onClose={close}
        group={group}
        mode={open === "schedule" ? "schedule" : "full"}
      />
      <Sheet open={open === "more"} onClose={close} title={group.name} testID="group-more-sheet">
        <View>
          {more.map((row, index) => (
            <View key={row.key}>
              {index > 0 ? <Divider /> : null}
              <MoreRow
                label={row.label}
                icon={row.icon}
                destructive={row.key === "archive"}
                onPress={() => {
                  action.reset();
                  if (row.key === "offerSeats") setOffered(null);
                  setOpen(row.key);
                }}
                testID={`group-do-${row.key}`}
              />
            </View>
          ))}
        </View>
      </Sheet>
      <SupportTeachersSheet open={open === "support"} onClose={close} group={group} />
      <ChangeTeacherSheet open={open === "changeTeacher"} onClose={close} group={group} />
      <DayOffSheet open={open === "dayOff"} onClose={close} group={group} />
      <OfferSeatsSheet
        open={open === "offerSeats"}
        onClose={close}
        groupId={group.id}
        onDone={setOffered}
      />
      <MoveBranchSheet open={open === "move"} onClose={close} group={group} />
      <Confirm
        open={open === "finish"}
        onClose={close}
        title={t("groups.finishTitle")}
        text={t("groups.finishText", { name: group.name })}
        label={t("groups.actions.finish")}
        loading={action.isPending}
        problem={action.error ? errorText(t, action.error) : null}
        onConfirm={() => run("finish")}
        testID="group-finish"
      />
      <Confirm
        open={open === "archive"}
        onClose={close}
        title={t("groups.archiveTitle")}
        text={t("groups.archiveText", { name: group.name })}
        label={t("common.archive")}
        loading={action.isPending}
        problem={action.error ? errorText(t, action.error) : null}
        onConfirm={() => run("archive")}
        testID="group-archive"
      />
      <Confirm
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t("mobile.groups.undoDayOffTitle")}
        text={t("mobile.groups.undoDayOffText", { date: removing ? day(removing.date) : "" })}
        label={t("mobile.groups.undoDayOff")}
        destructive={false}
        loading={dayOff.isPending}
        problem={dayOff.error ? errorText(t, dayOff.error) : null}
        onConfirm={() => {
          if (!removing) return;
          dayOff.mutate({ remove: removing.id }, { onSuccess: () => setRemoving(null) });
        }}
        testID="day-off-undo"
      />
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="small" tone="mutedForeground" style={styles.factLabel}>
        {label}
      </Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function MoreRow({
  label,
  icon: Icon,
  destructive,
  onPress,
  testID,
}: {
  label: string;
  icon: LucideIcon;
  destructive: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const ink = destructive ? colors.destructive : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.moreRow, pressed ? { backgroundColor: colors.muted } : null]}
      testID={testID}
    >
      <Icon size={20} color={ink} />
      <Text style={[styles.fill, { color: ink }]}>{label}</Text>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  group: Group;
}

/** Teachers of the group's branch who do not already teach it. */
function useCandidates(group: Group, open: boolean) {
  const options = useGroupOptions(open);
  const candidates = (options.data?.teachers ?? []).filter(
    (x) => x.branchIds.includes(group.branchId) && !group.teachers.some((gt) => gt.userId === x.id),
  );
  return { options, candidates };
}

/** "Support teachers": who else helps in the group. */
function SupportTeachersSheet({ open, onClose, group }: SheetProps) {
  const t = useTranslations();
  const td = useTranslations("groups.detail");
  const { options, candidates } = useCandidates(group, open);
  const action = useGroupAction(group.id);
  const [picked, setPicked] = useState<string[]>([]);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(group.supportTeachers.map((s) => s.userId));
      action.reset();
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={td("supportTeachers")}
      testID="support-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={action.isPending}
          onPress={() =>
            action.mutate({ kind: "supportTeachers", userIds: picked }, { onSuccess: onClose })
          }
          testID="support-save"
        />
      }
    >
      <View style={styles.form}>
        {candidates.length === 0 && !options.isLoading ? (
          <Text tone="mutedForeground">{td("noSupportCandidates")}</Text>
        ) : (
          candidates.map((x) => (
            <Check
              key={x.id}
              label={x.fullName}
              value={picked.includes(x.id)}
              onChange={(on) =>
                setPicked((list) => (on ? [...list, x.id] : list.filter((id) => id !== x.id)))
              }
              testID={`support-${x.id}`}
            />
          ))
        )}
        <Problem error={options.error ?? action.error} />
      </View>
    </Sheet>
  );
}

/** "Change teacher": one teacher out, another in, with the role and the share. */
function ChangeTeacherSheet({ open, onClose, group }: SheetProps) {
  const t = useTranslations();
  const td = useTranslations("groups.detail");
  const { options, candidates } = useCandidates(group, open);
  const action = useGroupAction(group.id);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [role, setRole] = useState<GroupTeacherRole>("MAIN");
  const [shareType, setShareType] = useState<ShareType>("PERCENT");
  const [shareValue, setShareValue] = useState("0");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const first = group.teachers[0];
      setFromId(first?.userId ?? null);
      setToId(null);
      setRole(first?.role ?? "MAIN");
      setShareType(first?.shareType ?? "PERCENT");
      setShareValue(String(first?.shareValue ?? 0));
      setMissing(false);
      action.reset();
    }
  }
  const fieldError = fieldErrorOf(t, action.error);
  const submit = () => {
    if (!fromId || !toId) {
      setMissing(true);
      return;
    }
    action.mutate(
      {
        kind: "changeTeacher",
        fromUserId: fromId,
        to: {
          userId: toId,
          role,
          shareType,
          shareValue: Number(shareValue.replace(",", ".")) || 0,
        },
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={td("changeTeacher")}
      testID="change-teacher"
      footer={
        <Button
          label={t("common.save")}
          loading={action.isPending}
          onPress={submit}
          testID="change-teacher-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {td("changeTeacherHint")}
        </Text>
        <Select
          label={td("outgoingTeacher")}
          value={fromId}
          onChange={(id) => {
            setFromId(id);
            const outgoing = group.teachers.find((x) => x.userId === id);
            if (outgoing) {
              setRole(outgoing.role);
              setShareType(outgoing.shareType);
              setShareValue(String(outgoing.shareValue));
            }
          }}
          options={group.teachers.map((x) => ({
            value: x.userId,
            label: x.fullName,
            note: t(`groups.teacherRoles.${x.role}`),
          }))}
          error={missing && !fromId ? t("validation.required") : null}
          testID="change-teacher-from"
        />
        <Select
          label={td("incomingTeacher")}
          value={toId}
          onChange={setToId}
          placeholder={candidates.length === 0 ? td("noCandidates") : undefined}
          options={candidates.map((x) => ({ value: x.id, label: x.fullName }))}
          error={fieldError("to.userId") ?? (missing && !toId ? t("validation.required") : null)}
          testID="change-teacher-to"
        />
        <Select
          label={t("groups.form.teacherRole")}
          value={role}
          onChange={(value) => setRole(value ?? "MAIN")}
          options={GROUP_TEACHER_ROLES.map((r) => ({
            value: r,
            label: t(`groups.teacherRoles.${r}`),
          }))}
          testID="change-teacher-role"
        />
        <View style={styles.pair}>
          <View style={styles.fill}>
            <Select
              label={t("groups.form.shareType")}
              value={shareType}
              onChange={(value) => setShareType(value ?? "PERCENT")}
              options={SHARE_TYPES.map((s) => ({ value: s, label: t(`groups.shareTypes.${s}`) }))}
              testID="change-teacher-share-type"
            />
          </View>
          <View style={styles.fill}>
            <Field
              label={t("groups.form.shareValue")}
              value={shareValue}
              onChangeText={(text) => setShareValue(text.replace(/[^\d.,]/g, ""))}
              keyboardType="decimal-pad"
              maxLength={14}
              error={fieldError("to.shareValue")}
              testID="change-teacher-share"
            />
          </View>
        </View>
        <Problem error={options.error ?? action.error} />
      </View>
    </Sheet>
  );
}

/** "Give a day off": the group skips a day; the lesson is dropped or moved, the families told. */
function DayOffSheet({ open, onClose, group }: SheetProps) {
  const t = useTranslations();
  const td = useTranslations("groups.detail");
  const dayOff = useDayOff(group.id);
  const slot = group.slots[0];
  const [date, setDate] = useState<string | null>(centreToday());
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [move, setMove] = useState(false);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(slot?.startTime ?? "09:00");
  const [end, setEnd] = useState<string | null>(slot?.endTime ?? "10:30");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(centreToday());
      setReason("");
      setNotify(true);
      setMove(false);
      setNewDate(null);
      setStart(slot?.startTime ?? "09:00");
      setEnd(slot?.endTime ?? "10:30");
      setMissing(false);
      dayOff.reset();
    }
  }
  const fieldError = fieldErrorOf(t, dayOff.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const submit = () => {
    if (!date || !reason.trim() || (move && (!newDate || !start || !end || end <= start))) {
      setMissing(true);
      return;
    }
    dayOff.mutate(
      {
        add: {
          date,
          reason: reason.trim(),
          notify,
          moveTo:
            move && newDate && start && end
              ? { date: newDate, startTime: start, endTime: end }
              : null,
        },
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={td("dayOff")}
      testID="day-off"
      footer={
        <Button
          label={t("common.save")}
          loading={dayOff.isPending}
          onPress={submit}
          testID="day-off-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {td("dayOffHint")}
        </Text>
        <DateField
          label={td("date")}
          value={date}
          onChange={setDate}
          error={fieldError("date") ?? required(!date)}
          testID="day-off-date"
        />
        <Field
          label={td("reason")}
          value={reason}
          onChangeText={setReason}
          maxLength={200}
          error={fieldError("reason") ?? required(!reason.trim())}
          testID="day-off-reason"
        />
        <Check label={td("notify")} value={notify} onChange={setNotify} testID="day-off-notify" />
        <Check label={td("moveLesson")} value={move} onChange={setMove} testID="day-off-move" />
        {move ? (
          <>
            <DateField
              label={td("newDate")}
              value={newDate}
              onChange={setNewDate}
              error={fieldError("moveTo.date") ?? required(!newDate)}
              testID="day-off-new-date"
            />
            <View style={styles.pair}>
              <View style={styles.fill}>
                <TimeField
                  label={td("newStart")}
                  value={start}
                  onChange={setStart}
                  error={fieldError("moveTo.startTime") ?? required(!start)}
                  testID="day-off-start"
                />
              </View>
              <View style={styles.fill}>
                <TimeField
                  label={td("newEnd")}
                  value={end}
                  onChange={setEnd}
                  error={
                    fieldError("moveTo.endTime") ??
                    required(!end) ??
                    (missing && start && end && end <= start ? t("validation.workHours") : null)
                  }
                  testID="day-off-end"
                />
              </View>
            </View>
          </>
        ) : null}
        <Problem error={dayOff.error} />
      </View>
    </Sheet>
  );
}

/** "Move to another branch": the group goes with its students; its rooms are cleared. */
function MoveBranchSheet({ open, onClose, group }: SheetProps) {
  const t = useTranslations();
  const me = useMe();
  const action = useGroupAction(group.id);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBranchId(null);
      setMissing(false);
      action.reset();
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("groups.actions.moveBranch")}
      testID="move-branch"
      footer={
        <Button
          label={t("common.save")}
          loading={action.isPending}
          onPress={() => {
            if (!branchId) {
              setMissing(true);
              return;
            }
            action.mutate({ kind: "moveBranch", branchId }, { onSuccess: onClose });
          }}
          testID="move-branch-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {t("groups.moveBranchText", { name: group.name })}
        </Text>
        <Select
          label={t("branch.select")}
          value={branchId}
          onChange={setBranchId}
          options={me.branches
            .filter((b) => b.id !== group.branchId)
            .map((b) => ({ value: b.id, label: b.name }))}
          error={missing && !branchId ? t("validation.required") : null}
          testID="move-branch-to"
        />
        <Problem error={action.error} />
      </View>
    </Sheet>
  );
}

/** What went wrong with a form, unless its fields already say it. */
export function Problem({ error }: { error: unknown }) {
  const t = useTranslations();
  if (!error || hasFieldErrors(error)) return null;
  return (
    <Notice tone="destructive" testID="form-problem">
      {errorText(t, error)}
    </Notice>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[3] },
  card: { gap: space[2] },
  head: { flexDirection: "row", alignItems: "center", gap: space[2] },
  fill: { flex: 1 },
  fact: { flexDirection: "row", gap: space[3] },
  factLabel: { width: 110, paddingTop: 2 },
  factValue: { flex: 1 },
  teacher: { flexDirection: "row", alignItems: "center", gap: space[2] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    minHeight: 48,
  },
  form: { gap: space[4] },
  pair: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
});
