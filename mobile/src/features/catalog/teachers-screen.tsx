import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  SALARY_AMOUNT_FIELD,
  TEACHER_KINDS,
  useTeacherList,
  type Staff,
  type TeacherKind,
  type TeacherRow,
} from "@/api/office-catalog";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Loading,
  Notice,
  Screen,
  Segmented,
} from "@/components/surface";
import { Text } from "@/components/text";
import { ExcelButton } from "@/features/files/excel-button";
import { errorText, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { TeacherFormSheet } from "./teacher-form";

/** How a teacher is paid, in one line: "Percent: 40%", "Monthly: 3 000 000 so'm". */
export function useSalaryLine(): (person: Staff) => string | null {
  const t = useTranslations("staff.form.methods");
  const money = useMoney();
  return (person) => {
    if (!person.salaryMethod) return null;
    const value = person[SALARY_AMOUNT_FIELD[person.salaryMethod]];
    if (value === null) return t(person.salaryMethod);
    return `${t(person.salaryMethod)}: ${person.salaryMethod === "PERCENT" ? `${value}%` : money(value)}`;
  };
}

/**
 * The centre's teachers (A-234): the site's Teachers page. Teachers and
 * support teachers are two lists, each with a search and its archive, and a
 * person opens to their own page. "New teacher" adds to the list in view.
 */
export function TeachersScreen() {
  const t = useTranslations();
  const me = useMe();
  const router = useRouter();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const [kind, setKind] = useState<TeacherKind>("teachers");
  const [archived, setArchived] = useState(false);
  const [typed, setTyped] = useState("");
  const [adding, setAdding] = useState(false);
  const q = useRested(typed);
  const query = useTeacherList(kind, archived, q);
  const open = (id: string) => router.push({ pathname: "/staff/teachers/[id]", params: { id } });
  const people = (query.data?.pages ?? []).flatMap((page) => page.items);

  const header = (
    <Header
      back
      title={t("teachers.title")}
      right={
        can(me, "teachers.create") ? (
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={t("teachers.add")}
            onPress={() => setAdding(true)}
            testID="teachers-add"
          />
        ) : undefined
      }
    />
  );

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      <Segmented
        value={kind}
        onChange={setKind}
        options={TEACHER_KINDS.map((k) => ({ value: k, label: t(`teachers.tabs.${k}`) }))}
        testID="teachers-kind"
      />
      <Field
        label={t("mobile.office.searchLabel")}
        value={typed}
        onChangeText={setTyped}
        autoCorrect={false}
        testID="teachers-search"
      />
      <Check
        label={t("common.archived")}
        value={archived}
        onChange={setArchived}
        testID="teachers-archived"
      />
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
            <View style={styles.grid} testID="teachers-list">
              {people.map((person) => (
                <View key={person.id} style={wide ? styles.cell : styles.full}>
                  <TeacherCard person={person} kind={kind} onPress={() => open(person.id)} />
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
              testID="teachers-more"
            />
          ) : null}
          <ExcelButton
            path="/teachers/export.xlsx"
            params={{ tab: kind, sort: "fullName:asc", archived: archived ? "true" : null, q }}
            testID="teachers-excel"
          />
        </>
      )}
      <TeacherFormSheet
        open={adding}
        onClose={() => setAdding(false)}
        kind={kind}
        onSaved={(saved) => open(saved.id)}
      />
    </Screen>
  );
}

function TeacherCard({
  person,
  kind,
  onPress,
}: {
  person: TeacherRow;
  kind: TeacherKind;
  onPress: () => void;
}) {
  const t = useTranslations();
  const salary = useSalaryLine();
  // The site's table: what a teacher is paid, and the groups of a support teacher.
  const second =
    kind === "teachers"
      ? salary(person)
      : person.groupNames.length > 0
        ? person.groupNames.join(", ")
        : t("teachers.noGroups");
  return (
    <Card onPress={onPress} style={styles.card} testID={`teacher-${person.id}`}>
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
        {second ? (
          <Text variant="small" tone="mutedForeground" numberOfLines={2}>
            {second}
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
  card: { flexDirection: "row", alignItems: "center", gap: space[3], flex: 1 },
  name: { flexDirection: "row", alignItems: "center", gap: space[2] },
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
});
