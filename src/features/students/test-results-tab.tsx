"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AccuracyBar,
  KnowledgeFilterBar,
  knowledgeQuery,
} from "@/features/tests/knowledge-filters";
import { api } from "@/lib/api-client";
import type { KnowledgeFilters } from "@/lib/validation/tests";
import { useDateFormat } from "@/lib/use-date-format";
import type { StudentTestResultsDto } from "@/server/services/tests/tests.service";

/** Student → TEST NATIJALARI (EXP §6): KPIs, weak and strong topics, dynamics, submitted tests. */
export function TestResultsTab({
  studentId,
  initial,
}: {
  studentId: string;
  initial: StudentTestResultsDto;
}) {
  const t = useTranslations("tests.results");
  const td = useTranslations("tests.detail");
  const fmt = useDateFormat();
  const [filters, setFilters] = useState<KnowledgeFilters>({});
  const [data, setData] = useState(initial);

  async function apply(next: KnowledgeFilters) {
    setFilters(next);
    setData(
      await api<StudentTestResultsDto>(
        `/students/${studentId}/test-results${knowledgeQuery(next)}`,
      ),
    );
  }

  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const kpis: Array<[string, string]> = [
    [t("total"), String(data.kpis.total)],
    [t("average"), pct(data.kpis.average)],
    [t("best"), pct(data.kpis.best)],
    [t("worst"), pct(data.kpis.worst)],
    [
      t("averageTime"),
      data.kpis.averageSeconds === null
        ? "—"
        : t("minutes", { count: Math.round(data.kpis.averageSeconds / 60) }),
    ],
  ];
  const max = Math.max(1, ...data.dynamics.map((d) => d.percent));

  return (
    <div className="space-y-4">
      <KnowledgeFilterBar
        value={filters}
        onChange={apply}
        subjects={initial.subjects}
        tests={initial.tests}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold tabular-nums" data-testid="results-kpi">
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.level && (
        <p className="text-sm">
          {t("level")}:{" "}
          <Badge
            variant={
              data.level === "HIGH" ? "success" : data.level === "LOW" ? "destructive" : "secondary"
            }
          >
            {t(`levels.${data.level}`)}
          </Badge>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <TopicList
          title={t("problemTopics")}
          empty={t("noProblemTopics")}
          topics={data.problemTopics}
        />
        <TopicList
          title={t("strongTopics")}
          empty={t("noStrongTopics")}
          topics={data.strongTopics}
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("dynamics")}</h3>
        {data.dynamics.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <div className="flex h-32 items-end gap-1 rounded-md border p-2" data-testid="dynamics">
            {data.dynamics.map((d, i) => (
              <div
                key={`${d.date}-${i}`}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${Math.max(4, (d.percent / max) * 100)}%` }}
                title={`${d.testName}: ${d.percent}% · ${fmt(new Date(d.date), { dateStyle: "medium" })}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("attempts")}</h3>
        {data.attempts.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("test")}</TableHead>
                <TableHead>{t("subject")}</TableHead>
                <TableHead>{td("group")}</TableHead>
                <TableHead className="text-right">{td("score")}</TableHead>
                <TableHead>{td("result")}</TableHead>
                <TableHead>{td("date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.attempts.map((a) => (
                <TableRow key={a.id} data-testid="result-attempt-row">
                  <TableCell className="font-medium">{a.testName}</TableCell>
                  <TableCell>{a.subject}</TableCell>
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
      </section>
    </div>
  );
}

function TopicList({
  title,
  empty,
  topics,
}: {
  title: string;
  empty: string;
  topics: StudentTestResultsDto["problemTopics"];
}) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <h3 className="text-sm font-semibold">{title}</h3>
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {topics.map((x) => (
              <li
                key={`${x.subject}/${x.topic}`}
                className="flex items-center justify-between gap-3"
              >
                <span>
                  {x.topic} <span className="text-muted-foreground">· {x.subject}</span>
                </span>
                <AccuracyBar value={x.accuracy} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
