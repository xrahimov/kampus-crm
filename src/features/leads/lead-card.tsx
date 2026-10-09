"use client";

import { CalendarClock, Clock, MoreHorizontal, Phone, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { dayDiff } from "@/lib/lead-follow-up";
import { cn } from "@/lib/utils";
import { useDateFormat } from "@/lib/use-date-format";
import type { LeadDto } from "@/server/services/leads/leads.service";

const TEMPERATURE_CLASS: Record<string, string> = {
  HOT: "border-transparent bg-destructive/15 text-destructive",
  WARM: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
  COLD: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

export const STATUS_VARIANT: Record<
  LeadDto["status"],
  "outline" | "success" | "secondary" | "muted"
> = {
  NEW: "outline",
  CONTACTED: "success",
  UNREACHABLE: "secondary",
  LOST: "muted",
};

/** One Kanban card. The lead card in the reference was not visible (EXP §2), so this is ours (A-66). */
export function LeadCard({
  lead,
  today,
  columns,
  selected,
  onSelect,
  canUpdate,
  canDelete,
  onEdit,
  onMove,
  onArchive,
  onDelete,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  lead: LeadDto;
  /** The day the follow-up badge is judged against, "YYYY-MM-DD". */
  today: string;
  columns: Array<{ id: string; name: string }>;
  selected: boolean;
  onSelect: ((checked: boolean) => void) | null;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onMove: (columnId: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const t = useTranslations();
  const tl = useTranslations("leads");
  const fmt = useDateFormat();
  const meta = [
    lead.teacherName,
    lead.days ? t(`leads.days.${lead.days}`) : null,
    lead.lessonTime,
  ].filter(Boolean);
  // Days past the planned next contact (A-126): positive = overdue, 0 = today, negative = ahead.
  const followUp = lead.nextContactAt ? dayDiff(lead.nextContactAt, today) : null;

  return (
    <li
      draggable={canUpdate}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      data-testid="lead-card"
      data-lead-id={lead.id}
      className={cn(
        "rounded-md border bg-card p-3 text-sm shadow-xs",
        canUpdate && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <div className="flex items-start gap-2">
        {onSelect && (
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onSelect(c === true)}
            aria-label={tl("select", { name: lead.fullName })}
            className="mt-0.5"
          />
        )}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onEdit}
            className="block w-full truncate text-left font-medium hover:underline"
          >
            {lead.fullName}
          </button>
          {lead.phones[0] && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Phone className="size-3" /> {lead.phones[0]}
              {lead.phones.length > 1 && ` +${lead.phones.length - 1}`}
            </p>
          )}
        </div>
        {(canUpdate || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-1 size-7"
                aria-label={t("common.actionsFor", { name: lead.fullName })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdate && (
                <DropdownMenuItem onSelect={onEdit}>{t("common.edit")}</DropdownMenuItem>
              )}
              {canUpdate && columns.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{tl("moveTo")}</DropdownMenuLabel>
                  {columns
                    .filter((c) => c.id !== lead.columnId)
                    .map((c) => (
                      <DropdownMenuItem key={c.id} onSelect={() => onMove(c.id)}>
                        {c.name}
                      </DropdownMenuItem>
                    ))}
                </>
              )}
              {canUpdate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onArchive}>
                    {lead.isArchived ? tl("restore") : t("common.archive")}
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onSelect={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  {t("common.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge variant={STATUS_VARIANT[lead.status]}>{t(`leads.statuses.${lead.status}`)}</Badge>
        {lead.temperature && (
          <Badge className={TEMPERATURE_CLASS[lead.temperature]}>
            {t(`leads.temperatures.${lead.temperature}`)}
          </Badge>
        )}
        {followUp !== null && followUp > 0 && (
          <Badge variant="destructive" data-testid="lead-overdue">
            {tl("followUp.overdue", { count: followUp })}
          </Badge>
        )}
        {followUp === 0 && (
          <Badge
            className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300"
            data-testid="lead-due-today"
          >
            {tl("followUp.today")}
          </Badge>
        )}
        {lead.sourceName && <Badge variant="secondary">{lead.sourceName}</Badge>}
        {lead.referrerName && (
          <Badge variant="outline" data-testid="lead-referrer">
            {tl("referredBy", { name: lead.referrerName })}
          </Badge>
        )}
        {lead.formName && (
          <Badge variant="outline" title={tl("fromForm")}>
            {lead.formName}
          </Badge>
        )}
      </div>
      {meta.length > 0 && (
        <p className="mt-2 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <UserRound className="size-3 shrink-0" /> {meta.join(" · ")}
        </p>
      )}
      {lead.comment && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{lead.comment}</p>
      )}
      <p className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3" /> {fmt(new Date(lead.createdAt), { dateStyle: "medium" })}
          {followUp !== null && followUp < 0 && lead.nextContactAt && (
            <span className="ml-2 flex items-center gap-1" data-testid="lead-next">
              <CalendarClock className="size-3" />{" "}
              {fmt(parseDateOnly(lead.nextContactAt), { dateStyle: "medium" })}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {lead.ownerName && (
            <span className="truncate" title={tl("followUp.owner")} data-testid="lead-owner">
              {lead.ownerName}
            </span>
          )}
          {lead.studentId && (
            <Link href={`/students/${lead.studentId}`} className="hover:underline">
              {tl("student")}
            </Link>
          )}
        </span>
      </p>
    </li>
  );
}
