"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RowActions } from "@/features/settings/shared/row-actions";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { Page } from "@/lib/validation/common";
import { parseDateOnly } from "@/lib/dates";
import { TEST_STATUSES, type TestStatus } from "@/lib/validation/tests";
import { useDateFormat } from "@/lib/use-date-format";
import type { QuestionBankOptions, QuestionDto } from "@/server/services/tests/questions.service";
import type { TestDto, TestListDto, TestOptions } from "@/server/services/tests/tests.service";

import { QuestionDialog } from "./question-dialog";
import { TestDialog } from "./test-dialog";

const ALL = "__all";
export type TestsTab = "tests" | "bank";

export function TestStatusBadge({ status }: { status: TestStatus }) {
  const t = useTranslations("tests.statuses");
  const variant = status === "ACTIVE" ? "success" : status === "CLOSED" ? "muted" : "secondary";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

/** Settings → "Test sozlamalari" (EXP §8): Testlar / Savollar banki tabs. */
export function TestsSettingsPage({
  tab,
  tests,
  filters,
  questions,
  bankOptions,
  options,
  can,
}: {
  tab: TestsTab;
  tests: TestListDto;
  filters: { status: TestStatus | "ALL"; subject: string | null; recent: boolean };
  questions: Page<QuestionDto>;
  bankOptions: QuestionBankOptions;
  options: TestOptions;
  can: { create: boolean; update: boolean; delete: boolean };
}) {
  const t = useTranslations("tests");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [testDialog, setTestDialog] = useState<{ open: boolean; test: TestDto | null }>({
    open: false,
    test: null,
  });
  const [questionDialog, setQuestionDialog] = useState<{
    open: boolean;
    question: QuestionDto | null;
  }>({
    open: false,
    question: null,
  });
  const [deletingTest, setDeletingTest] = useState<TestDto | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<QuestionDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParams(entries: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const kpis: Array<[string, string]> = [
    [t("kpis.total"), String(tests.kpis.total)],
    [t("kpis.active"), String(tests.kpis.active)],
    [t("kpis.attempts"), String(tests.kpis.attempts)],
    [t("kpis.accuracy"), tests.kpis.accuracy === null ? "—" : `${tests.kpis.accuracy}%`],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {can.create && (
          <Button
            onClick={() =>
              tab === "tests"
                ? setTestDialog({ open: true, test: null })
                : setQuestionDialog({ open: true, question: null })
            }
            data-testid="add-button"
          >
            <Plus /> {tab === "tests" ? t("add") : t("questionForm.add")}
          </Button>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setParams({ tab: v === "tests" ? null : v, q: null })}
      >
        <TabsList>
          <TabsTrigger value="tests" data-testid="tests-tab-tests">
            {t("tabs.tests")}
          </TabsTrigger>
          <TabsTrigger value="bank" data-testid="tests-tab-bank">
            {t("tabs.bank")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "tests" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">{label}</div>
                  <div className="text-2xl font-semibold tabular-nums" data-testid="tests-kpi">
                    {value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={filters.status === "ALL" ? ALL : filters.status}
              onValueChange={(v) => setParams({ status: v })}
            >
              <SelectTrigger
                className="w-44"
                aria-label={t("filters.status")}
                data-testid="filter-status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.anyStatus")}</SelectItem>
                {TEST_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.subject ?? ALL} onValueChange={(v) => setParams({ subject: v })}>
              <SelectTrigger className="w-44" aria-label={t("filters.subject")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.anySubject")}</SelectItem>
                {options.subjects.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={filters.recent ? "default" : "outline"}
              size="sm"
              onClick={() => setParams({ recent: filters.recent ? null : "1" })}
              data-testid="filter-recent"
            >
              {t("filters.recent")}
            </Button>
          </div>
          <Card>
            {tests.items.length === 0 ? (
              <EmptyState title={tc("nothingFound")} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.name")}</TableHead>
                    <TableHead>{t("columns.subject")}</TableHead>
                    <TableHead className="text-right">{t("columns.questions")}</TableHead>
                    <TableHead className="text-right">{t("columns.attempts")}</TableHead>
                    <TableHead>{t("columns.deadline")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tests.items.map((x) => (
                    <TableRow key={x.id} data-testid="test-row">
                      <TableCell>
                        <Link
                          href={`/settings/tests/${x.id}`}
                          className="font-medium hover:underline"
                        >
                          {x.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {x.groups.length === 0
                            ? t("noGroups")
                            : x.groups.map((g) => g.name).join(", ")}
                        </div>
                      </TableCell>
                      <TableCell>{x.subject}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {x.questionCount} · {t("points", { count: x.totalPoints })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {x.attemptCount}
                        {x.accuracy !== null && (
                          <span className="text-muted-foreground"> · {x.accuracy}%</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {x.deadline ? fmt(parseDateOnly(x.deadline), { dateStyle: "medium" }) : "—"}
                      </TableCell>
                      <TableCell>
                        <TestStatusBadge status={x.status} />
                      </TableCell>
                      <TableCell>
                        {(can.update || can.delete) && (
                          <RowActions
                            name={x.name}
                            onEdit={
                              can.update ? () => setTestDialog({ open: true, test: x }) : undefined
                            }
                            onDelete={can.delete ? () => setDeletingTest(x) : undefined}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SearchBox placeholder={t("searchQuestions")} />
            <Select
              value={searchParams.get("subject") ?? ALL}
              onValueChange={(v) => setParams({ subject: v, topic: null })}
            >
              <SelectTrigger className="w-44" aria-label={t("filters.subject")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.anySubject")}</SelectItem>
                {bankOptions.subjects.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={searchParams.get("topic") ?? ALL}
              onValueChange={(v) => setParams({ topic: v })}
            >
              <SelectTrigger className="w-48" aria-label={t("filters.topic")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.anyTopic")}</SelectItem>
                {bankOptions.topics
                  .filter((x) => {
                    const subject = searchParams.get("subject");
                    return !subject || x.subject === subject;
                  })
                  .map((x) => (
                    <SelectItem key={`${x.subject}/${x.topic}`} value={x.topic}>
                      {x.topic}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            {questions.items.length === 0 ? (
              <EmptyState title={tc("nothingFound")} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.text")}</TableHead>
                    <TableHead>{t("columns.subject")}</TableHead>
                    <TableHead>{t("columns.topic")}</TableHead>
                    <TableHead className="text-right">{t("columns.options")}</TableHead>
                    <TableHead className="text-right">{t("columns.usedIn")}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.items.map((q) => (
                    <TableRow key={q.id} data-testid="question-row">
                      <TableCell className="max-w-md">
                        <div className="truncate font-medium">{q.text}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          ✓ {q.options[q.correctIndex]}
                        </div>
                      </TableCell>
                      <TableCell>{q.subject}</TableCell>
                      <TableCell>{q.topic}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.options.length}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.usedInTests}</TableCell>
                      <TableCell>
                        {(can.update || can.delete) && (
                          <RowActions
                            name={q.text}
                            onEdit={
                              can.update
                                ? () => setQuestionDialog({ open: true, question: q })
                                : undefined
                            }
                            onDelete={can.delete ? () => setDeletingQuestion(q) : undefined}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
          <Pagination page={questions.page} pageSize={questions.pageSize} total={questions.total} />
        </>
      )}

      <TestDialog
        open={testDialog.open}
        onOpenChange={(open) => setTestDialog((d) => ({ ...d, open }))}
        test={testDialog.test}
        options={options}
        onSaved={refresh}
      />
      <QuestionDialog
        open={questionDialog.open}
        onOpenChange={(open) => setQuestionDialog((d) => ({ ...d, open }))}
        question={questionDialog.question}
        subjects={bankOptions.subjects}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deletingTest}
        onOpenChange={(open) => !open && setDeletingTest(null)}
        title={t("deleteTitle")}
        description={t("deleteText", { name: deletingTest?.name ?? "" })}
        onConfirm={async () => {
          if (!deletingTest) return;
          await api(`/tests/${deletingTest.id}`, { method: "DELETE" });
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deletingQuestion}
        onOpenChange={(open) => !open && setDeletingQuestion(null)}
        title={t("questionForm.deleteTitle")}
        description={t("questionForm.deleteText")}
        onConfirm={async () => {
          if (!deletingQuestion) return;
          await api(`/question-bank/${deletingQuestion.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
