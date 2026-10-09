"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { MySalaryDto } from "@/server/services/finance/my-salary.service";

/** "YYYY-MM" moved by `by` months. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "My salary" (A-127): the signed-in person's own month, computed the payroll way. */
export function MySalaryPage({ data, currentMonth }: { data: MySalaryDto; currentMonth: string }) {
  const t = useTranslations("salary");
  const tp = useTranslations("finance.payroll");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const monthLabel = (month: string) =>
    fmt(parseDateOnly(`${month}-01`), { month: "short", year: "numeric" });
  const { line, official } = data;
  const groupsTotal = line.percent + line.perLesson + line.perStudent;
  const adjustments = line.bonus - line.penalty - line.advance;
  const signed = (value: number) => (value < 0 ? `−${money(-value)}` : `+${money(value)}`);
  const isCurrent = data.month >= currentMonth;

  const cards = [
    { key: "net", label: t("cards.net"), value: money(line.net) },
    { key: "groups", label: t("cards.groups"), value: money(groupsTotal) },
    { key: "fixed", label: t("cards.fixed"), value: money(line.fixed) },
    { key: "adjustments", label: t("cards.adjustments"), value: signed(adjustments) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-1" data-testid="salary-month-nav">
          <Button asChild variant="ghost" size="icon" aria-label={t("prevMonth")}>
            <Link
              href={`/account/salary?month=${shiftMonth(data.month, -1)}`}
              data-testid="salary-prev"
            >
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-36 text-center text-sm font-medium" data-testid="salary-month">
            {monthLabel(data.month)}
          </span>
          {isCurrent ? (
            <Button variant="ghost" size="icon" aria-label={t("nextMonth")} disabled>
              <ChevronRight />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="icon" aria-label={t("nextMonth")}>
              <Link href={`/account/salary?month=${shiftMonth(data.month, 1)}`}>
                <ChevronRight />
              </Link>
            </Button>
          )}
          {!isCurrent && (
            <Button asChild variant="outline" size="sm">
              <Link href="/account/salary" data-testid="salary-this-month">
                {t("thisMonth")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!data.paid ? (
        <Card>
          <EmptyState title={t("notPaid")} hint={t("notPaidHint")} />
        </Card>
      ) : (
        <>
          <Card data-testid="salary-status">
            <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
              {official ? (
                official.status === "APPROVED" ? (
                  <>
                    <Badge variant="success">{t("history.APPROVED")}</Badge>
                    <span>
                      {t("status.approved", {
                        amount: money(official.net),
                        date: official.approvedAt
                          ? fmt(new Date(official.approvedAt), { dateStyle: "medium" })
                          : "",
                        name: official.approvedBy ?? "",
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Badge variant="outline">{t("history.MODERATION")}</Badge>
                    <span>{t("status.moderation")}</span>
                  </>
                )
              ) : (
                <span className="text-muted-foreground">{t("status.open")}</span>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.key} data-testid={`salary-${c.key}`}>
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-sm" data-testid="salary-rule">
            <span className="text-muted-foreground">{t("rule")}: </span>
            {data.method
              ? t(`methods.${data.method}`, {
                  value: data.method === "PERCENT" ? (data.rate ?? 0) : money(data.rate ?? 0),
                })
              : t("noRule")}
          </p>

          <Card>
            <CardHeader>
              <CardTitle>{t("groups.title")}</CardTitle>
              <CardDescription>{tp("rulesNote")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {line.details.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("groups.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("groups.group")}</TableHead>
                      <TableHead>{t("groups.rule")}</TableHead>
                      <TableHead className="text-right">{t("groups.students")}</TableHead>
                      <TableHead className="text-right">{t("groups.lessons")}</TableHead>
                      <TableHead className="text-right">{t("groups.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {line.details.map((d) => (
                      <TableRow key={d.groupId} data-testid="salary-group">
                        <TableCell>
                          <Link
                            href={`/groups/${d.groupId}`}
                            className="font-medium hover:underline"
                          >
                            {d.groupName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tp(`shareTypes.${d.shareType}`, {
                            value: d.shareValue,
                            students: d.students,
                            lessons: d.lessons,
                            price: money(d.coursePrice),
                          })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{d.students}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.lessons}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(d.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-medium">
                      <TableCell colSpan={4}>{tp("total")}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(groupsTotal)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("entries.title")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.entries.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("entries.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("entries.date")}</TableHead>
                      <TableHead>{t("entries.type")}</TableHead>
                      <TableHead>{t("entries.comment")}</TableHead>
                      <TableHead className="text-right">{t("entries.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.entries.map((e) => (
                      <TableRow key={e.id} data-testid="salary-entry">
                        <TableCell>{fmt(parseDateOnly(e.date), { dateStyle: "medium" })}</TableCell>
                        <TableCell>
                          <Badge variant={e.type === "BONUS" ? "success" : "outline"}>
                            {t(`entries.types.${e.type}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.comment ?? ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {e.type === "BONUS" ? signed(e.amount) : signed(-e.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("history.title")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.history.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("history.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("history.month")}</TableHead>
                      <TableHead>{t("history.status")}</TableHead>
                      <TableHead className="text-right">{t("history.salary")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.history.map((h) => (
                      <TableRow key={h.month} data-testid="salary-history">
                        <TableCell>
                          <Link
                            href={`/account/salary?month=${h.month}`}
                            className="font-medium hover:underline"
                          >
                            {monthLabel(h.month)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={h.status === "APPROVED" ? "success" : "outline"}>
                            {t(`history.${h.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(h.net)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            {data.rules.payOnlyAttendedLessons && `${t("rules.onlyAttended")} `}
            {data.rules.payTeacherOnGroupDayOff && t("rules.dayOff")}
          </p>
        </>
      )}
    </div>
  );
}
