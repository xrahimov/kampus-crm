import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { Staff } from "@/api/office-catalog";
import { useArchiveStaff, useRoles, useStaffList, useStaffRoleCounts } from "@/api/office-staff";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Chip } from "@/components/chip";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Avatar, Badge, Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { TeacherFormSheet } from "@/features/catalog/teacher-form";
import { useSalaryLine } from "@/features/catalog/teachers-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/**
 * Staff (A-244): the site's Settings → Staff. Everyone who signs in, with a
 * search, a chip per role with how many hold it, and the archive. A press on
 * a person opens their card to change (roles, branches, salary, the sign-in
 * code, signing them out everywhere) or to archive them.
 */
export function StaffScreen() {
  const t = useTranslations();
  const ts = useTranslations("staff");
  const me = useMe();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const [role, setRole] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [typed, setTyped] = useState("");
  const [form, setForm] = useState<Staff | "new" | null>(null);
  const [shown, setShown] = useState<Staff | "new">("new");
  const [archiving, setArchiving] = useState(false);
  const q = useRested(typed);
  const query = useStaffList(role, archived, q);
  const counts = useStaffRoleCounts(archived);
  const mayChange = can(me, "staff.update");
  const mayAdd = can(me, "staff.create");
  const mayArchive = can(me, "staff.delete");
  // The form needs the roles; the list alone does not.
  const roles = useRoles(mayChange || mayAdd);
  const archive = useArchiveStaff();
  const people = (query.data?.pages ?? []).flatMap((page) => page.items);
  const person = shown === "new" ? undefined : shown;
  const openForm = (next: Staff | "new") => {
    setShown(next);
    setForm(next);
  };
  const roleName = (one: { code: string; name: string }) =>
    t.has(`roles.${one.code}`) ? t(`roles.${one.code}`) : one.name;
  const total = (counts.data ?? []).reduce((sum, one) => sum + one.count, 0);

  const header = (
    <Header
      back
      title={ts("title")}
      right={
        mayAdd ? (
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={ts("form.addStaff")}
            disabled={!roles.data}
            onPress={() => openForm("new")}
            testID="staff-add"
          />
        ) : undefined
      }
    />
  );

  return (
    <Screen
      header={header}
      onRefresh={() => {
        void query.refetch();
        void counts.refetch();
      }}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      <Text variant="small" tone="mutedForeground">
        {ts("description")}
      </Text>
      <Field
        label={t("mobile.office.searchLabel")}
        value={typed}
        onChangeText={setTyped}
        autoCorrect={false}
        testID="staff-search"
      />
      {counts.data ? (
        <View
          style={styles.chips}
          accessibilityLabel={ts("filterByRole")}
          testID="staff-roles-filter"
        >
          <Chip
            label={ts("allRoles")}
            note={String(total)}
            on={role === null}
            onPress={() => setRole(null)}
            testID="staff-role-all"
          />
          {counts.data
            .filter((one) => one.count > 0 || one.code === role)
            .map((one) => (
              <Chip
                key={one.code}
                label={roleName(one)}
                note={String(one.count)}
                on={role === one.code}
                onPress={() => setRole(one.code)}
                testID={`staff-role-filter-${one.code}`}
              />
            ))}
        </View>
      ) : null}
      <Check
        label={t("common.archived")}
        value={archived}
        onChange={(on) => {
          setArchived(on);
          setRole(null);
        }}
        testID="staff-archived"
      />
      {roles.error ? <Notice tone="warning">{errorText(t, roles.error)}</Notice> : null}
      {query.isLoading ? (
        <Loading />
      ) : !query.data ? (
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      ) : (
        <>
          {query.isError ? <Notice tone="warning">{errorText(t, query.error)}</Notice> : null}
          {people.length === 0 ? (
            <EmptyState title={t("common.nothingFound")} />
          ) : (
            <View style={styles.grid} testID="staff-list">
              {people.map((one) => (
                <View key={one.id} style={wide ? styles.cell : styles.full}>
                  <StaffCard
                    person={one}
                    roleName={roleName}
                    // As on the site: an archived person has no actions.
                    onPress={
                      !one.isArchived && mayChange && roles.data ? () => openForm(one) : undefined
                    }
                  />
                </View>
              ))}
            </View>
          )}
          {query.hasNextPage ? (
            <Button
              variant="outline"
              label={t("mobile.studentsPage.more")}
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
              style={styles.start}
              testID="staff-more"
            />
          ) : null}
        </>
      )}
      <TeacherFormSheet
        key={person?.id ?? "new"}
        open={form !== null && !archiving}
        onClose={() => setForm(null)}
        kind="teachers"
        person={person}
        staff={{ roles: roles.data ?? [] }}
        onArchive={
          mayArchive
            ? () => {
                archive.reset();
                setArchiving(true);
              }
            : undefined
        }
      />
      <Confirm
        open={form !== null && archiving}
        onClose={() => setArchiving(false)}
        title={ts("archiveTitle")}
        text={ts("archiveText", { name: person?.fullName ?? "" })}
        label={t("common.archive")}
        destructive
        loading={archive.isPending}
        problem={archive.error ? errorText(t, archive.error) : null}
        onConfirm={() => {
          if (!person) return;
          archive.mutate(person.id, {
            onSuccess: () => {
              setArchiving(false);
              setForm(null);
            },
          });
        }}
        testID="staff-archive-confirm"
      />
    </Screen>
  );
}

function StaffCard({
  person,
  roleName,
  onPress,
}: {
  person: Staff;
  roleName: (role: { code: string; name: string }) => string;
  onPress?: () => void;
}) {
  const t = useTranslations();
  const ts = useTranslations("staff");
  const salary = useSalaryLine();
  const date = useDate();
  const branches = person.branches.map((branch) => branch.name).join(", ");
  const paid = salary(person);
  return (
    <Card onPress={onPress} style={styles.card} testID={`staff-${person.id}`}>
      <Avatar name={person.fullName} photo={person.photoUrl} size={44} />
      <View style={styles.fill}>
        <View style={styles.name}>
          <Text variant="heading" numberOfLines={1} style={styles.fill}>
            {person.fullName}
          </Text>
          {person.isArchived ? <Badge label={t("common.archived")} /> : null}
        </View>
        <Text variant="figure" tone="mutedForeground">
          {person.phone}
        </Text>
        <View style={styles.badges}>
          {person.roles.map((role) => (
            <Badge key={role.code} tone="accent" label={roleName(role)} />
          ))}
          {person.mustChangePassword ? (
            <Badge
              tone="warning"
              label={ts("temporaryPassword")}
              testID={`staff-temporary-${person.id}`}
            />
          ) : null}
        </View>
        {branches ? (
          <Text variant="small" tone="mutedForeground" numberOfLines={2}>
            {branches}
          </Text>
        ) : null}
        {paid || person.hireDate ? (
          <Text variant="small" tone="mutedForeground" numberOfLines={2}>
            {[
              paid,
              person.hireDate
                ? `${ts("columns.hireDate")}: ${date(dayAsDate(person.hireDate), { dateStyle: "medium" })}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flexDirection: "row", alignItems: "flex-start", gap: space[3], flex: 1 },
  name: { flexDirection: "row", alignItems: "center", gap: space[2] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[1], marginTop: space[1] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
});
