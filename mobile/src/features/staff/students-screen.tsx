import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus, SlidersHorizontal, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { countFilters, useStudents, type StudentFilters } from "@/api/staff-students";
import type { StudentRow } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Avatar, Badge, Card, Divider, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { ExcelButton } from "@/features/files/excel-button";
import { filtersFromParams, StudentFilterSheet } from "@/features/office/student-filters";
import { StudentFormSheet } from "@/features/office/student-form";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/** How long the typing rests before the list is asked for again. */
const SEARCH_REST_MS = 300;

/**
 * The students a person may see, in the app (A-220): by name, found by name
 * or phone, each opening the student's page. The server keeps a teacher's
 * list to the groups they teach. The office narrows the list with the site's
 * filters and adds a student from here (A-231); a figure of the home page
 * arrives with its filter already set ("/students?paymentStatus=DEBTOR").
 */
export function StudentsScreen() {
  const t = useTranslations();
  const tm = useTranslations("mobile.studentsPage");
  const to = useTranslations("mobile.office");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), SEARCH_REST_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  const me = useMe();
  const { colors } = useTheme();
  const office = me.view.current === "FULL";
  const params = useLocalSearchParams();
  const arrived = JSON.stringify(filtersFromParams(params));
  const [filters, setFilters] = useState<StudentFilters>(() => filtersFromParams(params));
  // The page was opened again with another filter (another figure of the home page).
  const [seen, setSeen] = useState(arrived);
  if (arrived !== seen) {
    setSeen(arrived);
    setFilters(JSON.parse(arrived) as StudentFilters);
  }
  const [choosing, setChoosing] = useState(false);
  const [adding, setAdding] = useState(false);
  const set = countFilters(filters);
  const query = useStudents(q, filters);

  const header = (
    <Header
      title={t("nav.students")}
      right={
        can(me, "students.create") ? (
          <Button
            compact
            label={t("students.add")}
            icon={<Plus size={18} color={colors.primaryForeground} />}
            onPress={() => setAdding(true)}
            testID="student-add"
          />
        ) : undefined
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data.pages.flatMap((page) => page.items);
  const total = query.data.pages[0]?.total ?? 0;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      contentStyle={styles.column}
    >
      <Field
        label={tm("search")}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="students-search"
      />
      <View style={styles.tools}>
        <Text variant="small" tone="mutedForeground" style={styles.fill} testID="students-count">
          {t("mobile.students", { count: total })}
        </Text>
        {office ? (
          <>
            {set > 0 ? (
              <Button
                compact
                variant="ghost"
                label={to("clearFilters")}
                icon={<X size={16} color={colors.primary} />}
                onPress={() => setFilters({})}
                testID="students-clear-filters"
              />
            ) : null}
            <Button
              compact
              variant="outline"
              label={set > 0 ? to("filtersSet", { count: set }) : to("filters")}
              icon={<SlidersHorizontal size={16} color={colors.foreground} />}
              onPress={() => setChoosing(true)}
              testID="students-filters"
            />
          </>
        ) : null}
      </View>
      {rows.length === 0 ? (
        <EmptyState title={q || set > 0 ? tm("none") : tm("noneYet")} />
      ) : (
        <Card style={[styles.flush, query.isPlaceholderData ? styles.stale : null]}>
          {rows.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <Divider /> : null}
              <Row row={row} />
            </View>
          ))}
        </Card>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={tm("more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          style={styles.start}
          testID="students-more"
        />
      ) : null}
      {total > 0 ? (
        <ExcelButton
          path="/students/export.xlsx"
          params={{ sort: "fullName:asc", q, ...filters }}
          testID="students-excel"
        />
      ) : null}
      <StudentFilterSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        value={filters}
        onChange={setFilters}
      />
      <StudentFormSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

function Row({ row }: { row: StudentRow }) {
  const t = useTranslations();
  const router = useRouter();
  const money = useMoney();
  const { colors } = useTheme();
  // The groups the student is in now; one who left them all says so.
  const groups = row.groups
    .filter((g) => g.status !== "ARCHIVED" && g.status !== "GRADUATED")
    .map((g) => g.groupName);
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/staff/student/[id]", params: { id: row.id } })}
      accessibilityRole="button"
      accessibilityLabel={row.fullName}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
      testID={`student-${row.id}`}
    >
      <Avatar name={row.fullName} photo={row.photoUrl} />
      <View style={styles.fill}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {row.fullName}
        </Text>
        <Text variant="small" tone="mutedForeground" numberOfLines={1}>
          {groups.length > 0 ? groups.join(", ") : t("students.noGroups")}
        </Text>
        {row.balance < 0 ? (
          <Text variant="small" tone="destructive" testID="student-owes">
            {t("mobile.owes", { amount: money(-row.balance) })}
          </Text>
        ) : null}
      </View>
      {row.isArchived ? <Badge label={t("common.archived")} /> : null}
      {row.gradeAverage !== null ? (
        <View style={styles.average}>
          <Text variant="figure">{row.gradeAverage}</Text>
          <Text variant="small" tone="mutedForeground">
            {t("groups.grades.average")}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[3], maxWidth: 720 },
  flush: { padding: 0, gap: 0 },
  stale: { opacity: 0.6 },
  start: { alignSelf: "flex-start" },
  tools: { flexDirection: "row", alignItems: "center", gap: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 56,
  },
  average: { alignItems: "flex-end" },
});
