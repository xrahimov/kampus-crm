"use client";

import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { SmsStatusBadge } from "@/features/students/sms-tab";
import { Link } from "@/i18n/navigation";
import { useDateFormat } from "@/lib/use-date-format";
import type { Page } from "@/lib/validation/common";
import { SMS_STATUSES, type SmsLogFilters } from "@/lib/validation/integrations";
import type { SmsLogRowDto } from "@/server/services/sms/sms.service";

import { DateRange } from "./date-range";
import { ALL, useLogParams } from "./log-filters";

const SYSTEM = "system";

/** Settings → "Yuborilgan SMSlar" (EXP §8 SMS log): recipient, text, sender, time. */
export function SmsLogPage({
  page,
  filters,
  senders,
}: {
  page: Page<SmsLogRowDto>;
  filters: SmsLogFilters;
  senders: Array<{ id: string; fullName: string }>;
}) {
  const t = useTranslations("sms");
  const tl = useTranslations("sms.log");
  const fmt = useDateFormat();
  const setParam = useLogParams();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tl("title")}</CardTitle>
        <CardDescription>{tl("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox />
          <div className="min-w-36 space-y-1">
            <Label className="text-xs text-muted-foreground">{tl("columns.status")}</Label>
            <Select value={filters.status ?? ALL} onValueChange={(v) => setParam("status", v)}>
              <SelectTrigger data-testid="sms-log-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tl("all")}</SelectItem>
                {SMS_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40 space-y-1">
            <Label className="text-xs text-muted-foreground">{tl("columns.sentBy")}</Label>
            <Select value={filters.sentBy ?? ALL} onValueChange={(v) => setParam("sentBy", v)}>
              <SelectTrigger data-testid="sms-log-sender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tl("all")}</SelectItem>
                <SelectItem value={SYSTEM}>{tl("system")}</SelectItem>
                {senders.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DateRange from={filters.from} to={filters.to} onChange={setParam} idPrefix="sms-log" />
        </div>
        {page.items.length === 0 ? (
          <EmptyState title={tl("empty")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tl("columns.recipient")}</TableHead>
                  <TableHead>{tl("columns.text")}</TableHead>
                  <TableHead>{tl("columns.sentBy")}</TableHead>
                  <TableHead>{tl("columns.sentAt")}</TableHead>
                  <TableHead>{tl("columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((m) => (
                  <TableRow key={m.id} data-testid="sms-log-row">
                    <TableCell className="whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">
                        {t(`recipientTypes.${m.recipientType}`)}
                      </span>
                      <div className="font-medium">
                        {m.studentId ? (
                          <Link href={`/students/${m.studentId}`} className="hover:underline">
                            {m.recipientName}
                          </Link>
                        ) : (
                          m.recipientName
                        )}
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground">{m.phone}</div>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-pre-wrap">
                      {m.text}
                      {m.error && <div className="text-xs text-destructive">{m.error}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {m.sentByName ?? tl("system")}
                      {m.event && (
                        <div className="text-xs text-muted-foreground">
                          {t(`autoEvents.${m.event}`)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmt(new Date(m.sentAt ?? m.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      <SmsStatusBadge status={m.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />
      </CardContent>
    </Card>
  );
}
