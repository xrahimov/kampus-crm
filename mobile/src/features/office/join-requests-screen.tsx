import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  useApproveJoin,
  useDeclineJoin,
  useJoinRequests,
  useRoles,
  useStudentSearch,
  type JoinApproval,
  type JoinRequest,
  type JoinTab,
} from "@/api/office-follow-up";
import { useStudentOptions } from "@/api/office-students";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, EmptyState, Notice, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

type StudentMode = "newStudent" | "student" | "parent";

/**
 * Sign-in requests (A-232): people who signed in with Telegram before the
 * centre had their phone number. **Let in** adds them as a new student or a
 * new member of staff, or puts the number on a student who is already there
 * (their own, or a parent's); **Decline** tells them in Telegram. Declined
 * requests stay under their own tab and can still be let in.
 */
export function JoinRequestsScreen() {
  const t = useTranslations();
  const tj = useTranslations("joinRequests");
  const date = useDate();
  const [tab, setTab] = useState<JoinTab>("PENDING");
  const [approving, setApproving] = useState<JoinRequest | null>(null);
  const [declining, setDeclining] = useState<JoinRequest | null>(null);
  const query = useJoinRequests(tab);
  const decline = useDeclineJoin();

  const header = <Header title={tj("title")} back />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data.items;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      <Segmented
        testID="join-tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: "PENDING", label: tj("tabs.PENDING") },
          { value: "DECLINED", label: tj("tabs.DECLINED") },
        ]}
      />
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {rows.length === 0 ? (
        <EmptyState title={tj(`empty.${tab}`)} text={tj("emptyHint")} />
      ) : (
        rows.map((request) => (
          <Card key={request.id} testID={`join-${request.id}`}>
            <View style={styles.line}>
              <Text variant="bodyStrong" style={styles.fill}>
                {request.fullName}
              </Text>
              <Badge label={tj(`kinds.${request.door}`)} tone="accent" />
            </View>
            <View style={styles.facts}>
              <Text variant="small" tone="mutedForeground">
                {request.phone}
                {request.branchName ? ` · ${request.branchName}` : ""}
              </Text>
              {request.note ? (
                <Text variant="small">{tj("theirNote", { note: request.note })}</Text>
              ) : null}
              <Text variant="small" tone="mutedForeground">
                {date(new Date(request.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                {request.decidedByName
                  ? ` · ${tj("declinedBy", { name: request.decidedByName })}`
                  : ""}
              </Text>
            </View>
            <View style={styles.wrap}>
              <Button
                compact
                label={tj("approve")}
                onPress={() => setApproving(request)}
                testID={`join-approve-${request.id}`}
              />
              {tab === "PENDING" ? (
                <Button
                  variant="outline"
                  compact
                  label={tj("decline")}
                  onPress={() => setDeclining(request)}
                  testID={`join-decline-${request.id}`}
                />
              ) : null}
            </View>
          </Card>
        ))
      )}
      <Text variant="small" tone="mutedForeground">
        {tj("selfClosing")}
      </Text>
      <Approve request={approving} onClose={() => setApproving(null)} />
      <Confirm
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title={tj("declineTitle")}
        text={declining ? tj("declineHint", { name: declining.fullName }) : undefined}
        label={tj("decline")}
        loading={decline.isPending}
        problem={decline.error ? errorText(t, decline.error) : null}
        onConfirm={() => {
          if (declining) decline.mutate(declining.id, { onSuccess: () => setDeclining(null) });
        }}
        testID="join-decline-sheet"
      />
    </Screen>
  );
}

function Approve({ request, onClose }: { request: JoinRequest | null; onClose: () => void }) {
  const t = useTranslations();
  const tj = useTranslations("joinRequests");
  const me = useMe();
  const { colors } = useTheme();
  // The last request stays while the sheet slides away.
  const [shown, setShown] = useState(request);
  const [mode, setMode] = useState<StudentMode>("newStudent");
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE">("MALE");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [missing, setMissing] = useState(false);
  const approve = useApproveJoin();
  const [seen, setSeen] = useState(request);
  if (request !== seen) {
    setSeen(request);
    if (request) {
      setShown(request);
      setMode("newStudent");
      setFullName(request.fullName);
      setGender("MALE");
      setBranchId(
        me.branches.some((b) => b.id === request.branchId)
          ? request.branchId
          : (me.branches[0]?.id ?? null),
      );
      setGroupId(null);
      setRoleCode(null);
      setStudent(null);
      setTyped("");
      setMissing(false);
      approve.reset();
    }
  }
  const open = request !== null;
  const staff = shown?.door === "STAFF";
  const canLink = can(me, "students.update");
  const q = useRested(typed);
  const options = useStudentOptions(open && !staff && can(me, "students.view"));
  const roles = useRoles(open && staff && can(me, "staff.view"));
  const found = useStudentSearch(q, open && !staff && mode !== "newStudent" && student === null);
  if (!shown) return null;
  const groups = (options.data?.groups ?? []).filter(
    (g) => g.status !== "ARCHIVED" && g.branchId === branchId,
  );

  const build = (): JoinApproval | null => {
    const name = fullName.trim();
    if (staff) {
      if (!name || !branchId || !roleCode) return null;
      return { mode: "newStaff", fullName: name, branchId, gender, roleCode };
    }
    if (mode === "newStudent") {
      if (!name || !branchId) return null;
      return { mode, fullName: name, branchId, gender, groupId };
    }
    if (!student) return null;
    if (mode === "student") return { mode, studentId: student.id };
    if (!name) return null;
    return { mode: "parent", studentId: student.id, fullName: name };
  };

  const save = () => {
    const approval = build();
    if (!approval) {
      setMissing(true);
      return;
    }
    setMissing(false);
    approve.mutate({ id: shown.id, approval }, { onSuccess: onClose });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tj("approveTitle", { name: shown.fullName })}
      testID="join-approve"
      footer={
        <Button
          label={tj("approve")}
          loading={approve.isPending}
          onPress={save}
          testID="join-approve-save"
        />
      }
    >
      <View style={styles.form}>
        <Text tone="mutedForeground">
          {tj(staff ? "approveStaffHint" : "approveStudentHint", { phone: shown.phone })}
        </Text>
        {shown.note ? <Text>{tj("theirNote", { note: shown.note })}</Text> : null}
        {!staff && canLink ? (
          <Select
            label={tj("modeLabel")}
            value={mode}
            onChange={(value) => {
              setMode(value ?? "newStudent");
              setStudent(null);
            }}
            options={(["newStudent", "student", "parent"] as const).map((m) => ({
              value: m,
              label: tj(`modes.${m}`),
            }))}
            testID="join-mode"
          />
        ) : null}
        {!staff && mode !== "newStudent" ? (
          student ? (
            <View style={styles.line}>
              <View style={styles.fill}>
                <Text variant="small" tone="mutedForeground">
                  {tj("existingStudent")}
                </Text>
                <Text variant="bodyStrong" testID="join-student-picked">
                  {student.name}
                </Text>
              </View>
              <Button
                variant="ghost"
                compact
                label={t("common.edit")}
                onPress={() => setStudent(null)}
                testID="join-student-change"
              />
            </View>
          ) : (
            <View style={styles.facts}>
              <Field
                label={tj("existingStudent")}
                value={typed}
                onChangeText={setTyped}
                placeholder={t("leads.form.referrerPlaceholder")}
                autoCorrect={false}
                error={missing ? t("validation.required") : null}
                testID="join-student-search"
              />
              {(found.data?.items ?? []).map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => setStudent({ id: row.id, name: row.fullName })}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.found,
                    { borderColor: colors.border },
                    pressed ? { backgroundColor: colors.muted } : null,
                  ]}
                  testID={`join-student-${row.id}`}
                >
                  <Text>{row.fullName}</Text>
                  {row.phone ? (
                    <Text variant="small" tone="mutedForeground">
                      {row.phone}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
              {q.length >= 2 && found.data && found.data.items.length === 0 ? (
                <Text variant="small" tone="mutedForeground">
                  {t("common.nothingFound")}
                </Text>
              ) : null}
            </View>
          )
        ) : null}
        {!staff && mode === "student" && student ? (
          <Text variant="small" tone="mutedForeground">
            {tj("studentHint", { phone: shown.phone })}
          </Text>
        ) : null}
        {!staff && mode === "parent" && student ? (
          <Text variant="small" tone="mutedForeground">
            {tj("parentHint", { phone: shown.phone })}
          </Text>
        ) : null}
        {staff || mode !== "student" ? (
          <Field
            label={!staff && mode === "parent" ? tj("parentName") : tj("fullName")}
            value={fullName}
            onChangeText={setFullName}
            maxLength={120}
            error={missing && !fullName.trim() ? t("validation.required") : null}
            testID="join-name"
          />
        ) : null}
        {staff || mode === "newStudent" ? (
          <>
            {me.branches.length > 1 ? (
              <Select
                label={t("leads.waitlist.fields.branch")}
                value={branchId}
                onChange={(value) => {
                  setBranchId(value);
                  setGroupId(null);
                }}
                options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
                error={missing && !branchId ? t("validation.required") : null}
                testID="join-branch"
              />
            ) : null}
            <View style={styles.facts}>
              <Text variant="smallStrong">{tj("gender")}</Text>
              <Segmented
                testID="join-gender"
                value={gender}
                onChange={setGender}
                options={[
                  { value: "MALE", label: t("students.genders.MALE") },
                  { value: "FEMALE", label: t("students.genders.FEMALE") },
                ]}
              />
            </View>
          </>
        ) : null}
        {!staff && mode === "newStudent" && options.data ? (
          <Select
            label={tj("group")}
            value={groupId}
            onChange={setGroupId}
            placeholder={tj("noGroup")}
            clearLabel={tj("noGroup")}
            options={groups.map((g) => ({ value: g.id, label: g.name }))}
            testID="join-group"
          />
        ) : null}
        {staff ? (
          <Select
            label={tj("role")}
            value={roleCode}
            onChange={setRoleCode}
            placeholder={tj("chooseRole")}
            options={(roles.data ?? [])
              .filter((r) => r.isActive)
              .map((r) => ({ value: r.code, label: r.name }))}
            error={missing && !roleCode ? t("validation.required") : null}
            testID="join-role"
          />
        ) : null}
        {missing ? (
          <Notice tone="destructive" testID="join-fill-all">
            {tj("fillAll")}
          </Notice>
        ) : null}
        {approve.error ? (
          <Notice tone="destructive" testID="join-problem">
            {errorText(t, approve.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4] },
  form: { gap: space[4] },
  fill: { flex: 1 },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  facts: { gap: space[2] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  found: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
