"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { PayrollRunDto } from "@/server/services/finance/payroll.service";

/** EXP §9 "/finance/salary-detail/:month": per-staff lines, approve, draft/save, recalculate. */
export function PayrollPage({
  run,
  can,
}: {
  run: PayrollRunDto;
  can: { update: boolean; approve: boolean };
}) {
  const t = useTranslations("finance.payroll");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function call(path: string, method: "POST" | "PUT", body?: unknown, done?: string) {
    setError(null);
    try {
      await api(path, { method, body });
      if (done) setNotice(done);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tc("retry"));
    }
  }

  const monthLabel = fmt(parseDateOnly(`${run.month}-01`), { month: "short", year: "numeric" });
  const lines = run.lines.filter((l) =>
    l.fullName.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const cols: Array<keyof PayrollRunDto["totals"]> = [
    "fixed",
    "percent",
    "perLesson",
    "perStudent",
    "bonus",
    "penalty",
    "advance",
  ];

  return (
    <div className="space-y-4">
      <nav className="text-sm text-muted-foreground">
        <Link href="/finance" className="inline-flex items-center gap-1">
          <ArrowLeft className="size-4" /> {t("title")}
        </Link>
        <span className="mx-2">›</span>
        <span>{monthLabel}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("monthTitle", { month: monthLabel })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("summary", { staff: run.staffCount, approved: run.approvedCount })} ·{" "}
            {t(`statuses.${run.status}`)}
          </p>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="w-56"
          aria-label={t("search")}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("rulesNote")}</p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <Card>
        {lines.length === 0 ? (
          <EmptyState title={tc("nothingFound")} />
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-xs [&_td]:whitespace-nowrap [&_td]:px-2 [&_th]:px-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>{t("columns.staffMember")}</TableHead>
                  <TableHead>{t("columns.role")}</TableHead>
                  <TableHead className="text-right" title={t("hints.penaltyCount")}>
                    {t("columns.penaltyCount")}
                  </TableHead>
                  {cols.map((c) => (
                    <TableHead key={c} className="text-right" title={t(`hints.${c}`)}>
                      {t(`columns.${c}`)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">{t("columns.net")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <Fragment key={l.id}>
                    <TableRow data-testid="payroll-line">
                      <TableCell>
                        <button
                          type="button"
                          className="text-muted-foreground"
                          aria-label={t("details")}
                          aria-expanded={!!open[l.id]}
                          onClick={() => setOpen((o) => ({ ...o, [l.id]: !o[l.id] }))}
                        >
                          {open[l.id] ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                        <span className="sr-only">{i + 1}</span>
                      </TableCell>
                      <TableCell className="font-medium">{l.fullName}</TableCell>
                      <TableCell>{l.roleName || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.penaltyCount}</TableCell>
                      {cols.map((c) => (
                        <TableCell key={c} className="text-right tabular-nums">
                          {money(l[c])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {l.net < 0 && (
                            <AlertTriangle
                              className="size-4 text-destructive"
                              aria-label={t("negative")}
                            />
                          )}
                          {money(l.net)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {l.status === "APPROVED" ? (
                          <Badge variant="success" title={l.approvedByName ?? undefined}>
                            {t("lineStatuses.APPROVED")}
                          </Badge>
                        ) : can.approve ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            data-testid="approve-line"
                            onClick={() =>
                              void call(
                                `/payroll/${run.month}/lines/${l.id}/approve`,
                                "POST",
                                undefined,
                              )
                            }
                          >
                            <Check /> {t("approve")}
                          </Button>
                        ) : (
                          <Badge variant="secondary">{t("lineStatuses.MODERATION")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    {open[l.id] && (
                      <TableRow className="bg-muted/40">
                        <TableCell colSpan={cols.length + 6}>
                          {l.details.length === 0 ? (
                            <span className="text-sm text-muted-foreground">{t("noGroups")}</span>
                          ) : (
                            <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                              {l.details.map((d) => (
                                <li key={d.groupId}>
                                  <span className="font-medium">{d.groupName}</span>{" "}
                                  <span className="text-muted-foreground">
                                    {t(`shareTypes.${d.shareType}`, {
                                      value: d.shareValue,
                                      students: d.students,
                                      lessons: d.lessons,
                                      price: money(d.coursePrice),
                                    })}
                                  </span>{" "}
                                  = {money(d.amount)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                <TableRow className="font-medium">
                  <TableCell />
                  <TableCell colSpan={2}>{t("total")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {run.totals.penaltyCount}
                  </TableCell>
                  {cols.map((c) => (
                    <TableCell key={c} className="text-right tabular-nums">
                      {money(run.totals[c])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{money(run.totals.net)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {can.update && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void call(`/payroll/${run.month}/recalculate`, "POST", undefined, t("recalculated"))
            }
            data-testid="recalculate"
          >
            <RefreshCw /> {t("recalculate")}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void call(`/payroll/${run.month}`, "PUT", { status: "DRAFT" }, t("savedDraft"))
            }
          >
            {t("saveDraft")}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void call(`/payroll/${run.month}`, "PUT", { status: "SAVED" }, t("saved"))
            }
            data-testid="save-payroll"
          >
            {tc("save")}
          </Button>
        </div>
      )}
    </div>
  );
}
