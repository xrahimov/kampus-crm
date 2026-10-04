"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { KnowledgeFilters } from "@/lib/validation/tests";
import type { GroupKnowledgeDto } from "@/server/services/tests/tests.service";

import { AccuracyBar, KnowledgeFilterBar, knowledgeQuery } from "./knowledge-filters";

/** Group → BILIM TAHLILI (EXP §5): accuracy per topic over the group's submitted tests. */
export function GroupKnowledgeTab({
  groupId,
  initial,
}: {
  groupId: string;
  initial: GroupKnowledgeDto;
}) {
  const t = useTranslations("tests.knowledge");
  const [filters, setFilters] = useState<KnowledgeFilters>({});
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function apply(next: KnowledgeFilters) {
    setFilters(next);
    setLoading(true);
    try {
      setData(await api<GroupKnowledgeDto>(`/groups/${groupId}/knowledge${knowledgeQuery(next)}`));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <KnowledgeFilterBar
        value={filters}
        onChange={apply}
        subjects={initial.subjects}
        tests={initial.tests}
      />
      <p className="text-sm text-muted-foreground" data-testid="knowledge-summary">
        {t("summary", { attempts: data.attempts, students: data.students })}
      </p>
      {data.topics.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("topic")}</TableHead>
              <TableHead>{t("subject")}</TableHead>
              <TableHead className="text-right">{t("questions")}</TableHead>
              <TableHead className="text-right">{t("answered")}</TableHead>
              <TableHead className="text-right">{t("correct")}</TableHead>
              <TableHead>{t("accuracy")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.topics.map((x) => (
              <TableRow key={`${x.subject}/${x.topic}`} data-testid="topic-row">
                <TableCell className="font-medium">{x.topic}</TableCell>
                <TableCell>{x.subject}</TableCell>
                <TableCell className="text-right tabular-nums">{x.questions}</TableCell>
                <TableCell className="text-right tabular-nums">{x.answered}</TableCell>
                <TableCell className="text-right tabular-nums">{x.correct}</TableCell>
                <TableCell>
                  <AccuracyBar value={x.accuracy} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
