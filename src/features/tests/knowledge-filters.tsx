"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KnowledgeFilters } from "@/lib/validation/tests";

const ALL = "__all";

/** Fan / Test / Sana filters shared by the group and student analysis tabs (EXP §5, §6). */
export function KnowledgeFilterBar({
  value,
  onChange,
  subjects,
  tests,
}: {
  value: KnowledgeFilters;
  onChange: (next: KnowledgeFilters) => void;
  subjects: string[];
  tests: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("tests.knowledge");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.subject ?? ALL}
        onValueChange={(v) => onChange({ ...value, subject: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-40" aria-label={t("subject")} data-testid="knowledge-subject">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("anySubject")}</SelectItem>
          {subjects.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.testId ?? ALL}
        onValueChange={(v) => onChange({ ...value, testId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-48" aria-label={t("test")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("anyTest")}</SelectItem>
          {tests.map((x) => (
            <SelectItem key={x.id} value={x.id}>
              {x.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        aria-label={t("from")}
        value={value.from ?? ""}
        onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
        className="w-40"
      />
      <Input
        type="date"
        aria-label={t("to")}
        value={value.to ?? ""}
        onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
        className="w-40"
      />
    </div>
  );
}

export function knowledgeQuery(filters: KnowledgeFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Accuracy as a small horizontal bar. */
export function AccuracyBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const tone = value < 50 ? "bg-destructive" : value < 80 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="tabular-nums">{value}%</span>
    </div>
  );
}
