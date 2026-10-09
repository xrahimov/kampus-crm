"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { SortHeader } from "@/components/data/sort-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import {
  WAITLIST_STATUSES,
  type WaitlistFilters,
  type WaitlistStatus,
} from "@/lib/validation/leads";
import type { WaitlistEntryDto, WaitlistListDto } from "@/server/services/leads/waitlist.service";

import { WaitlistDialog, type WaitlistDraft } from "./waitlist-dialog";
import { WaitlistEnrolDialog } from "./waitlist-enrol-dialog";

const ALL = "__all";

const STATUS_VARIANT: Record<
  WaitlistStatus,
  "default" | "secondary" | "success" | "muted" | "outline"
> = {
  WAITING: "default",
  OFFERED: "secondary",
  ENROLLED: "success",
  DECLINED: "muted",
  REMOVED: "outline",
};

/** "/leads/waitlist" (A-138): who waits for which course, in order, and what became of them. */
export function WaitlistPage({
  list,
  filters,
  courses,
  branches,
  defaultBranchId,
  canCreate,
  canUpdate,
}: {
  list: WaitlistListDto;
  filters: WaitlistFilters;
  courses: Array<{ id: string; name: string; branchId: string }>;
  branches: Array<{ id: string; name: string }>;
  defaultBranchId: string;
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const t = useTranslations("leads.waitlist");
  const tl = useTranslations("leads");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<WaitlistDraft | null>(null);
  const [enrolling, setEnrolling] = useState<WaitlistEntryDto | null>(null);
  const [removing, setRemoving] = useState<WaitlistEntryDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function setStatus(entry: WaitlistEntryDto, status: "WAITING" | "DECLINED" | "REMOVED") {
    setError(null);
    try {
      await api(`/waitlist/${entry.id}`, { method: "PATCH", body: { status } });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    }
  }

  const showBranch = branches.length > 1;
  const when = (iso: string) => fmt(new Date(iso), { dateStyle: "medium" });
  const status = filters.status ?? ALL;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="waitlist-count">
            {t("count", { count: list.total })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/leads">{tl("title")}</Link>
          </Button>
          {canCreate && (
            <Button
              size="sm"
              onClick={() => setDraft({ entry: null, branchId: defaultBranchId })}
              data-testid="waitlist-add"
            >
              <Plus /> {t("add")}
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <Alert variant="success" data-testid="waitlist-notice">
          {notice}
        </Alert>
      )}
      {error && <Alert variant="destructive">{tc.has(error) ? tc(error) : error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card data-testid="waitlist-summary-waiting">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {t("statuses.WAITING")}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{list.summary.waiting}</p>
          </CardContent>
        </Card>
        <Card data-testid="waitlist-summary-offered">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {t("statuses.OFFERED")}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{list.summary.offered}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.course")}</Label>
          <Select value={filters.courseId ?? ALL} onValueChange={(v) => setParam("courseId", v)}>
            <SelectTrigger data-testid="waitlist-course">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allCourses")}</SelectItem>
              {courses.map((c) => {
                const waiting = list.summary.byCourse.find((x) => x.courseId === c.id)?.waiting;
                return (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {waiting ? ` (${waiting})` : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.status")}</Label>
          <Select value={status} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger data-testid="waitlist-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.open")}</SelectItem>
              {WAITLIST_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`statuses.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-56 flex-1">
          <SearchBox placeholder={t("filters.search")} />
        </div>
      </div>

      <Card>
        {list.items.length === 0 ? (
          <EmptyState title={t("empty")} hint={t("emptyHint")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>
                  <SortHeader field="fullName">{t("columns.person")}</SortHeader>
                </TableHead>
                <TableHead>{t("columns.course")}</TableHead>
                <TableHead>{t("columns.preferred")}</TableHead>
                <TableHead>
                  <SortHeader field="status">{t("columns.status")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="createdAt">{t("columns.added")}</SortHeader>
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((e) => (
                <TableRow key={e.id} data-testid="waitlist-row" data-status={e.status}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {e.position ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{e.fullName}</div>
                    <div className="text-xs text-muted-foreground">{e.phone}</div>
                    {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
                  </TableCell>
                  <TableCell>
                    {e.courseName}
                    {showBranch && (
                      <div className="text-xs text-muted-foreground">{e.branchName}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {[e.days ? tl(`days.${e.days}`) : null, e.lessonTime]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[e.status]} data-testid="waitlist-row-status">
                      {t(`statuses.${e.status}`)}
                    </Badge>
                    {e.offeredGroup && (
                      <div className="mt-1 text-xs">
                        <Link href={`/groups/${e.offeredGroup.id}`} className="hover:underline">
                          {e.offeredGroup.name}
                        </Link>
                        {e.offeredAt && (
                          <span className="text-muted-foreground"> · {when(e.offeredAt)}</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {when(e.createdAt)}
                    {e.createdBy && (
                      <div className="text-xs text-muted-foreground">{e.createdBy}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {canUpdate && e.status !== "ENROLLED" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={tc("actionsFor", { name: e.fullName })}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setEnrolling(e)}
                            data-testid="waitlist-enrol"
                          >
                            {t("enrol")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setDraft({ entry: e, branchId: e.branchId })}
                          >
                            {tc("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {e.status !== "WAITING" && (
                            <DropdownMenuItem
                              onSelect={() => void setStatus(e, "WAITING")}
                              data-testid="waitlist-reopen"
                            >
                              {t("actions.reopen")}
                            </DropdownMenuItem>
                          )}
                          {e.status !== "DECLINED" && (
                            <DropdownMenuItem
                              onSelect={() => void setStatus(e, "DECLINED")}
                              data-testid="waitlist-decline"
                            >
                              {t("actions.decline")}
                            </DropdownMenuItem>
                          )}
                          {e.status !== "REMOVED" && (
                            <DropdownMenuItem
                              onSelect={() => setRemoving(e)}
                              className="text-destructive focus:text-destructive"
                            >
                              {tc("remove")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} />

      <WaitlistDialog
        draft={draft}
        courses={courses}
        branches={branches}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        onSaved={(entry) => {
          setNotice(t("added", { name: entry.fullName, course: entry.courseName }));
          refresh();
        }}
      />
      <WaitlistEnrolDialog
        entry={enrolling}
        onOpenChange={(open) => {
          if (!open) setEnrolling(null);
        }}
        onSaved={() => {
          setNotice(t("enrolled", { name: enrolling?.fullName ?? "" }));
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("removeTitle")}
        description={t("removeText", { name: removing?.fullName ?? "" })}
        confirmLabel={tc("remove")}
        onConfirm={async () => {
          if (removing) await setStatus(removing, "REMOVED");
        }}
      />
    </div>
  );
}
