"use client";

import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import type { TestStatus } from "@/lib/validation/tests";
import { useDateFormat } from "@/lib/use-date-format";
import type { TestDetailDto, TestOptions } from "@/server/services/tests/tests.service";

import { AttemptDialog } from "./attempt-dialog";
import { TestDialog } from "./test-dialog";
import { TestStatusBadge } from "./tests-settings-page";

/** "/settings/tests/:id": questions, status actions, submitted attempts, "Natija kiritish". */
export function TestDetail({
  test,
  options,
  can,
}: {
  test: TestDetailDto;
  options: TestOptions;
  can: { update: boolean };
}) {
  const t = useTranslations("tests");
  const td = useTranslations("tests.detail");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [edit, setEdit] = useState(false);
  const [record, setRecord] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  async function setStatus(status: TestStatus) {
    setBusy(true);
    try {
      await api(`/tests/${test.id}/status`, { method: "POST", body: { status } });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const kpis: Array<[string, string]> = [
    [t("columns.questions"), String(test.questionCount)],
    [t("columns.points"), String(test.totalPoints)],
    [t("columns.attempts"), String(test.attemptCount)],
    [t("kpis.accuracy"), test.accuracy === null ? "—" : `${test.accuracy}%`],
  ];

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/settings/tests">
          <ArrowLeft /> {t("title")}
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight" data-testid="test-title">
              {test.name}
            </h2>
            <TestStatusBadge status={test.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {test.subject}
            {test.timeLimitMinutes ? ` · ${td("minutes", { count: test.timeLimitMinutes })}` : ""}
            {` · ${t("form.passPercent")}: ${test.passPercent}%`}
            {test.deadline
              ? ` · ${t("columns.deadline")}: ${fmt(parseDateOnly(test.deadline), { dateStyle: "medium" })}`
              : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("form.groups")}:{" "}
            {test.groups.length ? test.groups.map((g) => g.name).join(", ") : t("noGroups")}
          </p>
        </div>
        {can.update && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEdit(true)}
              data-testid="test-edit"
            >
              <Pencil /> {tc("edit")}
            </Button>
            {test.status === "DRAFT" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => setStatus("ACTIVE")}
                data-testid="test-activate"
              >
                {t("actions.activate")}
              </Button>
            )}
            {test.status === "ACTIVE" && (
              <>
                <Button size="sm" onClick={() => setRecord(true)} data-testid="test-record">
                  <Plus /> {td("record")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setStatus("CLOSED")}
                >
                  {t("actions.close")}
                </Button>
              </>
            )}
            {test.status === "CLOSED" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setStatus("ACTIVE")}
              >
                {t("actions.reopen")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{td("questions")}</CardTitle>
          </CardHeader>
          <CardContent>
            {test.questions.length === 0 ? (
              <EmptyState title={td("noQuestions")} />
            ) : (
              <ol className="space-y-3">
                {test.questions.map((q, i) => (
                  <li key={q.questionId} className="text-sm" data-testid="detail-question">
                    <div className="font-medium">
                      {i + 1}. {q.text}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {q.topic} · {td("pointsShort", { count: q.points })}
                      </span>
                    </div>
                    <ul className="mt-1 ml-5 space-y-0.5">
                      {q.options.map((opt, j) => (
                        <li
                          key={j}
                          className={
                            j === q.correctIndex ? "text-success" : "text-muted-foreground"
                          }
                        >
                          {j === q.correctIndex ? "✓ " : "· "}
                          {opt}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{td("attempts")}</CardTitle>
          </CardHeader>
          <CardContent>
            {test.attempts.length === 0 ? (
              <EmptyState title={td("noAttempts")} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{td("student")}</TableHead>
                    <TableHead>{td("group")}</TableHead>
                    <TableHead className="text-right">{td("score")}</TableHead>
                    <TableHead>{td("result")}</TableHead>
                    <TableHead>{td("date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {test.attempts.map((a) => (
                    <TableRow key={a.id} data-testid="attempt-row">
                      <TableCell className="font-medium">{a.studentName}</TableCell>
                      <TableCell>{a.groupName ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.score} / {a.maxScore} · {a.percent}%
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.passed ? "success" : "destructive"}>
                          {a.passed ? td("passed") : td("failed")}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {fmt(new Date(a.submittedAt), { dateStyle: "medium" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <TestDialog
        open={edit}
        onOpenChange={setEdit}
        test={test}
        options={options}
        onSaved={refresh}
      />
      <AttemptDialog open={record} onOpenChange={setRecord} test={test} onSaved={refresh} />
    </div>
  );
}
