"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { ExcelLink } from "@/features/shared/excel-link";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { CEFR_LEVELS, type GraduatesFilters } from "@/lib/validation/reports";
import type {
  GraduateRowDto,
  GraduatesReportDto,
} from "@/server/services/reports/graduates.service";

import { KpiCards } from "./kpi-cards";
import { ALL, OptionSelect, PeriodFilters, useReportParams } from "./report-filters";

/** Reports → "Bitiruvchilar hisoboti" (EXP §10): cards, filters, the graduates list with "Natija kiritish". */
export function GraduatesReport({
  report,
  filters,
  branches,
  canRecord,
}: {
  report: GraduatesReportDto;
  filters: GraduatesFilters;
  branches: Array<{ id: string; name: string }>;
  canRecord: boolean;
}) {
  const t = useTranslations("reports.graduates");
  const tf = useTranslations("reports.filters");
  const fmt = useDateFormat();
  const router = useRouter();
  const { params, set } = useReportParams();
  const [editing, setEditing] = useState<GraduateRowDto | null>(null);
  const [issuing, setIssuing] = useState<GraduateRowDto | null>(null);
  const [revoking, setRevoking] = useState<GraduateRowDto | null>(null);
  const k = report.kpis;
  const pctOrDash = (v: number | null) => (v === null ? "—" : `${v}%`);
  const kpis = [
    { key: "count", label: t("kpis.count"), value: String(k.count) },
    {
      key: "bestTeacher",
      label: t("kpis.bestTeacher"),
      value: k.bestTeacher?.name ?? "—",
      hint: k.bestTeacher ? t("kpis.graduates", { count: k.bestTeacher.count }) : null,
    },
    {
      key: "avgIelts",
      label: t("kpis.avgIelts"),
      value: k.avgIelts === null ? "—" : String(k.avgIelts),
    },
    { key: "commonCefr", label: t("kpis.commonCefr"), value: k.commonCefr ?? "—" },
    { key: "university", label: t("kpis.university"), value: pctOrDash(k.universityPercent) },
    { key: "employed", label: t("kpis.employed"), value: pctOrDash(k.employedPercent) },
  ];
  const named = (xs: Array<{ id: string; fullName: string }>) =>
    xs.map((x) => ({ id: x.id, name: x.fullName }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <ExcelLink path="/reports/graduates/export.xlsx" params={params} testId="report-excel" />
      </div>
      <PeriodFilters
        branches={branches}
        branchId={filters.branchId}
        year={report.year}
        month={report.month}
      >
        <OptionSelect
          label={tf("group")}
          value={filters.groupId}
          onChange={(v) => set({ groupId: v })}
          options={report.options.groups}
        />
        <OptionSelect
          label={tf("teacher")}
          value={filters.teacherId}
          onChange={(v) => set({ teacherId: v })}
          options={named(report.options.teachers)}
        />
        <OptionSelect
          label={tf("course")}
          value={filters.courseId}
          onChange={(v) => set({ courseId: v })}
          options={report.options.courses}
        />
        <OptionSelect
          label={t("columns.results")}
          value={filters.result}
          onChange={(v) => set({ result: v })}
          options={[
            { id: "yes", name: t("withResult") },
            { id: "no", name: t("noResult") },
          ]}
          testId="filter-result"
        />
      </PeriodFilters>
      <KpiCards items={kpis} columns={6} />

      {report.rows.length === 0 ? (
        <EmptyState title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t("columns.fullName")}</TableHead>
                <TableHead>{t("columns.groupBranch")}</TableHead>
                <TableHead>{t("columns.teacher")}</TableHead>
                <TableHead>{t("columns.graduatedAt")}</TableHead>
                <TableHead>{t("columns.results")}</TableHead>
                {canRecord && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((r, i) => (
                <TableRow key={r.membershipId} data-testid="graduate-row">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/students/${r.studentId}`} className="hover:underline">
                      {r.fullName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {r.groupName} <span className="text-muted-foreground">/ {r.branchName}</span>
                  </TableCell>
                  <TableCell>{r.teacherName ?? "—"}</TableCell>
                  <TableCell>
                    {fmt(parseDateOnly(r.graduatedAt), { dateStyle: "medium" })}
                  </TableCell>
                  <TableCell>
                    {r.result || r.examResult ? (
                      <span className="flex flex-wrap gap-1">
                        {r.examResult && (
                          <Badge variant="outline">{t("exam", { score: r.examResult })}</Badge>
                        )}
                        {r.result?.ieltsScore !== null && r.result?.ieltsScore !== undefined && (
                          <Badge>IELTS {r.result.ieltsScore}</Badge>
                        )}
                        {r.result?.cefrLevel && (
                          <Badge variant="secondary">{r.result.cefrLevel}</Badge>
                        )}
                        {r.result?.university && (
                          <Badge variant="success">{t("record.university")}</Badge>
                        )}
                        {r.result?.employed && (
                          <Badge variant="success">{t("record.employed")}</Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("noResult")}</span>
                    )}
                    {r.certificate && !r.certificate.revokedAt && (
                      <Link
                        href={`/certificates/${r.certificate.id}`}
                        target="_blank"
                        className="mt-1 inline-block text-xs text-primary hover:underline"
                        data-testid="certificate-open"
                      >
                        {t("certificate.number", { number: r.certificate.number })}
                      </Link>
                    )}
                  </TableCell>
                  {canRecord && (
                    <TableCell className="text-right">
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(r)}
                          data-testid="record-result"
                        >
                          {t("record.button")}
                        </Button>
                        {r.certificate && !r.certificate.revokedAt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevoking(r)}
                            data-testid="certificate-revoke"
                          >
                            {t("certificate.revoke")}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIssuing(r)}
                            data-testid="certificate-issue"
                          >
                            {t("certificate.issue")}
                          </Button>
                        )}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <GraduateRecordDialog
          row={editing}
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {issuing && (
        <CertificateDialog
          row={issuing}
          onOpenChange={(open) => !open && setIssuing(null)}
          onSaved={() => {
            setIssuing(null);
            router.refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t("certificate.revokeTitle")}
        description={t("certificate.revokeText", {
          name: revoking?.fullName ?? "",
          number: revoking?.certificate?.number ?? "",
        })}
        confirmLabel={t("certificate.revoke")}
        onConfirm={async () => {
          if (!revoking?.certificate) return;
          await api(`/certificates/${revoking.certificate.id}/revoke`, { method: "POST" });
          setRevoking(null);
          router.refresh();
        }}
      />
    </div>
  );
}

/** "Issue certificate": the title (the course by default), the level and the date (A-140). */
function CertificateDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: GraduateRowDto;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("reports.graduates.certificate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/memberships/${row.membershipId}/certificate`, {
        method: "POST",
        body: {
          title: data.get("title"),
          level: data.get("level") || null,
          issuedAt: data.get("issuedAt") || undefined,
        },
      });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message)
          : "errors.internal",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={onOpenChange}
      title={t("title", { name: row.fullName })}
      description={t("hint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      submitLabel={t("issue")}
      testId="certificate-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="cert-title">{t("titleField")}</Label>
        <Input
          id="cert-title"
          name="title"
          required
          maxLength={120}
          defaultValue={row.courseName}
          data-testid="cert-title"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cert-level">{t("level")}</Label>
          <Input
            id="cert-level"
            name="level"
            maxLength={40}
            defaultValue={row.result?.cefrLevel ?? ""}
            data-testid="cert-level"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cert-date">{t("issuedAt")}</Label>
          <Input
            id="cert-date"
            name="issuedAt"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>
      </div>
    </FormDialog>
  );
}

function GraduateRecordDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: GraduateRowDto;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("reports.graduates.record");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cefr, setCefr] = useState(row.result?.cefrLevel ?? ALL);
  const [university, setUniversity] = useState(row.result?.university ?? false);
  const [employed, setEmployed] = useState(row.result?.employed ?? false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/memberships/${row.membershipId}/graduate`, {
        method: "PUT",
        body: {
          ieltsScore: data.get("ieltsScore") || null,
          cefrLevel: cefr === ALL ? null : cefr,
          university,
          employed,
          note: data.get("note") || null,
        },
      });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message)
          : "errors.internal",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={onOpenChange}
      title={t("title", { name: row.fullName })}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="graduate-dialog"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="grad-ielts">{t("ielts")}</Label>
          <Input
            id="grad-ielts"
            name="ieltsScore"
            type="number"
            min={0}
            max={9}
            step="0.5"
            defaultValue={row.result?.ieltsScore ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("cefr")}</Label>
          <Select value={cefr} onValueChange={setCefr}>
            <SelectTrigger aria-label={t("cefr")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>—</SelectItem>
              {CEFR_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={university} onCheckedChange={(v) => setUniversity(v === true)} />{" "}
          {t("university")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={employed} onCheckedChange={(v) => setEmployed(v === true)} />{" "}
          {t("employed")}
        </label>
      </div>
      <div className="space-y-2">
        <Label htmlFor="grad-note">{t("note")}</Label>
        <Textarea id="grad-note" name="note" rows={2} defaultValue={row.result?.note ?? ""} />
      </div>
    </FormDialog>
  );
}
