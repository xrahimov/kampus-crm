"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { weekdayLabel } from "@/features/groups/weekday";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { MembershipStatus } from "@/lib/validation/groups";
import type { Weekday } from "@/lib/validation/groups";
import type {
  MembershipCalendarDto,
  StudentGroupDto,
} from "@/server/services/students/students.service";

import { MemberStatusBadge } from "./status-badge";
import { BalanceBadge } from "./students-page";

/** Moves a user may make from the status chip (A-08, A-57). */
const NEXT: Record<MembershipStatus, MembershipStatus[]> = {
  NEW: ["TRIAL", "ACTIVE"],
  TRIAL: ["ACTIVE"],
  ACTIVE: ["FROZEN", "GRADUATED"],
  FROZEN: ["ACTIVE"],
  ARCHIVED: [],
  GRADUATED: [],
};

const DAY_CLASS: Record<string, string> = {
  paid: "bg-success/20 text-foreground",
  debt: "bg-destructive/15 text-destructive",
  EXCUSED: "bg-secondary text-secondary-foreground",
  UPCOMING: "border border-dashed text-muted-foreground",
  ABSENT: "bg-muted text-muted-foreground line-through",
};

/** EXP §6 GURUHLAR tab: one card per membership with the lesson calendar. */
export function GroupCard({
  group,
  canEdit,
  canPay,
  onPay,
  onTransfer,
  onToLead,
  onRemove,
  onStatus,
}: {
  group: StudentGroupDto;
  canEdit: boolean;
  canPay: boolean;
  onPay: () => void;
  onTransfer: () => void;
  /** Null when the user may not create leads. */
  onToLead: (() => void) | null;
  onRemove: () => void;
  onStatus: (status: MembershipStatus) => void;
}) {
  const t = useTranslations();
  const tg = useTranslations("students.groupCard");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const [month, setMonth] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<MembershipCalendarDto | null>(null);
  const left = group.status === "ARCHIVED" || group.status === "GRADUATED";

  useEffect(() => {
    const controller = new AbortController();
    const q = month ? `?month=${month}` : "";
    api<MembershipCalendarDto>(`/memberships/${group.membershipId}/calendar${q}`, {
      signal: controller.signal,
    })
      .then(setCalendar)
      .catch(() => {});
    return () => controller.abort();
  }, [group.membershipId, month]);

  const date = (v: string) => fmt(parseDateOnly(v), { dateStyle: "medium" });
  const months = calendar?.months ?? [];
  const idx = calendar ? months.indexOf(calendar.month) : -1;

  const rows: Array<[string, React.ReactNode]> = [
    [tg("grade"), group.gradeAverage ?? t("students.noGrade")],
    [tg("interval"), `${date(group.groupStartDate)} – ${date(group.groupEndDate)}`],
    [tg("teacher"), group.teacherName ?? "—"],
    [tg("time"), group.time ?? "—"],
    [tg("days"), group.weekdays.map((w) => weekdayLabel(fmt, w as Weekday)).join(", ") || "—"],
    [tg("joined"), date(group.joinedAt)],
    ...(group.billingFrom && group.billingFrom !== group.joinedAt
      ? [[tg("billingFrom"), date(group.billingFrom)] as [string, React.ReactNode]]
      : []),
    [left ? tg("left") : tg("ends"), date(group.leftAt ?? group.groupEndDate)],
    [tg("nextPayment"), group.nextPaymentDate ? date(group.nextPaymentDate) : "—"],
    [
      tg("price"),
      <span key="price">
        {money(group.monthlyPrice)}
        {group.customPrice !== null && (
          <span className="ml-1 text-xs text-muted-foreground">({tg("customPrice")})</span>
        )}
      </span>,
    ],
  ];

  return (
    <Card className={cn(left && "opacity-75")} data-testid="student-group-card">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <BalanceBadge value={group.balance} />
          {canEdit && NEXT[group.status].length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md focus-visible:ring-2 focus-visible:outline-hidden"
                >
                  <MemberStatusBadge status={group.status} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>{tg("actions.status")}</DropdownMenuLabel>
                {NEXT[group.status].map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => onStatus(s)}>
                    {t(`groups.memberStatuses.${s}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <MemberStatusBadge status={group.status} />
          )}
          <Link
            href={`/groups/${group.groupId}`}
            className="text-base font-semibold hover:underline"
          >
            {group.groupName}
          </Link>
          <span className="text-sm text-muted-foreground">{group.courseName}</span>
          <div className="ml-auto">
            {(canEdit || canPay) && !left && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.actionsFor", { name: group.groupName })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canPay && (
                    <DropdownMenuItem onSelect={onPay}>{tg("actions.pay")}</DropdownMenuItem>
                  )}
                  {canEdit && (
                    <>
                      <DropdownMenuItem onSelect={onTransfer}>
                        {tg("actions.transfer")}
                      </DropdownMenuItem>
                      {onToLead && (
                        <DropdownMenuItem onSelect={onToLead}>
                          {tg("actions.toLead")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={onRemove}
                        className="text-destructive focus:text-destructive"
                      >
                        {tg("actions.remove")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 sm:justify-start">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        {group.discount && (
          <div className="rounded-md bg-success/10 p-3 text-sm" data-testid="discount-banner">
            {tg("discount", {
              price: money(group.discount.discountedPrice),
              months: group.discount.remainingMonths,
              date: date(group.discount.givenAt),
            })}
            {group.discount.comment && (
              <p className="text-muted-foreground">
                {tg("discountComment", { comment: group.discount.comment })}
              </p>
            )}
          </div>
        )}
        {group.note && <p className="text-sm text-muted-foreground">{group.note}</p>}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {tg("calendar")}
              {calendar && (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({fmt(parseDateOnly(calendar.month), { month: "short", year: "numeric" })})
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={idx <= 0}
                onClick={() => setMonth(months[idx - 1] ?? null)}
                aria-label={t("common.pagination.previous")}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={idx < 0 || idx >= months.length - 1}
                onClick={() => setMonth(months[idx + 1] ?? null)}
                aria-label={t("common.pagination.next")}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          {calendar && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="success">
                  {tg("present")}: {calendar.counts.present}
                </Badge>
                <Badge variant="muted">
                  {tg("absent")}: {calendar.counts.absent}
                </Badge>
                <Badge variant="secondary">
                  {tg("excused")}: {calendar.counts.excused}
                </Badge>
                <Badge variant="outline">
                  {tg("notMarked")}: {calendar.counts.notMarked}
                </Badge>
              </div>
              {calendar.days.length === 0 ? (
                <p className="text-xs text-muted-foreground">{tg("noLessons")}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5" data-testid="lesson-calendar">
                  {calendar.days.map((d) => {
                    const cls =
                      d.status === "UPCOMING"
                        ? DAY_CLASS.UPCOMING
                        : d.status === "ABSENT"
                          ? DAY_CLASS.ABSENT
                          : d.status === "EXCUSED"
                            ? DAY_CLASS.EXCUSED
                            : d.paid
                              ? DAY_CLASS.paid
                              : DAY_CLASS.debt;
                    const label =
                      d.status === "UPCOMING"
                        ? tg("upcoming")
                        : d.status === "ABSENT"
                          ? tg("absent")
                          : d.status === "EXCUSED"
                            ? tg("excused")
                            : d.paid
                              ? tg("paid")
                              : tg("debt");
                    return (
                      <li
                        key={d.date}
                        className={cn("rounded px-2 py-1 text-xs tabular-nums", cls)}
                        title={`${date(d.date)} · ${label}`}
                      >
                        {parseDateOnly(d.date).getUTCDate()}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>
                  <span className={cn("mr-1 inline-block size-2.5 rounded-sm", DAY_CLASS.paid)} />
                  {tg("paid")}
                </span>
                <span>
                  <span className={cn("mr-1 inline-block size-2.5 rounded-sm", DAY_CLASS.debt)} />
                  {tg("debt")}
                </span>
                <span>
                  <span
                    className={cn("mr-1 inline-block size-2.5 rounded-sm", DAY_CLASS.EXCUSED)}
                  />
                  {tg("excused")}
                </span>
                <span>
                  <span
                    className={cn("mr-1 inline-block size-2.5 rounded-sm", DAY_CLASS.UPCOMING)}
                  />
                  {tg("upcoming")}
                </span>
                <span>
                  <span className={cn("mr-1 inline-block size-2.5 rounded-sm", DAY_CLASS.ABSENT)} />
                  {tg("absent")}
                </span>
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
