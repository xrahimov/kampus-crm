import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useArchiveTeacher, useTeacher, type TeacherGroup } from "@/api/office-catalog";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Header } from "@/components/header";
import { Fact } from "@/components/rows";
import { Avatar, Badge, Card, Divider, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { GROUP_STATUS_TONE } from "@/features/groups/group-office";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { HoursCard } from "./hours";
import { TeacherFormSheet } from "./teacher-form";
import { useSalaryLine } from "./teachers-screen";

const STATS = ["courses", "activeGroups", "activeStudents"] as const;

/**
 * One teacher for the office (A-234): the site's teacher page. Who they are
 * and how they are paid, three counts, the groups they teach or support, and
 * the hours they keep open for 1:1 booking. Whoever may change teachers edits
 * and archives here; an archived teacher is only read.
 */
export function TeacherScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const td = useTranslations("teachers.detail");
  const me = useMe();
  const router = useRouter();
  const date = useDate();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const salary = useSalaryLine();
  const query = useTeacher(id);
  const archive = useArchiveTeacher();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const header = <Header back title={query.data?.fullName ?? t("teachers.title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const teacher = query.data;
  const support = teacher.roles.some((r) => r.code === "SUPPORT_TEACHER");
  const mayChange = can(me, "teachers.update") && !teacher.isArchived;
  const mayArchive = can(me, "teachers.delete") && !teacher.isArchived && teacher.id !== me.user.id;
  const day = (iso: string) =>
    date(dayAsDate(iso.slice(0, 10)), { day: "numeric", month: "short", year: "numeric" });

  const profile = (
    <Card testID="teacher-profile">
      <View style={styles.person}>
        <Avatar name={teacher.fullName} photo={teacher.photoUrl} size={56} />
        <View style={styles.fill}>
          <Text variant="title">{teacher.fullName}</Text>
          <View style={styles.badges}>
            {teacher.roles.map((role) => (
              <Badge
                key={role.code}
                label={t.has(`roles.${role.code}`) ? t(`roles.${role.code}`) : role.name}
                tone="accent"
              />
            ))}
            {teacher.isArchived ? (
              <Badge label={t("common.archived")} testID="teacher-archived" />
            ) : null}
          </View>
        </View>
      </View>
      <View style={styles.facts}>
        <Fact label={t("staff.columns.phone")} value={teacher.phone} />
        <Fact label={td("registered")} value={day(teacher.createdAt)} />
        <Fact
          label={td("branches")}
          value={teacher.branches.map((b) => b.name).join(", ") || "—"}
        />
        {salary(teacher) ? (
          <Fact
            label={t("staff.form.salaryMethod")}
            value={salary(teacher) ?? ""}
            testID="teacher-salary-line"
          />
        ) : null}
        {teacher.hireDate ? (
          <Fact label={t("staff.columns.hireDate")} value={day(teacher.hireDate)} />
        ) : null}
        {teacher.birthDate ? (
          <Fact label={t("staff.columns.birthDate")} value={day(teacher.birthDate)} />
        ) : null}
      </View>
      <View style={styles.stats}>
        {STATS.map((key) => (
          <View
            key={key}
            style={[styles.stat, { backgroundColor: colors.muted }]}
            testID={`teacher-stat-${key}`}
          >
            <Text variant="title" style={styles.number}>
              {teacher.stats[key]}
            </Text>
            <Text variant="small" tone="mutedForeground">
              {td(key)}
            </Text>
          </View>
        ))}
      </View>
      {mayChange || mayArchive ? (
        <View style={styles.actions}>
          {mayChange ? (
            <Button
              variant="outline"
              label={t("common.edit")}
              onPress={() => setEditing(true)}
              testID="teacher-edit"
            />
          ) : null}
          {mayArchive ? (
            <Button
              variant="ghost"
              label={t("common.archive")}
              onPress={() => setArchiving(true)}
              testID="teacher-archive"
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );

  const groups = (
    <Card style={styles.flush} testID="teacher-groups">
      <Text variant="heading" style={styles.cardTitle}>
        {td("groups")}
      </Text>
      {teacher.groups.length === 0 ? (
        <Text variant="small" tone="mutedForeground" style={styles.empty}>
          {t("teachers.noGroups")}
        </Text>
      ) : (
        teacher.groups.map((group, index) => (
          <View key={`${group.id}-${group.role}`}>
            {index > 0 ? <Divider /> : null}
            <GroupRow
              group={group}
              period={`${day(group.startDate)} – ${day(group.endDate)}`}
              onPress={() =>
                router.push({ pathname: "/staff/group/[id]", params: { id: group.id } })
              }
            />
          </View>
        ))
      )}
    </Card>
  );

  const hours = (
    <HoursCard
      userId={teacher.id}
      canEdit={(can(me, "teachers.update") || teacher.id === me.user.id) && !teacher.isArchived}
    />
  );

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={wide ? styles.split : undefined}
    >
      {wide ? (
        <>
          <View style={styles.column}>
            {profile}
            {hours}
          </View>
          <View style={styles.column}>{groups}</View>
        </>
      ) : (
        <>
          {profile}
          {groups}
          {hours}
        </>
      )}
      <TeacherFormSheet
        open={editing}
        onClose={() => setEditing(false)}
        kind={support ? "support" : "teachers"}
        person={teacher}
      />
      <Confirm
        open={archiving}
        onClose={() => setArchiving(false)}
        title={t("teachers.archiveTitle")}
        text={t("teachers.archiveText", { name: teacher.fullName })}
        label={t("common.archive")}
        destructive
        loading={archive.isPending}
        problem={archive.error ? errorText(t, archive.error) : null}
        onConfirm={() =>
          archive.mutate(teacher.id, {
            onSuccess: () => {
              setArchiving(false);
              router.back();
            },
          })
        }
        testID="teacher-archive-confirm"
      />
    </Screen>
  );
}

function GroupRow({
  group,
  period,
  onPress,
}: {
  group: TeacherGroup;
  period: string;
  onPress: () => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
      testID={`teacher-group-${group.id}`}
    >
      <View style={styles.name}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.fill}>
          {group.name}
        </Text>
        {group.status !== "ACTIVE" ? (
          <Badge
            label={t(`groups.statuses.${group.status}`)}
            tone={GROUP_STATUS_TONE[group.status]}
          />
        ) : null}
      </View>
      <Text variant="small" tone="mutedForeground" numberOfLines={1}>
        {[
          group.courseName,
          group.role === "SUPPORT"
            ? t("groups.columns.support")
            : t(`groups.teacherRoles.${group.role}`),
          t("mobile.students", { count: group.activeStudents }),
        ].join(", ")}
      </Text>
      <Text variant="small" tone="mutedForeground">
        {period}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[4] },
  column: { flex: 1, gap: space[4] },
  person: { flexDirection: "row", alignItems: "center", gap: space[3] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[1], marginTop: space[1] },
  facts: { gap: space[2] },
  stats: { flexDirection: "row", gap: space[2] },
  stat: { flex: 1, borderRadius: 12, padding: space[3], gap: 2 },
  number: { fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  cardTitle: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[2] },
  empty: { paddingHorizontal: space[4], paddingBottom: space[4] },
  row: { paddingHorizontal: space[4], paddingVertical: space[3], gap: 2 },
  name: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
