"use client";

import { Clock, Coins } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ApiErrorBody } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type {
  PortalAttemptResultDto,
  PortalTestDto,
  PortalTestRunDto,
} from "@/server/services/tests/portal-tests.service";

/*
 * The Tests tab of the student's page (A-145): the group's tests, a timed
 * runner and the result straight after handing in. The countdown is the
 * server's: the page only counts down from the seconds it was given.
 */

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function errorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return payload?.error?.message ?? "errors.internal";
}

export function PortalTestsTab({ token, initial }: { token: string; initial: PortalTestDto[] }) {
  const t = useTranslations("portal.tests");
  const te = useTranslations();
  const fmt = useDateFormat();
  const [items, setItems] = useState(initial);
  const [run, setRun] = useState<PortalTestRunDto | null>(null);
  const [result, setResult] = useState<(PortalAttemptResultDto & { auto: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const base = `/api/v1/public/class/${encodeURIComponent(token)}/tests`;

  async function reload() {
    const response = await fetch(base, { headers: { Accept: "application/json" } });
    if (response.ok) setItems((await response.json()) as PortalTestDto[]);
  }

  async function open(id: string) {
    setOpening(id);
    setError(null);
    try {
      const response = await fetch(`${base}/${id}`, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        setError(await errorMessage(response));
        await reload();
        return;
      }
      setResult(null);
      setRun((await response.json()) as PortalTestRunDto);
    } catch {
      setError("errors.internal");
    } finally {
      setOpening(null);
    }
  }

  if (run) {
    return (
      <TestRunner
        token={token}
        run={run}
        onDone={async (r) => {
          setRun(null);
          setResult(r);
          await reload();
        }}
      />
    );
  }

  const date = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });
  const dateTime = (iso: string) => fmt(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-4" data-testid="portal-tests">
      {result && (
        <section
          className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"
          data-testid="portal-test-result"
          data-passed={result.passed}
        >
          <h3 className="text-sm font-medium">{t("resultTitle")}</h3>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {t("resultScore", { score: result.score, maxScore: result.maxScore })}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {result.percent}%
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={result.passed ? "success" : "destructive"}>
              {result.passed ? t("passed") : t("failed")}
            </Badge>
            {result.coins > 0 && (
              <span className="inline-flex items-center gap-1" data-testid="portal-test-coins">
                <Coins className="size-4 text-amber-500" />{" "}
                {t("coinsEarned", { count: result.coins })}
              </span>
            )}
          </div>
          {result.auto && (
            <p className="mt-2 text-sm text-muted-foreground">{t("autoSubmitted")}</p>
          )}
        </section>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error.startsWith("errors.") ? te(error) : error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((test) => {
            const expired = !test.attempt && test.secondsLeft !== null && test.secondsLeft <= 0;
            return (
              <li
                key={test.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                data-testid="portal-test"
                data-state={test.attempt ? "taken" : test.available ? "open" : "closed"}
              >
                <div className="min-w-0">
                  <p className="font-medium">{test.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {test.subject} · {t("questions", { count: test.questionCount })} ·{" "}
                    {t("points", { count: test.totalPoints })} ·{" "}
                    {test.timeLimitMinutes
                      ? t("timeLimit", { minutes: test.timeLimitMinutes })
                      : t("noTimeLimit")}
                    {test.deadline ? ` · ${t("deadline", { date: date(test.deadline) })}` : ""}
                    {` · ${t("passMark", { percent: test.passPercent })}`}
                  </p>
                  {test.attempt && (
                    <p className="mt-1 text-sm tabular-nums" data-testid="portal-test-score">
                      {t("scoreLine", {
                        score: test.attempt.score,
                        maxScore: test.attempt.maxScore,
                        percent: test.attempt.percent,
                      })}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t("takenOn", { date: dateTime(test.attempt.submittedAt) })}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {test.attempt ? (
                    <Badge variant={test.attempt.passed ? "success" : "destructive"}>
                      {test.attempt.passed ? t("passed") : t("failed")}
                    </Badge>
                  ) : expired ? (
                    <Badge variant="muted">{t("timeUp")}</Badge>
                  ) : test.available ? (
                    <Button
                      size="sm"
                      onClick={() => open(test.id)}
                      disabled={opening === test.id}
                      data-testid="portal-test-start"
                    >
                      {test.startedAt ? t("continue") : t("start")}
                    </Button>
                  ) : (
                    <Badge variant="muted">{t("closed")}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TestRunner({
  token,
  run,
  onDone,
}: {
  token: string;
  run: PortalTestRunDto;
  onDone: (result: PortalAttemptResultDto & { auto: boolean }) => Promise<void>;
}) {
  const t = useTranslations("portal.tests");
  const te = useTranslations();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [left, setLeft] = useState(run.secondsLeft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The timer's hand-in reads the latest answers without re-arming on every click.
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const submittedRef = useRef(false);

  async function submit(auto: boolean) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/public/class/${encodeURIComponent(token)}/tests/${run.id}`,
        {
          method: "POST",
          headers: { Accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ answers: answersRef.current }),
        },
      );
      if (!response.ok) {
        submittedRef.current = false;
        setError(await errorMessage(response));
        return;
      }
      const result = (await response.json()) as PortalAttemptResultDto;
      await onDone({ ...result, auto });
    } catch {
      submittedRef.current = false;
      setError("errors.internal");
    } finally {
      setBusy(false);
    }
  }

  // The countdown: one tick a second from the server's figure; zero hands in.
  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      void submit(true);
      return;
    }
    const timer = setTimeout(() => setLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const answered = run.questions.filter((q) => answers[q.id] !== undefined).length;
  const missing = run.questions.length - answered;

  function handIn() {
    if (!window.confirm(t("confirmHandIn", { missing }))) return;
    void submit(false);
  }

  return (
    <div className="space-y-4" data-testid="portal-test-run">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">{run.name}</h3>
          <p className="text-xs text-muted-foreground">
            {run.subject} · {t("answered", { answered, total: run.questions.length })}
          </p>
        </div>
        {left === null ? (
          <p className="text-xs text-muted-foreground">{t("untimed")}</p>
        ) : (
          <p
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm tabular-nums ${left <= 60 ? "border-destructive text-destructive" : ""}`}
            data-testid="portal-test-clock"
            aria-live="polite"
          >
            <Clock className="size-4" /> {t("timeLeft")}: {formatClock(left)}
          </p>
        )}
      </header>
      <ol className="space-y-4">
        {run.questions.map((q, index) => (
          <li key={q.id} className="rounded-lg border p-3" data-testid="portal-test-question">
            <p className="text-xs text-muted-foreground">
              {t("questionOf", { n: index + 1, total: run.questions.length })} ·{" "}
              {t("points", { count: q.points })}
            </p>
            <p className="mt-1 font-medium">{q.text}</p>
            <RadioGroup
              className="mt-3"
              value={answers[q.id] === undefined ? "" : String(answers[q.id])}
              onValueChange={(value) => setAnswers((a) => ({ ...a, [q.id]: Number(value) }))}
            >
              {q.options.map((option, i) => (
                <div key={i} className="flex items-center gap-2">
                  <RadioGroupItem value={String(i)} id={`${q.id}-${i}`} />
                  <Label htmlFor={`${q.id}-${i}`} className="font-normal">
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </li>
        ))}
      </ol>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error.startsWith("errors.") ? te(error) : error}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={handIn} disabled={busy} data-testid="portal-test-submit">
          {busy ? t("handingIn") : t("handIn")}
        </Button>
      </div>
    </div>
  );
}
