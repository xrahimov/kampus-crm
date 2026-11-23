import { useLocalSearchParams } from "expo-router";
import { Clock, Coins } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { handInTest, openTest, usePortalTests } from "@/api/portal";
import type { PortalTest, PortalTestResult, PortalTestRun } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { clock } from "@/features/room/file-source";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

import { Options } from "./answer-parts";

type Result = PortalTestResult & { auto: boolean };

/**
 * A group's tests on the student's side, in the app (A-213): the list, a timed
 * run and the result straight after handing in. The clock is the server's:
 * the app counts down to the moment the server's seconds run out, so a phone
 * that slept for a while still shows the right time.
 */
export function TestsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const portal = usePortal(token);
  const query = usePortalTests(token);
  const [run, setRun] = useState<PortalTestRun | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { refetch } = query;

  const open = (id: string) => {
    setOpening(id);
    setProblem(null);
    openTest(token, id)
      .then((next) => {
        setResult(null);
        setRun(next);
      })
      .catch((error: unknown) => {
        setProblem(errorText(t, error));
        void refetch();
      })
      .finally(() => setOpening(null));
  };

  if (run) {
    return (
      <TestRun
        token={token}
        run={run}
        onLeave={() => {
          setRun(null);
          void refetch();
        }}
        onDone={(outcome) => {
          setRun(null);
          setResult(outcome);
          void refetch();
        }}
      />
    );
  }

  const header = (
    <Header back title={t("portal.tabs.tests")} subtitle={portal.data?.portal.group.name} />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      </Screen>
    );
  }
  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.list}
    >
      {result ? <ResultCard result={result} /> : null}
      {problem ? (
        <Notice tone="destructive" testID="tests-problem">
          {problem}
        </Notice>
      ) : null}
      {query.data.length === 0 ? <EmptyState title={t("portal.tests.empty")} /> : null}
      {query.data.map((test) => (
        <TestCard key={test.id} test={test} opening={opening === test.id} onOpen={open} />
      ))}
    </Screen>
  );
}

function ResultCard({ result }: { result: Result }) {
  const t = useTranslations("portal.tests");
  const { colors } = useTheme();
  return (
    <Card testID="test-result">
      <Text variant="small" tone="mutedForeground">
        {t("resultTitle")}
      </Text>
      <View style={styles.resultLine}>
        <Text variant="title" testID="test-result-score">
          {t("resultScore", { score: result.score, maxScore: result.maxScore })}
        </Text>
        <Text tone="mutedForeground">{result.percent}%</Text>
      </View>
      <View style={styles.wrapRow}>
        <Badge
          tone={result.passed ? "success" : "destructive"}
          label={result.passed ? t("passed") : t("failed")}
        />
        {result.coins > 0 ? (
          <View style={styles.coins} testID="test-result-coins">
            <Coins size={16} color={colors.warning} />
            <Text variant="small">{t("coinsEarned", { count: result.coins })}</Text>
          </View>
        ) : null}
      </View>
      {result.auto ? (
        <Text variant="small" tone="mutedForeground" testID="test-result-auto">
          {t("autoSubmitted")}
        </Text>
      ) : null}
    </Card>
  );
}

function TestCard({
  test,
  opening,
  onOpen,
}: {
  test: PortalTest;
  opening: boolean;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("portal.tests");
  const formatDate = useDate();
  const expired = !test.attempt && test.secondsLeft !== null && test.secondsLeft <= 0;
  const details = [
    test.subject,
    t("questions", { count: test.questionCount }),
    t("points", { count: test.totalPoints }),
    test.timeLimitMinutes ? t("timeLimit", { minutes: test.timeLimitMinutes }) : t("noTimeLimit"),
    test.deadline
      ? t("deadline", {
          date: formatDate(dayAsDate(test.deadline), { day: "numeric", month: "short" }),
        })
      : null,
    t("passMark", { percent: test.passPercent }),
  ].filter(Boolean);
  const canStart = !test.attempt && !expired && test.available;
  return (
    <Card testID={`test-${test.id}`}>
      <View style={styles.cardHead}>
        <Text variant="bodyStrong" style={styles.fill}>
          {test.name}
        </Text>
        {test.attempt ? (
          <Badge
            tone={test.attempt.passed ? "success" : "destructive"}
            label={test.attempt.passed ? t("passed") : t("failed")}
          />
        ) : expired ? (
          <Badge label={t("timeUp")} />
        ) : !test.available ? (
          <Badge label={t("closed")} />
        ) : null}
      </View>
      <Text variant="small" tone="mutedForeground">
        {details.join(", ")}
      </Text>
      {test.attempt ? (
        <View testID="test-score">
          <Text variant="figure">
            {t("scoreLine", {
              score: test.attempt.score,
              maxScore: test.attempt.maxScore,
              percent: test.attempt.percent,
            })}
          </Text>
          <Text variant="small" tone="mutedForeground">
            {t("takenOn", {
              date: formatDate(new Date(test.attempt.submittedAt), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </Text>
        </View>
      ) : null}
      {canStart ? (
        <>
          {test.timeLimitMinutes && !test.startedAt ? (
            <Text variant="small" tone="mutedForeground" testID="test-start-hint">
              {t("startHint", { minutes: test.timeLimitMinutes })}
            </Text>
          ) : null}
          <Button
            label={test.startedAt ? t("continue") : t("start")}
            loading={opening}
            onPress={() => onOpen(test.id)}
            testID="test-start"
          />
        </>
      ) : null}
    </Card>
  );
}

function TestRun({
  token,
  run,
  onDone,
  onLeave,
}: {
  token: string;
  run: PortalTestRun;
  onDone: (result: Result) => void;
  onLeave: () => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The moment the server's seconds run out, on this phone's clock.
  const [deadline] = useState(() =>
    run.secondsLeft === null ? null : Date.now() + run.secondsLeft * 1000,
  );
  const [now, setNow] = useState(() => Date.now());
  const left = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  // The clock's hand-in reads the latest answers without re-arming on every tap.
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const sent = useRef(false);

  const handIn = useCallback(
    (auto: boolean) => {
      if (sent.current) return;
      sent.current = true;
      setBusy(true);
      setProblem(null);
      handInTest(token, run.id, answersRef.current)
        .then((result) => onDone({ ...result, auto }))
        .catch((error: unknown) => {
          sent.current = false;
          setProblem(errorText(t, error));
          setBusy(false);
        });
    },
    [token, run.id, onDone, t],
  );

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  // Zero hands the answers in as they are.
  const out = left !== null && left <= 0;
  useEffect(() => {
    if (out) handIn(true);
  }, [out, handIn]);

  const answered = run.questions.filter((q) => answers[q.id] !== undefined).length;
  const missing = run.questions.length - answered;
  const urgent = left !== null && left <= 60;

  return (
    <Screen
      header={
        <Header
          title={run.name}
          subtitle={[
            run.subject,
            t("portal.tests.answered", { answered, total: run.questions.length }),
          ].join(", ")}
          right={
            left === null ? null : (
              <View
                style={[styles.clock, { borderColor: urgent ? colors.destructive : colors.border }]}
                accessibilityLabel={`${t("portal.tests.timeLeft")}: ${clock(left)}`}
                testID="test-clock"
              >
                <Clock size={16} color={urgent ? colors.destructive : colors.foreground} />
                <Text variant="figure" tone={urgent ? "destructive" : "foreground"}>
                  {clock(left)}
                </Text>
              </View>
            )
          }
        />
      }
      footer={
        confirming ? (
          <View style={styles.confirm} testID="test-confirm">
            <Text variant="small">{t("portal.tests.confirmHandIn", { missing })}</Text>
            <View style={styles.wrapRow}>
              <Button
                label={busy ? t("portal.tests.handingIn") : t("portal.tests.handIn")}
                loading={busy}
                onPress={() => handIn(false)}
                testID="test-confirm-hand-in"
              />
              <Button
                variant="ghost"
                label={t("common.cancel")}
                disabled={busy}
                onPress={() => setConfirming(false)}
                testID="test-confirm-cancel"
              />
            </View>
          </View>
        ) : (
          <View style={styles.wrapRow}>
            <Button
              label={busy ? t("portal.tests.handingIn") : t("portal.tests.handIn")}
              loading={busy}
              onPress={() => setConfirming(true)}
              testID="test-hand-in"
            />
            <Button
              variant="ghost"
              label={t("portal.tests.back")}
              disabled={busy}
              onPress={onLeave}
              testID="test-leave"
            />
          </View>
        )
      }
      contentStyle={styles.list}
    >
      {left === null ? (
        <Text variant="small" tone="mutedForeground">
          {t("portal.tests.untimed")}
        </Text>
      ) : null}
      {run.questions.map((question, index) => (
        <Card key={question.id} testID={`test-question-${index}`}>
          <Text variant="small" tone="mutedForeground">
            {t("portal.tests.questionOf", { n: index + 1, total: run.questions.length })},{" "}
            {t("portal.tests.points", { count: question.points })}
          </Text>
          <Text variant="bodyStrong">{question.text}</Text>
          <Options
            options={question.options}
            chosen={answers[question.id] === undefined ? [] : [answers[question.id]!]}
            onPress={(option) => setAnswers((a) => ({ ...a, [question.id]: option }))}
            testID={`test-option-${index}`}
          />
        </Card>
      ))}
      {problem ? (
        <Notice tone="destructive" testID="test-problem">
          {problem}
        </Notice>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[4] },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  resultLine: { flexDirection: "row", alignItems: "baseline", gap: space[2] },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[3] },
  coins: { flexDirection: "row", alignItems: "center", gap: space[1] },
  confirm: { gap: space[2] },
  clock: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
});
