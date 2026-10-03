"use client";

import { ArrowLeft, Flag, Pencil, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { ExamDto, ExamOptions, ExamResultRowDto } from "@/server/services/exams/exams.service";

import { ExamDialog } from "./exam-dialog";
import { ExamStatusBadge } from "./exams-page";

type Draft = { score: string; isPresent: boolean; comment: string };
type Candidate = { id: string; fullName: string; phone: string | null; groupName: string };

function toDrafts(list: ExamResultRowDto[]): Record<string, Draft> {
  return Object.fromEntries(
    list.map((r) => [
      r.studentId,
      {
        score: r.score === null ? "" : String(r.score),
        isPresent: r.isPresent,
        comment: r.comment ?? "",
      },
    ]),
  );
}

/** "/exams/:id": the grading sheet (and, for mocks, the registrations). */
export function ExamResults({
  exam,
  rows: initialRows,
  options,
  branches,
  can,
}: {
  exam: ExamDto;
  rows: ExamResultRowDto[];
  options: ExamOptions;
  branches: BranchOption[];
  can: { update: boolean };
}) {
  const t = useTranslations();
  const tr = useTranslations("exams.results");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => toDrafts(initialRows));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const refresh = () => startTransition(() => router.refresh());

  function apply(list: ExamResultRowDto[]) {
    setRows(list);
    setDrafts(toDrafts(list));
    setDirty(false);
  }

  function edit(studentId: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [studentId]: { ...d[studentId]!, ...patch } }));
    setDirty(true);
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api<ExamResultRowDto[]>(`/exams/${exam.id}/results`, {
        method: "PUT",
        body: {
          results: rows.map((r) => {
            const d = drafts[r.studentId]!;
            return {
              studentId: r.studentId,
              score: d.score === "" ? null : Number(d.score),
              isPresent: d.isPresent,
              comment: d.comment || null,
            };
          }),
        },
      });
      apply(saved);
      setNotice(tr("saved"));
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("errors.internal"));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (exam.type !== "MOCK" || query.trim().length < 2) return;
    const handle = setTimeout(() => {
      api<Candidate[]>(`/exams/${exam.id}/candidates?q=${encodeURIComponent(query)}`)
        .then(setCandidates)
        .catch(() => setCandidates([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [exam.id, exam.type, query]);

  async function register(studentId: string) {
    setError(null);
    try {
      const saved = await api<ExamResultRowDto[]>(`/exams/${exam.id}/registrations`, {
        method: "POST",
        body: { studentId },
      });
      apply(saved);
      setQuery("");
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("errors.internal"));
    }
  }

  async function unregister(studentId: string) {
    await api(`/exams/${exam.id}/registrations?studentId=${studentId}`, { method: "DELETE" });
    apply(rows.filter((r) => r.studentId !== studentId));
    refresh();
  }

  async function setStatus(finished: boolean) {
    await api(`/exams/${exam.id}/${finished ? "finish" : "reopen"}`, { method: "POST" });
    refresh();
  }

  const date = (value: string) => fmt(parseDateOnly(value), { dateStyle: "medium" });
  const full = exam.capacity !== null && rows.length >= exam.capacity;
  const info: Array<[string, string]> = [
    [t("exams.columns.date"), `${date(exam.date)} · ${exam.startTime} – ${exam.endTime}`],
    [
      exam.type === "GROUP" ? t("exams.columns.group") : t("exams.columns.groups"),
      exam.type === "GROUP" ? (exam.groupName ?? "—") : exam.groups.map((g) => g.name).join(", "),
    ],
    [t("exams.columns.examiner"), exam.examinerName ?? "—"],
    [t("exams.columns.room"), exam.roomName ?? "—"],
    [t("exams.form.gradingSystem"), exam.gradingSystemName ?? t("exams.form.custom")],
    [t("exams.columns.passScore"), `${exam.passScore} / ${exam.maxScore}`],
    ...(exam.type === "MOCK"
      ? ([
          [t("exams.columns.price"), money(exam.price)],
          [
            t("exams.columns.capacity"),
            exam.capacity === null
              ? "—"
              : tr("registrations", { count: rows.length, capacity: exam.capacity }),
          ],
        ] as Array<[string, string]>)
      : []),
  ];

  return (
    <div className="space-y-4">
      <Link href="/exams" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> {tr("back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {exam.name}
            <Badge variant="outline">{t(`exams.types.${exam.type}`)}</Badge>
            <ExamStatusBadge status={exam.status} />
          </h1>
          <p className="text-sm text-muted-foreground">{exam.branchName}</p>
        </div>
        {can.update && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> {t("common.edit")}
            </Button>
            {exam.status === "NOT_STARTED" ? (
              <Button
                variant="secondary"
                onClick={() => void setStatus(true)}
                data-testid="exam-finish"
              >
                <Flag /> {t("exams.actions.finish")}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void setStatus(false)}>
                <RotateCcw /> {t("exams.actions.reopen")}
              </Button>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-x-6 gap-y-2 pt-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {info.map(([label, value]) => (
            <div key={label}>
              <div className="text-muted-foreground">{label}</div>
              <div className="font-medium">{value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {exam.type === "MOCK" && can.update && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="exam-register">
              <UserPlus className="size-4" /> {tr("register")}
            </label>
            <Input
              id="exam-register"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim().length < 2) setCandidates([]);
              }}
              placeholder={tr("search")}
              disabled={full}
              data-testid="register-search"
            />
            {full && <p className="text-sm text-muted-foreground">{tr("full")}</p>}
            {query.trim().length >= 2 && !full && (
              <ul className="divide-y rounded-md border" data-testid="candidates">
                {candidates.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted-foreground">{tr("noCandidates")}</li>
                ) : (
                  candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => void register(c.id)}
                      >
                        <span>
                          {c.fullName}
                          <span className="ml-2 text-muted-foreground">{c.groupName}</span>
                        </span>
                        <span className="text-muted-foreground">{c.phone}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState title={tr("empty")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>{tr("student")}</TableHead>
                  <TableHead>{tr("group")}</TableHead>
                  <TableHead>{tr("present")}</TableHead>
                  <TableHead>{tr("score")}</TableHead>
                  <TableHead>{tr("level")}</TableHead>
                  <TableHead>{tr("result")}</TableHead>
                  <TableHead>{tr("comment")}</TableHead>
                  {exam.type === "MOCK" && can.update && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const d = drafts[r.studentId]!;
                  const score = d.score === "" ? null : Number(d.score);
                  const passed = score === null ? null : score >= exam.passScore;
                  return (
                    <TableRow key={r.studentId} data-testid="result-row">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {r.fullName}
                        {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                      </TableCell>
                      <TableCell>{r.groupName ?? "—"}</TableCell>
                      <TableCell>
                        <Checkbox
                          checked={d.isPresent}
                          disabled={!can.update}
                          aria-label={tr("present")}
                          onCheckedChange={(v) => edit(r.studentId, { isPresent: !!v })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={exam.maxScore}
                          step="any"
                          className="w-24"
                          value={d.score}
                          disabled={!can.update || !d.isPresent}
                          aria-label={tr("scoreFor", { name: r.fullName })}
                          onChange={(e) => edit(r.studentId, { score: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>{dirty ? "…" : (r.level ?? "—")}</TableCell>
                      <TableCell>
                        {passed === null ? (
                          <span className="text-muted-foreground">{tr("notGraded")}</span>
                        ) : (
                          <Badge variant={passed ? "success" : "destructive"}>
                            {passed ? tr("passed") : tr("failed")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={d.comment}
                          disabled={!can.update}
                          aria-label={tr("comment")}
                          onChange={(e) => edit(r.studentId, { comment: e.target.value })}
                        />
                      </TableCell>
                      {exam.type === "MOCK" && can.update && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={tr("remove")}
                            onClick={() => void unregister(r.studentId)}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      {can.update && rows.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() => void save()}
            disabled={!dirty || saving}
            data-testid="save-results"
          >
            {saving ? t("common.saving") : tr("save")}
          </Button>
        </div>
      )}

      <ExamDialog
        open={editing}
        onOpenChange={setEditing}
        exam={exam}
        options={options}
        branches={branches}
        onSaved={refresh}
      />
    </div>
  );
}
