import { useLocalSearchParams, useRouter } from "expo-router";
import { MessageSquare, Plus, SlidersHorizontal, UserCheck, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useActivateStudents } from "@/api/office-students";
import { countFilters, useStudents, type StudentFilters } from "@/api/staff-students";
import type { StudentRow } from "@/api/types";
import { Button } from "@/components/button";
import { Check, Tick } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Avatar, Badge, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { ExcelButton } from "@/features/files/excel-button";
import { ImportMenu, type ImportKind } from "@/features/files/import-button";
import { SendSmsSheet } from "@/features/office/sms-sheet";
import { filtersFromParams, StudentFilterSheet } from "@/features/office/student-filters";
import { StudentFormSheet } from "@/features/office/student-form";
import { mayBulkStudents, StudentsBulkBar } from "@/features/office/students-bulk";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useMoney, useTranslations } from "@/lib/i18n";
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
 * The office also ticks several students for one thing done to all of them,
 * writes one SMS to everyone the list shows, and activates the new and trial
 * students among them (A-260).
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
  // The students ticked for one thing done to all of them (A-260).
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [texting, setTexting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState<string | null>(null);
  const activate = useActivateStudents();
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
  // The site's "Import" menu: each import shows to whoever may do what it does.
  const mayAdd = can(me, "students.create");
  const mayPay = can(me, "payments.create");
  const imports: ImportKind[] = [
    mayAdd && {
      id: "students-import-new",
      title: t("students.importExcel"),
      templatePath: "/students/import-template.xlsx",
      importPath: "/students/import",
      toBranch: true,
    },
    mayPay &&
      !filters.archived && {
        id: "students-import-balances",
        title: t("students.importBalances"),
        description: t("students.importBalancesHint"),
        templatePath: "/students/import-balances-template.xlsx",
        importPath: "/students/import-balances",
        toBranch: true,
        preview: true,
      },
    can(me, "students.update") && {
      id: "students-import-parents",
      title: t("students.importParents"),
      description: t("excel.hints.parents"),
      templatePath: "/students/import-parents-template.xlsx",
      importPath: "/students/import-parents",
      toBranch: true,
    },
    mayAdd && {
      id: "students-import-archived",
      title: t("students.importArchived"),
      description: t("students.importArchivedHint"),
      templatePath: "/students/import-archived-template.xlsx",
      importPath: "/students/import-archived",
      toBranch: true,
      preview: true,
    },
    mayPay && {
      id: "students-import-history",
      title: t("students.importHistory"),
      description: t("students.importHistoryHint"),
      templatePath: "/students/import-history-template.xlsx",
      importPath: "/students/import-history",
      toBranch: true,
      preview: true,
    },
  ].filter((kind) => kind !== false);
  const total = query.data.pages[0]?.total ?? 0;
  const archived = filters.archived === true;
  const bulk = office && mayBulkStudents(me);
  // Only the ticked students still in the list count: a search may have taken some away.
  const tickedIds = rows.filter((row) => ticked.has(row.id)).map((row) => row.id);
  const allTicked = rows.length > 0 && tickedIds.length === rows.length;
  const tick = (id: string) =>
    setTicked((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  // "Activate" has something to do when a listed student is new or on trial in a group.
  const waiting = rows.some((row) =>
    row.groups.some((g) => g.status === "NEW" || g.status === "TRIAL"),
  );

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
      {activated ? (
        <Notice tone="success" testID="students-activated">
          {activated}
        </Notice>
      ) : null}
      {bulk ? (
        <StudentsBulkBar ids={tickedIds} onClear={() => setTicked(new Set())} archived={archived} />
      ) : null}
      {bulk && rows.length > 0 ? (
        <Check
          label={t("students.bulk.selectAll")}
          value={allTicked}
          onChange={(all) => setTicked(new Set(all ? rows.map((row) => row.id) : []))}
          testID="students-select-all"
        />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={q || set > 0 ? tm("none") : tm("noneYet")} />
      ) : (
        <Card style={[styles.flush, query.isPlaceholderData ? styles.stale : null]}>
          {rows.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                row={row}
                ticked={ticked.has(row.id)}
                onTick={bulk ? () => tick(row.id) : undefined}
              />
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
      <View style={styles.actions}>
        {total > 0 ? (
          <ExcelButton
            path="/students/export.xlsx"
            params={{ sort: "fullName:asc", q, ...filters }}
            testID="students-excel"
          />
        ) : null}
        {office && can(me, "sms.send") && total > 0 ? (
          <Button
            variant="outline"
            label={t("students.sms")}
            icon={<MessageSquare size={18} color={colors.foreground} />}
            onPress={() => setTexting(true)}
            testID="students-sms"
          />
        ) : null}
        {office && can(me, "groups.update") && !archived && waiting ? (
          <Button
            variant="outline"
            label={t("students.activate")}
            icon={<UserCheck size={18} color={colors.foreground} />}
            onPress={() => {
              activate.reset();
              setActivating(true);
            }}
            testID="students-activate"
          />
        ) : null}
        {office ? (
          <ImportMenu label={t("students.importMenu")} kinds={imports} testID="students-import" />
        ) : null}
      </View>
      <SendSmsSheet
        open={texting}
        onClose={() => setTexting(false)}
        target={texting ? { kind: "studentFilter", ...filters, ...(q ? { q } : {}) } : null}
        title={t("sms.send.title")}
        testID="students-sms-sheet"
      />
      <Confirm
        open={activating}
        onClose={() => setActivating(false)}
        title={t("students.activateTitle")}
        text={t("students.activateText", { count: rows.length })}
        label={t("students.activate")}
        loading={activate.isPending}
        problem={activate.error ? errorText(t, activate.error) : null}
        onConfirm={() =>
          activate.mutate(
            rows.map((row) => row.id),
            {
              onSuccess: (result) => {
                setActivating(false);
                setActivated(t("students.activated", { count: result.activated }));
              },
            },
          )
        }
        testID="students-activate-confirm"
      />
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

function Row({
  row,
  ticked,
  onTick,
}: {
  row: StudentRow;
  ticked: boolean;
  /** With it the row has a tick box, for doing one thing to several students (A-260). */
  onTick?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const money = useMoney();
  const { colors } = useTheme();
  // The groups the student is in now; one who left them all says so.
  const groups = row.groups
    .filter((g) => g.status !== "ARCHIVED" && g.status !== "GRADUATED")
    .map((g) => g.groupName);
  const body = (
    <Pressable
      onPress={() => router.push({ pathname: "/staff/student/[id]", params: { id: row.id } })}
      accessibilityRole="button"
      accessibilityLabel={row.fullName}
      style={({ pressed }) => [
        styles.row,
        onTick ? styles.beside : null,
        pressed ? { backgroundColor: colors.muted } : null,
      ]}
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
  if (!onTick) return body;
  return (
    <View style={styles.ticked}>
      <Tick
        ticked={ticked}
        onPress={onTick}
        label={t("students.bulk.select", { name: row.fullName })}
        testID={`student-tick-${row.id}`}
      />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[3], maxWidth: 720 },
  flush: { padding: 0, gap: 0 },
  stale: { opacity: 0.6 },
  start: { alignSelf: "flex-start" },
  tools: { flexDirection: "row", alignItems: "center", gap: space[2] },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  ticked: { flexDirection: "row", alignItems: "stretch" },
  beside: { flex: 1, paddingLeft: space[2] },
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
