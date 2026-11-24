import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  addCommentOnStudent,
  studentKeys,
  useStudent,
  useStudentComments,
  useStudentProgress,
  useStudentTests,
} from "@/api/staff-students";
import type {
  StudentComment,
  StudentDetail,
  StudentProgress,
  StudentTests,
  TopicStat,
} from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import {
  Avatar,
  Badge,
  Card,
  Divider,
  EmptyState,
  Loading,
  Notice,
  Screen,
} from "@/components/surface";
import { Text } from "@/components/text";
import { useBlacklist, useRemoveField } from "@/api/office-student-page";
import { useArchiveStudent } from "@/api/office-students";
import { Confirm } from "@/components/confirm";
import { Sheet } from "@/components/sheet";
import { useOpenSite } from "@/features/office/site-paths";
import { FamilyCard } from "@/features/office/student-family";
import { StudentGroups } from "@/features/office/student-groups";
import { AccessCard, FieldSheet, ParentsCard, PhoneLine } from "@/features/office/student-people";
import { StudentCalls, StudentHistory, StudentSms } from "@/features/office/student-record";
import { PaymentSheet } from "@/features/office/payment-sheet";
import { StudentFormSheet } from "@/features/office/student-form";
import { StudentToGroupSheet } from "@/features/groups/student-to-group";
import { StudentPayments } from "@/features/office/student-payments";
import { PendingScreen } from "@/features/shared/pending-screen";
import { WordChip } from "@/features/student/answer-parts";
import { dayAsDate, weekdayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

const SECTIONS = ["groups", "progress", "testResults", "comments"] as const;
/** The office also has what was sent, said and done (A-240), in the site's order. */
const OFFICE_SECTIONS = ["sms", "calls", "history"] as const;
/** And the student's payments (A-231). */
type Section = (typeof SECTIONS)[number] | (typeof OFFICE_SECTIONS)[number] | "payments";

/**
 * One student on the teacher's side, in the app (A-220): who they are and how
 * to reach them and their parents, the groups they are in, how they are
 * doing, their tests, and the notes written about them.
 */
export function StudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { wide } = useLayout();
  const query = useStudent(id);
  const me = useMe();
  const office = me.view.current === "FULL";
  const [section, setSection] = useState<Section>("groups");

  const header = <Header back title={query.data?.fullName ?? t("students.title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const student = query.data;

  // The family and who signs in (A-240) sit under the person on a tablet, as on the site; on a
  // phone they come after the sections, so the groups stay one short scroll away.
  const officeCards = office ? (
    <>
      <FamilyCard student={student} />
      <AccessCard student={student} />
    </>
  ) : null;

  const sections = (
    <View style={styles.block}>
      {/* The chips wrap onto a second line: in one row that scrolled sideways the last one,
          Payments, was off the screen with nothing to say it was there. */}
      <View style={styles.chips}>
        {SECTIONS.map((key) => (
          <WordChip
            key={key}
            label={t(`students.detail.tabs.${key}`)}
            chosen={section === key}
            onPress={() => setSection(key)}
            testID={`student-tab-${key}`}
          />
        ))}
        {office
          ? OFFICE_SECTIONS.map((key) => (
              <WordChip
                key={key}
                label={t(`students.detail.tabs.${key}`)}
                chosen={section === key}
                onPress={() => setSection(key)}
                testID={`student-tab-${key}`}
              />
            ))
          : null}
        {office ? (
          <WordChip
            label={t("payments.log.title")}
            chosen={section === "payments"}
            onPress={() => setSection("payments")}
            testID="student-tab-payments"
          />
        ) : null}
      </View>
      {section === "groups" ? (
        office ? (
          <StudentGroups student={student} />
        ) : (
          <Groups student={student} />
        )
      ) : null}
      {section === "progress" ? <Progress id={id} /> : null}
      {section === "testResults" ? <Tests id={id} /> : null}
      {section === "comments" ? <Comments id={id} /> : null}
      {section === "sms" ? <StudentSms student={student} /> : null}
      {section === "calls" ? <StudentCalls student={student} /> : null}
      {section === "history" ? <StudentHistory id={id} /> : null}
      {section === "payments" ? <StudentPayments student={student} /> : null}
    </View>
  );

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={wide ? styles.split : styles.column}
    >
      {wide ? (
        <>
          <View style={[styles.widePerson, styles.block]}>
            <Person student={student} />
            {officeCards}
          </View>
          <View style={styles.wideSections}>{sections}</View>
        </>
      ) : (
        <>
          <Person student={student} />
          {sections}
          {officeCards}
        </>
      )}
    </Screen>
  );
}

function Person({ student }: { student: StudentDetail }) {
  const t = useTranslations();
  const me = useMe();
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const archive = useArchiveStudent(student.id);
  const mayEdit = can(me, "students.update");
  const mayArchive = can(me, "students.delete") && !student.isArchived;
  // Into a group from the student's own page (A-233): how a restored student gets back in.
  const mayAddToGroup = can(me, "groups.update") && !student.isArchived;
  const [joining, setJoining] = useState(false);
  // The rest of the card for the office (A-240): extra information, the badge, the blacklist.
  const office = me.view.current === "FULL";
  const mayChangeFields = office && mayEdit;
  const mayBlacklist = office && can(me, "students.blacklist");
  const [addingField, setAddingField] = useState(false);
  const [blacklisting, setBlacklisting] = useState(false);
  const removeField = useRemoveField(student.id);
  const blacklist = useBlacklist(student.id);
  const site = useOpenSite();
  const { colors } = useTheme();
  const tm = useTranslations("mobile.studentsPage");
  const formatDate = useDate();
  const money = useMoney();
  const fields = student.customFields.filter((f) => mayChangeFields || f.value);
  const facts = [
    student.birthDate
      ? `${t("students.detail.birthDate")}: ${formatDate(dayAsDate(student.birthDate), {
          dateStyle: "medium",
        })}`
      : null,
    student.schoolName,
    // People who may change the extra information get it as lines they can remove.
    ...(mayChangeFields ? [] : fields.map((f) => `${f.name}: ${f.value}`)),
  ].filter(Boolean);
  return (
    <View style={styles.block}>
      <Card testID="student-person">
        <View style={styles.head}>
          <Avatar name={student.fullName} size={48} />
          <View style={styles.fill}>
            <Text variant="heading">{student.fullName}</Text>
            <View style={styles.badges}>
              {student.isArchived ? <Badge label={t("common.archived")} /> : null}
              {student.isBlacklisted ? (
                <Badge tone="destructive" label={t("students.blacklisted")} />
              ) : null}
              {student.balance < 0 ? (
                <Badge
                  tone="destructive"
                  label={t("mobile.owes", { amount: money(-student.balance) })}
                  testID="student-owes"
                />
              ) : null}
            </View>
          </View>
          {student.gradeAverage !== null ? (
            <View style={styles.average}>
              <Text variant="figure" testID="student-grade">
                {student.gradeAverage}
              </Text>
              <Text variant="small" tone="mutedForeground">
                {t("groups.grades.average")}
              </Text>
            </View>
          ) : null}
        </View>
        {student.phone ? (
          <PhoneLine
            name={t("students.detail.phone")}
            phone={student.phone}
            testID="student-call"
          />
        ) : (
          <Text variant="small" tone="mutedForeground" testID="student-no-phone">
            {tm("noPhone")}
          </Text>
        )}
        {facts.length > 0 ? (
          <Text variant="small" tone="mutedForeground">
            {facts.join(", ")}
          </Text>
        ) : null}
        {mayChangeFields
          ? fields.map((field) => (
              <View key={field.id} style={styles.line} testID={`student-field-${field.id}`}>
                <Text variant="small" tone="mutedForeground" style={styles.fill}>
                  {field.value ? `${field.name}: ${field.value}` : field.name}
                </Text>
                <Pressable
                  onPress={() => removeField.mutate(field.id)}
                  disabled={removeField.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("common.remove")}: ${field.name}`}
                  hitSlop={8}
                  testID={`student-field-remove-${field.id}`}
                >
                  <X size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))
          : null}
        {student.note ? <Text>{student.note}</Text> : null}
        {can(me, "payments.create") && !student.isArchived ? (
          <Button
            variant="saffron"
            label={t("students.detail.pay")}
            onPress={() => setPaying(true)}
            testID="student-pay"
          />
        ) : null}
      </Card>
      {mayEdit || mayArchive || mayAddToGroup || office ? (
        <View style={styles.officeActions}>
          {mayAddToGroup ? (
            <Button
              compact
              variant="outline"
              label={t("mobile.office.toGroup")}
              onPress={() => setJoining(true)}
              testID="student-to-group"
            />
          ) : null}
          {mayEdit ? (
            <Button
              compact
              variant="outline"
              label={t("students.actions.edit")}
              onPress={() => setEditing(true)}
              testID="student-edit"
            />
          ) : null}
          {mayEdit && student.isArchived ? (
            <Button
              compact
              variant="outline"
              label={t("students.actions.restore")}
              loading={archive.isPending}
              onPress={() => archive.mutate(false)}
              testID="student-restore"
            />
          ) : null}
          {mayChangeFields && !student.isArchived ? (
            <Button
              compact
              variant="outline"
              label={t("students.detail.addField")}
              onPress={() => setAddingField(true)}
              testID="student-add-field"
            />
          ) : null}
          {office ? (
            <Button
              compact
              variant="outline"
              label={t("students.detail.badge")}
              onPress={() => site.open(`/students/${student.id}/badge`)}
              testID="student-badge"
            />
          ) : null}
          {mayBlacklist ? (
            <Button
              compact
              variant="outline"
              label={
                student.isBlacklisted
                  ? t("students.detail.unblacklist")
                  : t("students.detail.blacklist")
              }
              onPress={() => {
                blacklist.reset();
                setBlacklisting(true);
              }}
              testID="student-blacklist"
            />
          ) : null}
          {mayArchive ? (
            <Button
              compact
              variant="destructive"
              label={t("students.actions.archive")}
              onPress={() => setArchiving(true)}
              testID="student-archive"
            />
          ) : null}
        </View>
      ) : null}
      {archive.error ? (
        <Notice tone="destructive" testID="student-archive-problem">
          {errorText(t, archive.error)}
        </Notice>
      ) : null}
      {removeField.error || site.error ? (
        <Notice tone="destructive" testID="student-card-problem">
          {removeField.error ? errorText(t, removeField.error) : site.error}
        </Notice>
      ) : null}
      <FieldSheet open={addingField} onClose={() => setAddingField(false)} studentId={student.id} />
      <Confirm
        open={blacklisting}
        onClose={() => setBlacklisting(false)}
        title={
          student.isBlacklisted ? t("students.detail.unblacklist") : t("students.blacklistTitle")
        }
        text={
          student.isBlacklisted
            ? undefined
            : t("students.blacklistText", { name: student.fullName })
        }
        label={
          student.isBlacklisted ? t("students.detail.unblacklist") : t("students.detail.blacklist")
        }
        destructive={!student.isBlacklisted}
        loading={blacklist.isPending}
        problem={blacklist.error ? errorText(t, blacklist.error) : null}
        onConfirm={() =>
          blacklist.mutate(!student.isBlacklisted, { onSuccess: () => setBlacklisting(false) })
        }
        testID="blacklist"
      />
      <PaymentSheet open={paying} onClose={() => setPaying(false)} student={student} />
      <StudentFormSheet open={editing} onClose={() => setEditing(false)} student={student} />
      <StudentToGroupSheet open={joining} onClose={() => setJoining(false)} student={student} />
      <Sheet
        open={archiving}
        onClose={() => setArchiving(false)}
        title={t("students.archiveTitle")}
        testID="archive-sheet"
        footer={
          <View style={styles.officeActions}>
            <Button
              variant="outline"
              label={t("common.cancel")}
              onPress={() => setArchiving(false)}
              style={styles.fill}
              testID="archive-cancel"
            />
            <Button
              variant="destructive"
              label={t("students.actions.archive")}
              loading={archive.isPending}
              onPress={() => archive.mutate(true, { onSettled: () => setArchiving(false) })}
              style={styles.fill}
              testID="archive-confirm"
            />
          </View>
        }
      >
        <Text>{t("students.archiveText", { name: student.fullName })}</Text>
      </Sheet>
      <ParentsCard student={student} office={office} />
    </View>
  );
}

function Groups({ student }: { student: StudentDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const formatDate = useDate();
  const { colors } = useTheme();
  if (student.groups.length === 0) {
    return <EmptyState title={t("students.detail.noGroups")} />;
  }
  return (
    <Card style={styles.flush}>
      {student.groups.map((group, index) => {
        const days = [...group.weekdays]
          .sort((a, b) => a - b)
          .map((d) => formatDate(weekdayAsDate(d), { weekday: "short" }))
          .join(", ");
        return (
          <View key={group.membershipId}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              onPress={() =>
                router.push({ pathname: "/staff/group/[id]", params: { id: group.groupId } })
              }
              accessibilityRole="button"
              accessibilityLabel={group.groupName}
              style={({ pressed }) => [
                styles.row,
                pressed ? { backgroundColor: colors.muted } : null,
              ]}
              testID={`student-group-${group.groupId}`}
            >
              <View style={styles.fill}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {group.groupName}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {[
                    group.courseName,
                    [days, group.time].filter(Boolean).join(" "),
                    group.teacherName,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
              {group.status !== "ACTIVE" ? (
                <Badge label={t(`groups.memberStatuses.${group.status}`)} />
              ) : null}
              <ChevronRight size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

function Figure({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.figure}>
      <Text variant="figure" testID={testID}>
        {value}
      </Text>
      <Text variant="small" tone="mutedForeground">
        {label}
      </Text>
    </View>
  );
}

function Progress({ id }: { id: string }) {
  const t = useTranslations();
  const tp = useTranslations("students.progress");
  const formatDate = useDate();
  const query = useStudentProgress(id, true);
  if (query.isLoading) return <Loading />;
  if (!query.data) return <Notice tone="destructive">{errorText(t, query.error)}</Notice>;
  const data: StudentProgress = query.data;
  const percent = (value: number | null) => (value === null ? "–" : `${value}%`);
  const number = (value: number | null) => (value === null ? "–" : String(value));
  return (
    <View style={styles.block} testID="student-progress">
      <Card>
        <View style={styles.figures}>
          <Figure
            label={tp("gradeAverage")}
            value={number(data.gradeAverage)}
            testID="progress-grade"
          />
          <Figure
            label={tp("attendance")}
            value={percent(data.attendancePercent)}
            testID="progress-attendance"
          />
          <Figure label={tp("examAverage")} value={number(data.examAverage)} />
        </View>
      </Card>
      {data.byGroup.length > 0 ? (
        <Card style={styles.flush}>
          {data.byGroup.map((group, index) => (
            <View key={group.groupId}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row} testID={`progress-group-${group.groupId}`}>
                <View style={styles.fill}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {group.groupName}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {[
                      group.courseName,
                      `${tp("lessons")}: ${group.lessons}`,
                      `${tp("attendance")}: ${percent(group.attendancePercent)}`,
                    ].join(", ")}
                  </Text>
                </View>
                <Text variant="figure">{number(group.gradeAverage)}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      <Text variant="heading">{tp("byMonth")}</Text>
      {data.months.length === 0 ? (
        <Text tone="mutedForeground">{tp("noData")}</Text>
      ) : (
        <Card style={styles.flush}>
          {data.months.map((month, index) => (
            <View key={month.month}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row} testID={`progress-month-${month.month}`}>
                <View style={styles.fill}>
                  <Text variant="bodyStrong">
                    {formatDate(dayAsDate(`${month.month}-15`), {
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {`${tp("lessons")}: ${month.lessons}, ${tp("attendance")}: ${percent(
                      month.attendancePercent,
                    )}`}
                  </Text>
                </View>
                <Text variant="figure">{number(month.gradeAverage)}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}
      <Text variant="heading">{tp("exams")}</Text>
      {data.exams.length === 0 ? (
        <Text tone="mutedForeground">{tp("noExams")}</Text>
      ) : (
        <Card style={styles.flush}>
          {data.exams.map((exam, index) => (
            <View key={exam.examId}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row} testID={`progress-exam-${exam.examId}`}>
                <View style={styles.fill}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {exam.name}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {[
                      formatDate(dayAsDate(exam.date), { dateStyle: "medium" }),
                      exam.groupName,
                      exam.level,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                </View>
                {exam.score === null ? null : (
                  <Text variant="figure">
                    {exam.score}/{exam.maxScore}
                  </Text>
                )}
                {!exam.isPresent ? (
                  <Badge tone="warning" label={t("exams.results.absent")} />
                ) : exam.passed === null ? (
                  <Badge label={t("exams.results.notGraded")} />
                ) : (
                  <Badge
                    tone={exam.passed ? "success" : "destructive"}
                    label={exam.passed ? t("exams.results.passed") : t("exams.results.failed")}
                  />
                )}
              </View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function Topics({ title, none, topics }: { title: string; none: string; topics: TopicStat[] }) {
  return (
    <Card>
      <Text variant="heading">{title}</Text>
      {topics.length === 0 ? (
        <Text tone="mutedForeground">{none}</Text>
      ) : (
        topics.map((topic) => (
          <View key={`${topic.subject}/${topic.topic}`} style={styles.line}>
            <View style={styles.fill}>
              <Text variant="bodyStrong">{topic.topic}</Text>
              <Text variant="small" tone="mutedForeground">
                {topic.subject}
              </Text>
            </View>
            <Text variant="figure">{topic.accuracy === null ? "–" : `${topic.accuracy}%`}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

function Tests({ id }: { id: string }) {
  const t = useTranslations();
  const tr = useTranslations("tests.results");
  const formatDate = useDate();
  const query = useStudentTests(id, true);
  if (query.isLoading) return <Loading />;
  if (!query.data) return <Notice tone="destructive">{errorText(t, query.error)}</Notice>;
  const data: StudentTests = query.data;
  if (data.kpis.total === 0) return <EmptyState title={tr("empty")} />;
  const percent = (value: number | null) => (value === null ? "–" : `${value}%`);
  return (
    <View style={styles.block} testID="student-tests">
      <Card>
        <View style={styles.figures}>
          <Figure label={tr("total")} value={String(data.kpis.total)} testID="tests-total" />
          <Figure label={tr("average")} value={percent(data.kpis.average)} testID="tests-average" />
          <Figure label={tr("best")} value={percent(data.kpis.best)} />
          <Figure label={tr("worst")} value={percent(data.kpis.worst)} />
        </View>
        {data.level ? (
          <Text variant="small" tone="mutedForeground" testID="tests-level">
            {tr("level")}: {tr(`levels.${data.level}`)}
          </Text>
        ) : null}
      </Card>
      <Topics
        title={tr("problemTopics")}
        none={tr("noProblemTopics")}
        topics={data.problemTopics}
      />
      <Topics title={tr("strongTopics")} none={tr("noStrongTopics")} topics={data.strongTopics} />
      <Text variant="heading">{tr("attempts")}</Text>
      <Card style={styles.flush}>
        {data.attempts.map((attempt, index) => (
          <View key={attempt.id}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.row} testID={`tests-attempt-${attempt.id}`}>
              <View style={styles.fill}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {attempt.testName}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {[
                    attempt.subject,
                    formatDate(new Date(attempt.submittedAt), { dateStyle: "medium" }),
                    attempt.durationSeconds
                      ? tr("minutes", {
                          count: Math.max(1, Math.round(attempt.durationSeconds / 60)),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
              <View style={styles.average}>
                <Text variant="figure">{attempt.percent}%</Text>
                <Text variant="small" tone="mutedForeground">
                  {attempt.score}/{attempt.maxScore}
                </Text>
              </View>
              <Badge
                tone={attempt.passed ? "success" : "destructive"}
                label={attempt.passed ? t("tests.detail.passed") : t("tests.detail.failed")}
              />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

function Comments({ id }: { id: string }) {
  const t = useTranslations();
  const tc = useTranslations("students.comments");
  const formatDate = useDate();
  const client = useQueryClient();
  const query = useStudentComments(id, true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (query.isLoading) return <Loading />;
  if (!query.data) return <Notice tone="destructive">{errorText(t, query.error)}</Notice>;

  const add = () => {
    const note = text.trim();
    if (!note || busy) return;
    setBusy(true);
    setProblem(null);
    addCommentOnStudent(id, note)
      .then((saved) => {
        client.setQueryData<StudentComment[]>(studentKeys.comments(id), (old) => [
          saved,
          ...(old ?? []),
        ]);
        setText("");
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  return (
    <View style={styles.block} testID="student-comments">
      <Card>
        <Field
          label={tc("new")}
          placeholder={tc("placeholder")}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          style={styles.text}
          testID="student-comment-text"
        />
        {problem ? (
          <Notice tone="destructive" testID="student-comment-problem">
            {problem}
          </Notice>
        ) : null}
        <Button
          label={t("common.add")}
          loading={busy}
          disabled={text.trim().length === 0}
          onPress={add}
          style={styles.start}
          testID="student-comment-add"
        />
      </Card>
      {query.data.length === 0 ? <Text tone="mutedForeground">{tc("empty")}</Text> : null}
      {query.data.map((comment) => (
        <Card key={comment.id} testID={`student-comment-${comment.id}`}>
          <Text>{comment.text}</Text>
          <Text variant="small" tone="mutedForeground">
            {[
              comment.groupName,
              comment.authorName,
              formatDate(new Date(comment.createdAt), { dateStyle: "medium", timeStyle: "short" }),
            ]
              .filter(Boolean)
              .join(", ")}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  officeActions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  fill: { flex: 1 },
  column: { gap: space[4] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  widePerson: { flex: 2 },
  wideSections: { flex: 3 },
  block: { gap: space[3] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  flush: { padding: 0, gap: 0 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[1] },
  average: { alignItems: "flex-end" },
  line: { flexDirection: "row", alignItems: "center", gap: space[3] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space[4] },
  figure: { minWidth: 96, flexGrow: 1 },
  text: { minHeight: 72, textAlignVertical: "top" },
  start: { alignSelf: "flex-start" },
});
