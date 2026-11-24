import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  TEST_STATUSES,
  useQuestionBankOptions,
  useQuestions,
  useTestOptions,
  useTests,
  type OfficeTest,
  type Question,
} from "@/api/office-tests";
import type { TestStatus } from "@/api/types";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Header } from "@/components/header";
import { Badge, Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { Filters, Kpis, OptionFilter, Tabs } from "@/features/reports/parts";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { LogBody, SearchField, useLogSearch } from "./log-parts";
import { QuestionSheet } from "./question-sheet";
import { TestFormSheet } from "./test-form";

type Tab = "tests" | "bank";

export const TEST_STATUS_TONE = {
  DRAFT: "neutral",
  ACTIVE: "success",
  CLOSED: "warning",
} as const;

/**
 * Tests (A-250): the site's Settings → Tests. Two tabs: the tests with their
 * key figures and filters, each opening its own page, and the question bank
 * the tests are built from.
 */
export function TestsSettingsScreen() {
  const t = useTranslations("tests");
  const me = useMe();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("tests");
  const [adding, setAdding] = useState(false);
  const [question, setQuestion] = useState<Question | "new" | null>(null);
  const [shown, setShown] = useState<Question | "new">("new");
  const mayCreate = can(me, "tests.create");
  const openQuestion = (next: Question | "new") => {
    setShown(next);
    setQuestion(next);
  };
  return (
    <Screen
      header={
        <Header
          back
          title={t("title")}
          right={
            mayCreate ? (
              <Button
                compact
                icon={<Plus size={16} color={colors.primaryForeground} />}
                label={tab === "tests" ? t("add") : t("questionForm.add")}
                onPress={() => (tab === "tests" ? setAdding(true) : openQuestion("new"))}
                testID="tests-add"
              />
            ) : undefined
          }
        />
      }
    >
      <Text variant="small" tone="mutedForeground">
        {t("description")}
      </Text>
      <Tabs
        options={[
          { value: "tests", label: t("tabs.tests") },
          { value: "bank", label: t("tabs.bank") },
        ]}
        value={tab}
        onChange={setTab}
        testID="tests-tabs"
      />
      {tab === "tests" ? <TestsTab /> : <BankTab onOpen={openQuestion} />}
      <TestFormSheet open={adding} onClose={() => setAdding(false)} test={null} />
      <QuestionSheet
        key={shown === "new" ? "new" : shown.id}
        open={question !== null}
        onClose={() => setQuestion(null)}
        question={shown === "new" ? null : shown}
      />
    </Screen>
  );
}

function TestsTab() {
  const t = useTranslations();
  const tt = useTranslations("tests");
  const [status, setStatus] = useState<TestStatus | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [recent, setRecent] = useState(false);
  const query = useTests({ status, subject, recent });
  const options = useTestOptions();
  if (query.isLoading) return <Loading />;
  if (!query.data) {
    return (
      <EmptyState
        title={errorText(t, query.error)}
        action={
          <Button
            variant="outline"
            label={t("mobile.retry")}
            onPress={() => void query.refetch()}
            testID="tests-retry"
          />
        }
      />
    );
  }
  const { kpis, items } = query.data;
  return (
    <>
      <Kpis
        items={[
          { key: "total", label: tt("kpis.total"), value: String(kpis.total) },
          { key: "active", label: tt("kpis.active"), value: String(kpis.active) },
          { key: "attempts", label: tt("kpis.attempts"), value: String(kpis.attempts) },
          {
            key: "accuracy",
            label: tt("kpis.accuracy"),
            value: kpis.accuracy === null ? "—" : `${kpis.accuracy}%`,
          },
        ]}
      />
      <Filters testID="tests-filters">
        <OptionFilter
          label={tt("filters.status")}
          value={status}
          onChange={setStatus}
          options={TEST_STATUSES.map((value) => ({ value, label: tt(`statuses.${value}`) }))}
          allLabel={tt("filters.anyStatus")}
          testID="tests-status"
        />
        <OptionFilter
          label={tt("filters.subject")}
          value={subject}
          onChange={setSubject}
          options={(options.data?.subjects ?? []).map((value) => ({ value, label: value }))}
          allLabel={tt("filters.anySubject")}
          testID="tests-subject"
        />
      </Filters>
      <View style={styles.start}>
        <Chip
          label={tt("filters.recent")}
          on={recent}
          onPress={() => setRecent((was) => !was)}
          testID="tests-recent"
        />
      </View>
      {query.isError ? <Notice tone="warning">{errorText(t, query.error)}</Notice> : null}
      {items.length === 0 ? (
        <View testID="tests-empty">
          <EmptyState title={t("common.nothingFound")} />
        </View>
      ) : (
        <TestCards tests={items} />
      )}
    </>
  );
}

function TestCards({ tests }: { tests: OfficeTest[] }) {
  const t = useTranslations("tests");
  const date = useDate();
  const router = useRouter();
  const { wide } = useLayout();
  return (
    <View style={styles.grid} testID="tests-list">
      {tests.map((one) => (
        <View key={one.id} style={wide ? styles.cell : styles.full}>
          <Card
            style={styles.card}
            onPress={() =>
              router.push({ pathname: "/staff/settings/tests/[id]", params: { id: one.id } })
            }
            testID={`test-${one.id}`}
          >
            <View style={styles.head}>
              <Text variant="heading" style={styles.fill} numberOfLines={2}>
                {one.name}
              </Text>
              <Badge tone={TEST_STATUS_TONE[one.status]} label={t(`statuses.${one.status}`)} />
            </View>
            <Text variant="small" tone="mutedForeground" numberOfLines={2}>
              {one.groups.length === 0
                ? t("noGroups")
                : one.groups.map((group) => group.name).join(", ")}
            </Text>
            <Text variant="small" tone="mutedForeground">
              {[
                one.subject,
                `${t("columns.questions")}: ${one.questionCount}`,
                t("points", { count: one.totalPoints }),
              ].join(" · ")}
            </Text>
            <Text variant="small" tone="mutedForeground">
              {[
                `${t("detail.attempts")}: ${one.attemptCount}`,
                one.accuracy === null ? null : `${t("columns.accuracy")}: ${one.accuracy}%`,
                one.deadline
                  ? `${t("columns.deadline")}: ${date(dayAsDate(one.deadline), { dateStyle: "medium" })}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </Card>
        </View>
      ))}
    </View>
  );
}

function BankTab({ onOpen }: { onOpen: (question: Question) => void }) {
  const t = useTranslations();
  const tt = useTranslations("tests");
  const me = useMe();
  const { wide } = useLayout();
  const search = useLogSearch();
  const [subject, setSubject] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const options = useQuestionBankOptions();
  const query = useQuestions({ q: search.q, subject, topic });
  // A question opens to be changed, or to be deleted by someone who may only do that.
  const mayOpen = can(me, "tests.update") || can(me, "tests.delete");
  const topics = (options.data?.topics ?? []).filter((one) => !subject || one.subject === subject);
  return (
    <>
      <SearchField state={search} label={tt("searchQuestions")} testID="bank-search" />
      <Filters testID="bank-filters">
        <OptionFilter
          label={tt("filters.subject")}
          value={subject}
          onChange={(next) => {
            setSubject(next);
            setTopic(null);
          }}
          options={(options.data?.subjects ?? []).map((value) => ({ value, label: value }))}
          allLabel={tt("filters.anySubject")}
          testID="bank-subject"
        />
        <OptionFilter
          label={tt("filters.topic")}
          value={topic}
          onChange={setTopic}
          // The same topic can stand under two subjects; it is one choice here.
          options={[...new Set(topics.map((one) => one.topic))].map((value) => ({
            value,
            label: value,
          }))}
          allLabel={tt("filters.anyTopic")}
          testID="bank-topic"
        />
      </Filters>
      <LogBody query={query} empty={t("common.nothingFound")} testID="bank">
        {(rows) => (
          <View style={styles.grid}>
            {rows.map((one) => (
              <View key={one.id} style={wide ? styles.cell : styles.full}>
                <Card
                  style={styles.card}
                  onPress={mayOpen ? () => onOpen(one) : undefined}
                  testID={`question-${one.id}`}
                >
                  <Text variant="bodyStrong" numberOfLines={3}>
                    {one.text}
                  </Text>
                  <Text variant="small" tone="success" numberOfLines={2}>
                    ✓ {one.options[one.correctIndex]}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {[
                      one.subject,
                      one.topic,
                      `${tt("columns.options")}: ${one.options.length}`,
                      `${tt("columns.usedIn")}: ${one.usedInTests}`,
                    ].join(" · ")}
                  </Text>
                </Card>
              </View>
            ))}
          </View>
        )}
      </LogBody>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flex: 1, gap: space[1] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
});
