import { Archive, ListOrdered, Pencil, Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useArchiveCourse, useCourses, type Course } from "@/api/office-catalog";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { Header } from "@/components/header";
import { ActionRow } from "@/components/rows";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

import { CourseFormSheet, SyllabusSheet } from "./course-form";

type Doing = "menu" | "edit" | "syllabus" | "archive";

/**
 * The centre's courses (A-234): the site's Settings → Courses. Each course
 * with its colour, branch, monthly price, length and grading system; a press
 * offers Edit, Syllabus and Archive. Archived courses are a list of their own
 * and are only read, as on the site.
 */
export function CoursesScreen() {
  const t = useTranslations();
  const tc = useTranslations("settings.courses");
  const { wide } = useLayout();
  const { colors } = useTheme();
  const [archived, setArchived] = useState(false);
  const query = useCourses(archived);
  const archive = useArchiveCourse();
  const [adding, setAdding] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [doing, setDoing] = useState<Doing | null>(null);
  const start = (next: Course) => {
    setCourse(next);
    setDoing("menu");
  };

  const header = (
    <Header
      back
      title={tc("title")}
      right={
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={tc("add")}
          onPress={() => setAdding(true)}
          testID="courses-add"
        />
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const courses = query.data.items;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Check
        label={t("common.archived")}
        value={archived}
        onChange={setArchived}
        testID="courses-archived"
      />
      {courses.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <View style={styles.grid} testID="courses-list">
          {courses.map((item) => (
            <View key={item.id} style={wide ? styles.cell : styles.full}>
              <CourseCard course={item} onPress={item.isArchived ? undefined : () => start(item)} />
            </View>
          ))}
        </View>
      )}

      <Sheet
        open={doing === "menu"}
        onClose={() => setDoing(null)}
        title={course?.name ?? ""}
        testID="course-menu"
      >
        <View>
          <ActionRow
            icon={Pencil}
            label={tc("edit")}
            onPress={() => setDoing("edit")}
            testID="course-do-edit"
          />
          <Divider />
          <ActionRow
            icon={ListOrdered}
            label={tc("syllabus")}
            onPress={() => setDoing("syllabus")}
            testID="course-do-syllabus"
          />
          <Divider />
          <ActionRow
            icon={Archive}
            label={t("common.archive")}
            destructive
            onPress={() => {
              archive.reset();
              setDoing("archive");
            }}
            testID="course-do-archive"
          />
        </View>
      </Sheet>
      <CourseFormSheet open={adding} onClose={() => setAdding(false)} />
      {course ? (
        <CourseFormSheet
          key={course.id}
          open={doing === "edit"}
          onClose={() => setDoing(null)}
          course={course}
        />
      ) : null}
      <SyllabusSheet course={doing === "syllabus" ? course : null} onClose={() => setDoing(null)} />
      <Confirm
        open={doing === "archive"}
        onClose={() => setDoing(null)}
        title={tc("archiveTitle")}
        text={tc("archiveText", { name: course?.name ?? "" })}
        label={t("common.archive")}
        destructive
        loading={archive.isPending}
        problem={archive.error ? errorText(t, archive.error) : null}
        onConfirm={() => {
          if (course) archive.mutate(course.id, { onSuccess: () => setDoing(null) });
        }}
        testID="course-archive"
      />
    </Screen>
  );
}

function CourseCard({ course, onPress }: { course: Course; onPress?: () => void }) {
  const t = useTranslations();
  const tc = useTranslations("settings.courses");
  const money = useMoney();
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} style={styles.card} testID={`course-${course.id}`}>
      <View style={[styles.edge, { backgroundColor: course.color ?? colors.mutedForeground }]} />
      <View style={styles.body}>
        <View style={styles.name}>
          <Text variant="heading" numberOfLines={2} style={styles.fill}>
            {course.name}
          </Text>
          {course.isArchived ? <Badge label={t("common.archived")} /> : null}
        </View>
        {course.description ? (
          <Text variant="small" tone="mutedForeground" numberOfLines={2}>
            {course.description}
          </Text>
        ) : null}
        <Text variant="figure">
          {money(course.price)}, {tc("months", { count: course.durationMonths })}
        </Text>
        <Text variant="small" tone="mutedForeground" numberOfLines={1}>
          {[course.branchName, course.gradingSystemName ?? tc("noGradingSystem")].join(", ")}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flexDirection: "row", padding: 0, gap: 0, overflow: "hidden", flex: 1 },
  edge: { width: 5 },
  body: { flex: 1, padding: space[4], gap: space[1] },
  name: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  fill: { flex: 1 },
});
