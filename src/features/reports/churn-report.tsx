"use client";

import { Settings2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { ExcelLink } from "@/features/shared/excel-link";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import { CHURN_BREAKDOWNS, type ChurnFilters } from "@/lib/validation/reports";
import type { ChurnReportDto, LeaveReasonDto } from "@/server/services/reports/churn.service";

import { Bars, HBars } from "./charts";
import { KpiCards } from "./kpi-cards";
import { FilterField, OptionSelect, useReportParams } from "./report-filters";

/** Reports → "Ketish va guruh o'zgarishi tahlili" (EXP §10). */
export function ChurnReport({
  report,
  filters,
  branches,
  options,
  canManageReasons,
}: {
  report: ChurnReportDto;
  filters: ChurnFilters;
  branches: Array<{ id: string; name: string }>;
  options: {
    courses: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; name: string }>;
    groups: Array<{ id: string; name: string }>;
  };
  canManageReasons: boolean;
}) {
  const t = useTranslations("reports.churn");
  const tf = useTranslations("reports.filters");
  const tg = useTranslations("groups.statuses");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const { params, set } = useReportParams();
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  const k = report.kpis;
  const kpis = [
    {
      key: "churnRate",
      label: t("kpis.churnRate"),
      value: `${k.churnRate}%`,
      hint: t("kpis.ofActive", { count: k.activeAtStart }),
    },
    { key: "leftCount", label: t("kpis.leftCount"), value: String(k.leftCount) },
    {
      key: "lostRevenue",
      label: t("kpis.lostRevenue"),
      value: money(k.lostRevenue),
      hint: t("kpis.perMonth"),
    },
    {
      key: "avgLifetime",
      label: t("kpis.avgLifetime"),
      value: k.avgLifetimeMonths === null ? "—" : t("kpis.months", { count: k.avgLifetimeMonths }),
    },
  ];
  const breakdown = (key: (typeof CHURN_BREAKDOWNS)[number]) =>
    key === "joinedThisMonth"
      ? [{ name: t("breakdown.joinedThisMonth"), count: report.breakdown.joinedThisMonth }]
      : key === "status"
        ? report.breakdown.status.map((s) => ({
            name: tg.has(s.name) ? tg(s.name) : s.name || "—",
            count: s.count,
          }))
        : report.breakdown[key].map((s) => ({ name: s.name || t("noReason"), count: s.count }));
  const reasonOptions = [
    ...new Set([
      ...report.reasons.filter((r) => r.kind === "LEAVE").map((r) => r.name),
      ...report.breakdown.reason.map((r) => r.name).filter(Boolean),
    ]),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          {canManageReasons && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReasonsOpen(true)}
              data-testid="manage-reasons"
            >
              <Settings2 /> {t("manageReasons")}
            </Button>
          )}
          <ExcelLink path="/reports/churn/export.xlsx" params={params} testId="report-excel" />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3" data-testid="report-filters">
        <FilterField label={tf("from")} className="min-w-36 space-y-1">
          <Input
            type="date"
            value={report.from}
            onChange={(e) => set({ from: e.target.value })}
            data-testid="churn-from"
          />
        </FilterField>
        <FilterField label={tf("to")} className="min-w-36 space-y-1">
          <Input
            type="date"
            value={report.to}
            onChange={(e) => set({ to: e.target.value })}
            data-testid="churn-to"
          />
        </FilterField>
        {branches.length > 1 && (
          <OptionSelect
            label={tf("branch")}
            value={filters.branchId}
            onChange={(v) => set({ branchId: v })}
            options={branches}
            allLabel={tf("allBranches")}
            testId="report-branch"
          />
        )}
        <OptionSelect
          label={tf("course")}
          value={filters.courseId}
          onChange={(v) => set({ courseId: v })}
          options={options.courses}
        />
        <OptionSelect
          label={tf("teacher")}
          value={filters.teacherId}
          onChange={(v) => set({ teacherId: v })}
          options={options.teachers}
        />
      </div>

      <KpiCards items={kpis} columns={4} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dynamicsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars
              items={report.dynamics.map((d) => ({ label: d.date.slice(8), value: d.count }))}
              emptyLabel={t("noData")}
              color="#ef4444"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reasonsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HBars items={breakdown("reason")} emptyLabel={t("noData")} colored />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("breakdownTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="course">
            <TabsList className="flex-wrap">
              {CHURN_BREAKDOWNS.map((b) => (
                <TabsTrigger key={b} value={b} data-testid={`churn-tab-${b}`}>
                  {t(`breakdown.${b}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {CHURN_BREAKDOWNS.map((b) => (
              <TabsContent key={b} value={b} className="pt-3">
                <HBars items={breakdown(b)} emptyLabel={t("noData")} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("transfersTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">{t("transfers.total")}</div>
                <div className="text-xl font-semibold tabular-nums" data-testid="transfers-total">
                  {report.transfers.total}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("transfers.leftAfter")}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {report.transfers.leftAfterPercent}%
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t("transfers.why")}</div>
              <HBars
                items={report.transfers.reasons.map((r) => ({
                  name: r.name || t("noReason"),
                  count: r.count,
                }))}
                emptyLabel={t("noData")}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("discountsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HBars
              items={[
                { name: t("discounts.withDiscount"), count: report.discounts.withDiscount },
                { name: t("discounts.fullPrice"), count: report.discounts.fullPrice },
              ]}
              emptyLabel={t("noData")}
              colored
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <OptionSelect
              label={tf("group")}
              value={filters.groupId}
              onChange={(v) => set({ groupId: v })}
              options={options.groups}
            />
            <OptionSelect
              label={t("columns.reason")}
              value={filters.reason}
              onChange={(v) => set({ reason: v })}
              options={reasonOptions.map((r) => ({ id: r, name: r }))}
              testId="churn-reason"
            />
            <OptionSelect
              label={t("columns.discount")}
              value={filters.discount}
              onChange={(v) => set({ discount: v })}
              options={[
                { id: "yes", name: t("discounts.has") },
                { id: "no", name: t("discounts.none") },
              ]}
            />
          </div>
          {report.rows.length === 0 ? (
            <EmptyState title={t("emptyList")} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("columns.fullName")}</TableHead>
                    <TableHead>{t("columns.group")}</TableHead>
                    <TableHead>{t("columns.course")}</TableHead>
                    <TableHead>{t("columns.discount")}</TableHead>
                    <TableHead>{t("columns.teacher")}</TableHead>
                    <TableHead>{t("columns.reason")}</TableHead>
                    <TableHead>{t("columns.leftAt")}</TableHead>
                    <TableHead>{t("columns.leftBy")}</TableHead>
                    <TableHead>{t("columns.note")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r, i) => (
                    <TableRow key={r.membershipId} data-testid="left-student-row">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/students/${r.studentId}`} className="hover:underline">
                          {r.fullName}
                        </Link>
                      </TableCell>
                      <TableCell>{r.groupName}</TableCell>
                      <TableCell>{r.courseName}</TableCell>
                      <TableCell>
                        <Badge variant={r.hasDiscount ? "success" : "outline"}>
                          {r.hasDiscount ? t("discounts.has") : t("discounts.none")}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.teacherName ?? "—"}</TableCell>
                      <TableCell>{r.reason ?? "—"}</TableCell>
                      <TableCell>{date(r.leftAt)}</TableCell>
                      <TableCell>{r.leftByName ?? "—"}</TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {r.note ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <LeaveReasonsDialog
        open={reasonsOpen}
        onOpenChange={setReasonsOpen}
        initial={report.reasons}
      />
    </div>
  );
}

/** "SABABLARNI SOZLASH": the leave and group-change reasons offered in the dialogs. */
export function LeaveReasonsDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LeaveReasonDto[];
}) {
  const t = useTranslations("reports.churn.reasons");
  const tc = useTranslations("common");
  const [reasons, setReasons] = useState(initial);
  const [loadedFor, setLoadedFor] = useState(initial);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"LEAVE" | "TRANSFER">("LEAVE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (initial !== loadedFor) {
    setLoadedFor(initial);
    setReasons(initial);
  }

  async function refresh() {
    setReasons(await api<LeaveReasonDto[]>("/leave-reasons"));
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/leave-reasons", { method: "POST", body: { name: name.trim(), kind } });
      setName("");
      await refresh();
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

  async function toggle(r: LeaveReasonDto) {
    await api(`/leave-reasons/${r.id}`, { method: "PATCH", body: { isActive: !r.isActive } });
    await refresh();
  }

  async function remove(r: LeaveReasonDto) {
    await api(`/leave-reasons/${r.id}`, { method: "DELETE" });
    await refresh();
  }

  const tAll = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="reasons-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error && <Alert variant="destructive">{tAll.has(error) ? tAll(error) : error}</Alert>}
          <ul className="max-h-64 space-y-1 overflow-auto">
            {reasons.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-sm"
                data-testid="reason-row"
              >
                <span className={r.isActive ? "" : "text-muted-foreground line-through"}>
                  {r.name}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{t(`kinds.${r.kind}`)}</Badge>
                  <Switch
                    checked={r.isActive}
                    onCheckedChange={() => void toggle(r)}
                    aria-label={tc("active")}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void remove(r)}
                    aria-label={tc("delete")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </li>
            ))}
            {reasons.length === 0 && (
              <li className="text-sm text-muted-foreground">{t("empty")}</li>
            )}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("newReason")}
                aria-label={t("newReason")}
                data-testid="reason-name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void add();
                  }
                }}
              />
            </div>
            <Select value={kind} onValueChange={(v) => setKind(v as "LEAVE" | "TRANSFER")}>
              <SelectTrigger className="w-40" aria-label={t("kind")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LEAVE">{t("kinds.LEAVE")}</SelectItem>
                <SelectItem value="TRANSFER">{t("kinds.TRANSFER")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => void add()}
              disabled={busy || !name.trim()}
              data-testid="add-reason"
            >
              {t("add")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
