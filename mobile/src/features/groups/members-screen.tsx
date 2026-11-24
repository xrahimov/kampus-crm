import { useLocalSearchParams, useRouter } from "expo-router";
import { UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { useStudentSearch } from "@/api/office-follow-up";
import {
  useLeaveReasons,
  useMemberChange,
  useMembers,
  type LeaveReason,
  type Member,
} from "@/api/office-groups";
import { useStudentOptions } from "@/api/office-students";
import type { Group, MembershipStatus } from "@/api/types";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Chip } from "@/components/chip";
import { Confirm } from "@/components/confirm";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import {
  Avatar,
  Badge,
  Card,
  Divider,
  EmptyState,
  Loading,
  Notice,
  Screen,
  type Tone,
} from "@/components/surface";
import { Text } from "@/components/text";
import { ExcelButton } from "@/features/files/excel-button";
import { centreToday, dayAsDate } from "@/lib/days";
import { fieldErrorOf, isTaken, phoneOrNull } from "@/lib/form";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { PaymentSheet } from "../office/payment-sheet";
import { Problem } from "./group-office";

/** The status moves the office may make by hand (A-08), as on the site. */
export const NEXT: Record<MembershipStatus, MembershipStatus[]> = {
  NEW: ["TRIAL", "ACTIVE"],
  TRIAL: ["ACTIVE"],
  ACTIVE: ["FROZEN", "GRADUATED"],
  FROZEN: ["ACTIVE"],
  ARCHIVED: [],
  GRADUATED: [],
};

export const STATUS_TONE: Record<MembershipStatus, Tone> = {
  NEW: "accent",
  TRIAL: "accent",
  ACTIVE: "success",
  FROZEN: "warning",
  ARCHIVED: "neutral",
  GRADUATED: "neutral",
};

/** A custom price as the server wants it; null when the field is empty. */
function priceOrNull(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

type Doing = "menu" | "transfer" | "billing" | "remove" | "pay" | null;

/**
 * The students of one group for the office (A-233): who is in it, with their
 * status, balance and lessons left; add a student (one the centre has, or a
 * new one), change a status, take a payment, move a student to another group,
 * set the day they are charged from, remove them with a reason, and activate
 * everyone who is new or on trial.
 */
export function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const tm = useTranslations("groups.members");
  const me = useMe();
  const router = useRouter();
  const money = useMoney();
  const date = useDate();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const [removed, setRemoved] = useState(false);
  const [typed, setTyped] = useState("");
  const [adding, setAdding] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState<number | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [doing, setDoing] = useState<Doing>(null);
  const group = useGroup(id);
  const members = useMembers(id, removed);
  const change = useMemberChange(id);
  const mayEdit = can(me, "groups.update");
  const mayPay = can(me, "payments.create");
  const groupArchived = group.data?.status === "ARCHIVED";
  const editable = mayEdit && !groupArchived;
  const day = (iso: string) => date(dayAsDate(iso.slice(0, 10)), { dateStyle: "medium" });

  const header = <Header back title={tm("title")} subtitle={group.data?.name} />;
  if (members.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!members.data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(t, members.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => members.refetch()} />
          }
        />
      </Screen>
    );
  }
  const q = typed.trim().toLowerCase();
  const visible = members.data.filter(
    (m) => !q || m.fullName.toLowerCase().includes(q) || (m.phone ?? "").includes(q),
  );
  const canActivate =
    editable && members.data.some((m) => m.status === "NEW" || m.status === "TRIAL");
  const left = (m: Member) => m.status === "ARCHIVED" || m.status === "GRADUATED";
  const openMember = (m: Member) => {
    if (editable && !left(m)) {
      change.reset();
      setMember(m);
      setDoing("menu");
      return;
    }
    if (can(me, "students.view")) {
      router.push({ pathname: "/staff/student/[id]", params: { id: m.studentId } });
    }
  };
  const closeMember = () => {
    setDoing(null);
    change.reset();
  };

  return (
    <Screen
      header={header}
      onRefresh={() => {
        void members.refetch();
        void group.refetch();
      }}
      refreshing={members.isRefetching}
    >
      <View style={[styles.tools, wide ? styles.toolsWide : null]}>
        <View style={wide ? styles.search : null}>
          <Field
            label={t("mobile.office.searchLabel")}
            value={typed}
            onChangeText={setTyped}
            autoCorrect={false}
            testID="members-search"
          />
        </View>
        <View style={styles.buttons}>
          <Chip
            label={tm("showArchived")}
            on={removed}
            onPress={() => setRemoved((on) => !on)}
            testID="members-removed"
          />
          {canActivate ? (
            <Button
              variant="outline"
              compact
              label={tm("activateAll")}
              onPress={() => {
                change.reset();
                setActivating(true);
              }}
              testID="members-activate"
            />
          ) : null}
          {editable ? (
            <Button
              compact
              icon={<UserPlus size={16} color={colors.primaryForeground} />}
              label={tm("add")}
              onPress={() => setAdding(true)}
              testID="members-add"
            />
          ) : null}
        </View>
      </View>
      {activated !== null ? (
        <Notice tone="success" testID="members-activated">
          {tm("activated", { count: activated })}
        </Notice>
      ) : null}
      {members.isError ? <Notice tone="warning">{errorText(t, members.error)}</Notice> : null}
      {visible.length === 0 ? (
        <EmptyState title={tm("empty")} />
      ) : (
        <Card style={styles.flush} testID="members-list">
          {visible.map((m, index) => (
            <View key={m.id}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => openMember(m)}
                accessibilityRole="button"
                accessibilityLabel={m.fullName}
                style={({ pressed }) => [
                  styles.row,
                  pressed ? { backgroundColor: colors.muted } : null,
                ]}
                testID={`member-row-${m.id}`}
              >
                <Avatar name={m.fullName} />
                <View style={styles.fill}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {m.fullName}
                  </Text>
                  <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                    {[
                      m.phone,
                      `${tm("joined")} ${day(m.joinedAt)}`,
                      m.billingFrom ? `${tm("chargedFrom")} ${day(m.billingFrom)}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                  <View style={styles.badges}>
                    <Badge
                      label={t(`groups.memberStatuses.${m.status}`)}
                      tone={STATUS_TONE[m.status]}
                      testID={`member-status-${m.id}`}
                    />
                    {m.balance !== null ? (
                      <Badge
                        label={money(m.balance)}
                        tone={m.balance < 0 ? "destructive" : m.balance > 0 ? "success" : "neutral"}
                        testID={`member-balance-${m.id}`}
                      />
                    ) : null}
                    {m.lessonsLeft !== null ? (
                      <Badge
                        label={tm("lessonsLeft", { count: m.lessonsLeft })}
                        tone={
                          m.lessonsLeft <= 0
                            ? "destructive"
                            : m.lessonsLeft <= 2
                              ? "warning"
                              : "neutral"
                        }
                      />
                    ) : null}
                    {m.leaveReason ? <Badge label={m.leaveReason} /> : null}
                  </View>
                </View>
              </Pressable>
            </View>
          ))}
        </Card>
      )}
      <ExcelButton
        path={`/groups/${id}/export.xlsx`}
        params={{ archived: removed ? "true" : null }}
        testID="members-excel"
      />

      {group.data ? (
        <AddMemberSheet open={adding} onClose={() => setAdding(false)} group={group.data} />
      ) : null}
      <Confirm
        open={activating}
        onClose={() => setActivating(false)}
        title={tm("activateTitle")}
        text={tm("activateText")}
        label={tm("activateAll")}
        destructive={false}
        loading={change.isPending}
        problem={change.error ? errorText(t, change.error) : null}
        onConfirm={() =>
          change.mutate(
            { kind: "activateAll" },
            {
              onSuccess: (result) => {
                setActivating(false);
                setActivated((result as { activated: number }).activated);
              },
            },
          )
        }
        testID="members-activate-sheet"
      />

      <Sheet
        open={doing === "menu"}
        onClose={closeMember}
        title={member?.fullName ?? ""}
        testID="member-menu"
      >
        {member ? (
          <View style={styles.menu}>
            {NEXT[member.status].length > 0 ? (
              <View style={styles.tight}>
                <Text variant="smallStrong">{tm("changeStatus")}</Text>
                <View style={styles.buttons}>
                  {NEXT[member.status].map((status) => (
                    <Button
                      key={status}
                      variant="outline"
                      compact
                      label={
                        status === "GRADUATED"
                          ? tm("graduate")
                          : t(`groups.memberStatuses.${status}`)
                      }
                      loading={change.isPending}
                      onPress={() =>
                        change.mutate(
                          { kind: "status", membershipId: member.id, status },
                          { onSuccess: closeMember },
                        )
                      }
                      testID={`member-to-${status}`}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {mayPay ? (
              <Button
                variant="saffron"
                label={tm("payment")}
                onPress={() => setDoing("pay")}
                testID="member-pay"
              />
            ) : null}
            <Button
              variant="outline"
              label={tm("transfer")}
              onPress={() => setDoing("transfer")}
              testID="member-transfer"
            />
            <Button
              variant="outline"
              label={tm("editBilling")}
              onPress={() => setDoing("billing")}
              testID="member-billing"
            />
            {can(me, "students.view") ? (
              <Button
                variant="outline"
                label={t("mobile.groups.openStudent")}
                onPress={() => {
                  closeMember();
                  router.push({
                    pathname: "/staff/student/[id]",
                    params: { id: member.studentId },
                  });
                }}
                testID="member-open"
              />
            ) : null}
            <Button
              variant="destructive"
              label={tm("remove")}
              onPress={() => setDoing("remove")}
              testID="member-remove"
            />
            <Problem error={change.error} />
          </View>
        ) : null}
      </Sheet>
      <RemoveSheet open={doing === "remove"} onClose={closeMember} member={member} groupId={id} />
      <BillingSheet open={doing === "billing"} onClose={closeMember} member={member} groupId={id} />
      <TransferSheet
        open={doing === "transfer"}
        onClose={closeMember}
        member={member}
        groupId={id}
      />
      {member && group.data ? (
        <PaymentSheet
          open={doing === "pay"}
          onClose={closeMember}
          student={{
            id: member.studentId,
            fullName: member.fullName,
            groups: [
              {
                membershipId: member.id,
                groupId: id,
                groupName: group.data.name,
                courseName: group.data.courseName,
                status: member.status,
                groupStatus: group.data.status,
                teacherName: null,
                time: null,
                weekdays: [],
                balance: member.balance ?? 0,
              },
            ],
          }}
        />
      ) : null}
    </Screen>
  );
}

/** "Add student": someone the centre already has, found by name or phone, or a new student. */
export function AddMemberSheet({
  open,
  onClose,
  group,
}: {
  open: boolean;
  onClose: () => void;
  group: Group;
}) {
  const t = useTranslations();
  const tm = useTranslations("groups.members");
  const me = useMe();
  const { colors } = useTheme();
  const change = useMemberChange(group.id);
  const mayCreate = can(me, "students.create");
  const [createNew, setCreateNew] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ id: string; fullName: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+998");
  const [joinedAt, setJoinedAt] = useState<string | null>(centreToday());
  const [billingFrom, setBillingFrom] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCreateNew(false);
      setSearch("");
      setPicked(null);
      setFullName("");
      setPhone("+998");
      setJoinedAt(centreToday());
      setBillingFrom(null);
      setCustom(false);
      setPrice("");
      setNote("");
      setMissing(false);
      change.reset();
    }
  }
  const rested = useRested(search);
  const found = useStudentSearch(rested, open && !createNew && picked === null);
  const fieldError = fieldErrorOf(t, change.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const taken = isTaken(change.error, "studentId") ? tm("alreadyIn") : null;
  const submit = () => {
    if (!joinedAt || (createNew ? !fullName.trim() : !picked)) {
      setMissing(true);
      return;
    }
    change.mutate(
      {
        kind: "add",
        input: {
          ...(createNew
            ? { newStudent: { fullName: fullName.trim(), phone: phoneOrNull(phone) } }
            : { studentId: picked?.id }),
          joinedAt,
          billingFrom,
          customPrice: custom ? priceOrNull(price) : null,
          note: note.trim() || null,
          status: "ACTIVE",
        },
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tm("add")}
      testID="member-add"
      footer={
        <Button
          label={t("common.save")}
          loading={change.isPending}
          onPress={submit}
          testID="member-add-save"
        />
      }
    >
      <View style={styles.form}>
        {mayCreate ? (
          <Check
            label={tm("newStudent")}
            value={createNew}
            onChange={setCreateNew}
            testID="member-new"
          />
        ) : null}
        {createNew ? (
          <>
            <Field
              label={t("staff.form.fullName")}
              value={fullName}
              onChangeText={setFullName}
              maxLength={120}
              error={fieldError("newStudent.fullName") ?? required(!fullName.trim())}
              testID="member-name"
            />
            <Field
              label={t("staff.form.phone")}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={17}
              error={fieldError("newStudent.phone")}
              testID="member-phone"
            />
          </>
        ) : picked ? (
          <View style={styles.tight}>
            <View style={[styles.picked, { borderColor: colors.border }]} testID="member-picked">
              <Text variant="bodyStrong" style={styles.fill}>
                {picked.fullName}
              </Text>
              <Button
                variant="ghost"
                compact
                label={t("common.edit")}
                onPress={() => {
                  setPicked(null);
                  change.reset();
                }}
                testID="member-unpick"
              />
            </View>
            {/* The search field that would carry the refusal is gone once a
                student is picked, so it is said here (A-248). */}
            {(taken ?? fieldError("studentId")) ? (
              <Text variant="small" tone="destructive" testID="member-picked-problem">
                {taken ?? fieldError("studentId")}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.tight}>
            <Field
              label={tm("searchStudent")}
              value={search}
              onChangeText={setSearch}
              hint={tm("searchHint")}
              autoCorrect={false}
              error={
                taken ??
                fieldError("studentId") ??
                (missing ? t("validation.studentRequired") : null)
              }
              testID="member-search"
            />
            {(found.data?.items ?? []).map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setPicked({ id: s.id, fullName: s.fullName })}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.found,
                  { borderColor: colors.border },
                  pressed ? { backgroundColor: colors.muted } : null,
                ]}
                testID={`member-found-${s.id}`}
              >
                <Text variant="bodyStrong">{s.fullName}</Text>
                {s.phone ? (
                  <Text variant="small" tone="mutedForeground">
                    {s.phone}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
        <DateField
          label={tm("joinDate")}
          value={joinedAt}
          onChange={setJoinedAt}
          error={fieldError("joinedAt") ?? required(!joinedAt)}
          testID="member-joined"
        />
        <DateField
          label={tm("billingFrom")}
          value={billingFrom}
          onChange={setBillingFrom}
          hint={tm("billingFromHint")}
          error={fieldError("billingFrom")}
          testID="member-billing-from"
        />
        <Check
          label={tm("customPriceToggle")}
          value={custom}
          onChange={setCustom}
          testID="member-custom"
        />
        {custom ? (
          <Field
            label={tm("customPrice")}
            value={price}
            onChangeText={(text) => setPrice(text.replace(/\D/g, "").slice(0, 13))}
            keyboardType="number-pad"
            error={fieldError("customPrice")}
            testID="member-price"
          />
        ) : null}
        <Field
          label={tm("note")}
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          error={fieldError("note")}
          testID="member-note"
        />
        <Problem error={change.error} />
      </View>
    </Sheet>
  );
}

interface MemberSheetProps {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  groupId: string;
}

/** Removing and moving need only whose membership it is: a student's own page opens them too (A-241). */
interface MemberRefSheetProps extends Omit<MemberSheetProps, "member"> {
  member: Pick<Member, "id" | "fullName"> | null;
}

/** The centre's own list of reasons with "Other" for free words (A-92). */
function ReasonFields({
  kind,
  active,
  value,
  onChange,
  testID,
}: {
  kind: LeaveReason["kind"];
  active: boolean;
  value: string;
  onChange: (value: string) => void;
  testID: string;
}) {
  const t = useTranslations("students.remove");
  const reasons = useLeaveReasons(active);
  const list = (reasons.data ?? []).filter((r) => r.kind === kind && r.isActive);
  const [picked, setPicked] = useState<string | null>(null);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setPicked(null);
  }
  return (
    <>
      {list.length > 0 ? (
        <Select
          label={t("reason")}
          value={picked}
          onChange={(id) => {
            setPicked(id);
            onChange(id ? (list.find((r) => r.id === id)?.name ?? "") : "");
          }}
          clearLabel={t("otherReason")}
          placeholder={t("otherReason")}
          options={list.map((r) => ({ value: r.id, label: r.name }))}
          testID={`${testID}-pick`}
        />
      ) : null}
      {picked === null ? (
        <Field
          label={list.length > 0 ? t("otherReason") : t("reason")}
          value={value}
          onChangeText={onChange}
          maxLength={200}
          testID={testID}
        />
      ) : null}
    </>
  );
}

/** "Remove from group", with why: the churn report counts the reasons. */
export function RemoveSheet({ open, onClose, member, groupId }: MemberRefSheetProps) {
  const t = useTranslations();
  const tr = useTranslations("students.remove");
  const change = useMemberChange(groupId);
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("");
      change.reset();
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr("title")}
      testID="member-remove-sheet"
      footer={
        <Button
          variant="destructive"
          label={t("groups.members.remove")}
          loading={change.isPending}
          onPress={() => {
            if (!member) return;
            change.mutate(
              { kind: "remove", membershipId: member.id, reason: reason.trim() || null },
              { onSuccess: onClose },
            );
          }}
          testID="member-remove-save"
        />
      }
    >
      <View style={styles.form}>
        <Text>{tr("text", { name: member?.fullName ?? "" })}</Text>
        <ReasonFields
          kind="LEAVE"
          active={open}
          value={reason}
          onChange={setReason}
          testID="member-remove-reason"
        />
        <Problem error={change.error} />
      </View>
    </Sheet>
  );
}

/** "Change the charged-from date" (A-110). */
function BillingSheet({ open, onClose, member, groupId }: MemberSheetProps) {
  const t = useTranslations();
  const tm = useTranslations("groups.members");
  const change = useMemberChange(groupId);
  const [billingFrom, setBillingFrom] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBillingFrom(member?.billingFrom?.slice(0, 10) ?? null);
      change.reset();
    }
  }
  const fieldError = fieldErrorOf(t, change.error);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tm("editBilling")}
      testID="member-billing-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={change.isPending}
          onPress={() => {
            if (!member) return;
            change.mutate(
              { kind: "billingFrom", membershipId: member.id, billingFrom },
              { onSuccess: onClose },
            );
          }}
          testID="member-billing-save"
        />
      }
    >
      <View style={styles.form}>
        <DateField
          label={tm("billingFrom")}
          value={billingFrom}
          onChange={setBillingFrom}
          hint={tm("billingFromHint")}
          error={fieldError("billingFrom")}
          testID="member-billing-date"
        />
        <Problem error={change.error} />
      </View>
    </Sheet>
  );
}

/** "Move to another group": this membership ends and a new one starts in the other group. */
export function TransferSheet({ open, onClose, member, groupId }: MemberRefSheetProps) {
  const t = useTranslations();
  const tt = useTranslations("students.transfer");
  const tm = useTranslations("groups.members");
  const change = useMemberChange(groupId);
  const options = useStudentOptions(open);
  const [target, setTarget] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(centreToday());
  const [custom, setCustom] = useState(false);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTarget(null);
      setJoinedAt(centreToday());
      setCustom(false);
      setPrice("");
      setNote("");
      setReason("");
      setMissing(false);
      change.reset();
    }
  }
  const groups = (options.data?.groups ?? []).filter(
    (g) => g.id !== groupId && g.status !== "ARCHIVED",
  );
  const fieldError = fieldErrorOf(t, change.error);
  const submit = () => {
    if (!member || !target || !joinedAt) {
      setMissing(true);
      return;
    }
    change.mutate(
      {
        kind: "transfer",
        membershipId: member.id,
        groupId: target,
        joinedAt,
        customPrice: custom ? priceOrNull(price) : null,
        note: note.trim() || null,
        reason: reason.trim() || null,
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${tt("title")}: ${member?.fullName ?? ""}`}
      testID="member-transfer-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={change.isPending}
          onPress={submit}
          testID="member-transfer-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {tt("hint")}
        </Text>
        <Select
          label={tt("group")}
          value={target}
          onChange={setTarget}
          placeholder={t("students.form.groupPlaceholder")}
          options={groups.map((g) => ({
            value: g.id,
            label: g.name,
            note: [g.teacherName, g.time].filter(Boolean).join(", ") || undefined,
          }))}
          error={
            (isTaken(change.error, "groupId") ? tm("alreadyIn") : null) ??
            fieldError("groupId") ??
            (missing && !target ? t("validation.required") : null)
          }
          testID="member-transfer-group"
        />
        <DateField
          label={tt("date")}
          value={joinedAt}
          onChange={setJoinedAt}
          error={fieldError("joinedAt") ?? (missing && !joinedAt ? t("validation.required") : null)}
          testID="member-transfer-date"
        />
        <Check
          label={tm("customPriceToggle")}
          value={custom}
          onChange={setCustom}
          testID="member-transfer-custom"
        />
        {custom ? (
          <Field
            label={tm("customPrice")}
            value={price}
            onChangeText={(text) => setPrice(text.replace(/\D/g, "").slice(0, 13))}
            keyboardType="number-pad"
            error={fieldError("customPrice")}
            testID="member-transfer-price"
          />
        ) : null}
        <ReasonFields
          kind="TRANSFER"
          active={open}
          value={reason}
          onChange={setReason}
          testID="member-transfer-reason"
        />
        <Field
          label={tm("note")}
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          testID="member-transfer-note"
        />
        <Problem error={options.error ?? change.error} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tools: { gap: space[3] },
  toolsWide: { flexDirection: "row", alignItems: "flex-end" },
  search: { flex: 1, maxWidth: 360 },
  buttons: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  fill: { flex: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  menu: { gap: space[3] },
  tight: { gap: space[2] },
  form: { gap: space[4] },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: space[3],
    paddingVertical: space[1],
  },
  found: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
