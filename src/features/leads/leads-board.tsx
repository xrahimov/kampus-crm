"use client";

import {
  ListOrdered,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  Plus,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { ExcelLink } from "@/features/shared/excel-link";
import { SendSmsDialog } from "@/features/sms/send-sms-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { SearchBox } from "@/components/data/search-box";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  BranchSelect,
  creatableBranches,
  type BranchOption,
} from "@/features/settings/shared/branch-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { cn } from "@/lib/utils";
import { LEAD_DAYS, type LeadFilters } from "@/lib/validation/leads";
import type { LeadBoardDto } from "@/server/services/leads/boards.service";
import type {
  BoardColumnDto,
  BoardViewDto,
  LeadDto,
  LeadOptions,
  LeadsToGroupResult,
} from "@/server/services/leads/leads.service";

import { AddToGroupDialog } from "./add-to-group-dialog";
import { LeadCard } from "./lead-card";
import { TrialDialog } from "./trial-dialog";
import { WaitlistDialog, type WaitlistDraft } from "./waitlist-dialog";
import { LeadDialog } from "./lead-dialog";
import { NameDialog } from "./name-dialog";

const ALL = "__all";

/** EXP §2 "/lids": board selector, filters, Kanban columns with cards. */
export function LeadsBoard({
  view,
  options,
  filters,
  branches: allBranchOptions,
  actorBranchIds,
  activeBranchId,
  allBranches,
  userId,
  can,
}: {
  view: BoardViewDto;
  options: LeadOptions;
  filters: LeadFilters;
  branches: BranchOption[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
  /** The signed-in person, shown as "Me" among the owners (A-126). */
  userId: string;
  can: { create: boolean; update: boolean; delete: boolean; groups: boolean; sms: boolean };
}) {
  /** Branches a new board may be created in, and the one preselected. */
  const { options: branches, defaultId } = creatableBranches(
    allBranchOptions,
    actorBranchIds,
    activeBranchId,
    allBranches,
  );
  const defaultBranchId = view.board?.branchId ?? defaultId;
  const t = useTranslations();
  const tl = useTranslations("leads");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [leadDialog, setLeadDialog] = useState<{
    open: boolean;
    lead: LeadDto | null;
    columnId: string;
  }>({ open: false, lead: null, columnId: "" });
  const [boardDialog, setBoardDialog] = useState<{ open: boolean; board: LeadBoardDto | null }>({
    open: false,
    board: null,
  });
  const [boardBranchId, setBoardBranchId] = useState(defaultBranchId);
  const [columnDialog, setColumnDialog] = useState<BoardColumnDto | null>(null);
  const [inlineColumn, setInlineColumn] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [deletingLead, setDeletingLead] = useState<LeadDto | null>(null);
  const [trialLead, setTrialLead] = useState<LeadDto | null>(null);
  const [waitlistDraft, setWaitlistDraft] = useState<WaitlistDraft | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<BoardColumnDto | null>(null);
  const [smsColumn, setSmsColumn] = useState<BoardColumnDto | null>(null);
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingToGroup, setAddingToGroup] = useState(false);
  // Bulk actions on the ticked cards (A-132).
  const [bulkConfirm, setBulkConfirm] = useState<"archive" | "restore" | null>(null);
  const [bulkSms, setBulkSms] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());
  const board = view.board;
  const columns = view.columns.map((c) => ({ id: c.id, name: c.name }));
  const archived = filters.archived ?? false;
  const showBranch = new Set(view.boards.map((b) => b.branchId)).size > 1;

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "errors.internal");
  }

  async function move(leadId: string, columnId: string, beforeLeadId: string | null = null) {
    setError(null);
    try {
      await api(`/leads/${leadId}/move`, { method: "POST", body: { columnId, beforeLeadId } });
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  async function toggleArchived(lead: LeadDto) {
    setError(null);
    try {
      await api(`/leads/${lead.id}/${lead.isArchived ? "restore" : "archive"}`, { method: "POST" });
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  async function bulk(body: { action: "archive" | "restore" | "move"; columnId?: string }) {
    setError(null);
    try {
      const result = await api<{ done: number; skipped: number }>("/leads/bulk", {
        method: "POST",
        body: { ...body, leadIds: [...selected] },
      });
      setSelected(new Set());
      setNotice(tl("bulk.done", { done: result.done, skipped: result.skipped }));
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  async function cancelTrial(lead: LeadDto) {
    if (!lead.trial) return;
    setError(null);
    try {
      await api(`/leads/trials/${lead.trial.id}`, {
        method: "PATCH",
        body: { status: "CANCELLED" },
      });
      setNotice(tl("trial.cancelled"));
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  async function addInlineColumn() {
    if (!board) return;
    const name = (inlineColumn ?? "").trim();
    if (!name) {
      setInlineError("validation.required");
      return;
    }
    try {
      await api(`/lead-boards/${board.id}/columns`, { method: "POST", body: { name } });
      setInlineColumn(null);
      setInlineError(null);
      refresh();
    } catch (e) {
      setInlineError(
        e instanceof ApiError ? (e.fields?.name?.[0] ?? e.message) : "errors.internal",
      );
    }
  }

  function onDrop(columnId: string, beforeLeadId: string | null) {
    if (!dragging) return;
    const id = dragging;
    setDragging(null);
    setDropTarget(null);
    if (beforeLeadId === id) return;
    void move(id, columnId, beforeLeadId);
  }

  const filterSelect = (
    key: "lessonTime" | "teacherId" | "days" | "ownerId",
    label: string,
    items: Array<{ value: string; label: string }>,
  ) => (
    <div className="min-w-40 space-y-1">
      <Label className="text-xs text-muted-foreground" htmlFor={`leads-filter-${key}`}>
        {label}
      </Label>
      <Select value={filters[key] ?? ALL} onValueChange={(v) => setParam(key, v)}>
        <SelectTrigger id={`leads-filter-${key}`} className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{tl("filters.all")}</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{tl("title")}</h1>
          {view.boards.length > 0 && (
            <Select value={board?.id ?? ""} onValueChange={(v) => setParam("board", v)}>
              <SelectTrigger
                className="h-9 w-auto min-w-44"
                aria-label={tl("board")}
                data-testid="board-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {view.boards.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {showBranch ? `${b.branchName} · ` : ""}
                    {b.name} ({b.leadCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {board && can.update && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={tl("editBoard")}
              onClick={() => setBoardDialog({ open: true, board })}
            >
              <Pencil />
            </Button>
          )}
          {board && can.delete && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={tl("deleteBoard")}
              onClick={() => setDeletingBoard(true)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/leads/sources">{tl("sources")}</Link>
          </Button>
          {can.update && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBoardBranchId(defaultBranchId);
                setBoardDialog({ open: true, board: null });
              }}
              data-testid="create-board"
            >
              <Plus /> {tl("createBoard")}
            </Button>
          )}
          {can.groups && board && (
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => setAddingToGroup(true)}
              data-testid="leads-to-group"
            >
              <UsersRound /> {tl("addToGroup.button", { count: selected.size })}
            </Button>
          )}
          <Button asChild variant={view.due > 0 ? "default" : "outline"} size="sm">
            <Link href="/leads/calls" data-testid="leads-calls">
              <PhoneCall /> {tl("calls.button", { count: view.due })}
            </Link>
          </Button>
          <Button
            asChild
            variant={options.unreadConversations > 0 ? "default" : "outline"}
            size="sm"
          >
            <Link href="/leads/inbox" data-testid="leads-inbox">
              <MessageCircle /> {tl("inbox.button", { count: options.unreadConversations })}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/leads/waitlist" data-testid="leads-waitlist">
              <ListOrdered /> {tl("waitlist.button", { count: options.waiting })}
            </Link>
          </Button>
          <ExcelLink path="/leads/export.xlsx" params={searchParams} testId="leads-excel" />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("common.search")}</Label>
          <SearchBox />
        </div>
        {filterSelect(
          "lessonTime",
          tl("filters.lessonTime"),
          options.lessonTimes.map((x) => ({ value: x, label: x })),
        )}
        {filterSelect(
          "teacherId",
          tl("filters.teacher"),
          options.teachers.map((x) => ({ value: x.id, label: x.fullName })),
        )}
        {filterSelect(
          "days",
          tl("filters.days"),
          LEAD_DAYS.map((d) => ({ value: d, label: t(`leads.days.${d}`) })),
        )}
        {filterSelect("ownerId", tl("filters.owner"), [
          { value: "none", label: tl("filters.unassigned") },
          ...options.owners.map((o) => ({
            value: o.id,
            label: o.id === userId ? tl("filters.me") : o.fullName,
          })),
        ])}
        <label className="flex h-8 items-center gap-2 text-xs">
          <Switch
            checked={archived}
            onCheckedChange={(v) => setParam("archived", v ? "true" : null)}
            data-testid="leads-archived"
          />
          {tl("filters.archive")}
        </label>
        <Link
          href="/settings/integrations/amocrm"
          className="flex h-8 items-center gap-2 text-xs text-muted-foreground hover:underline"
          title={tl("amocrmHint")}
        >
          {tl("amocrm")}
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t.has(error) ? t(error) : t("errors.internal")}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {board && can.update && selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          data-testid="leads-bulk"
        >
          <span className="font-medium" data-testid="leads-bulk-count">
            {tl("bulk.selected", { count: selected.size })}
          </span>
          {!archived && columns.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="bulk-move">
                  {tl("bulk.move")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {columns.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={() => void bulk({ action: "move", columnId: c.id })}
                  >
                    {c.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {can.sms && !archived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkSms(true)}
              data-testid="bulk-sms"
            >
              {tl("bulk.sms")}
            </Button>
          )}
          <Button
            variant={archived ? "outline" : "destructive"}
            size="sm"
            onClick={() => setBulkConfirm(archived ? "restore" : "archive")}
            data-testid="bulk-archive"
          >
            {archived ? tl("bulk.restore") : tl("bulk.archive")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
            data-testid="bulk-clear"
          >
            {tl("bulk.clear")}
          </Button>
        </div>
      )}

      {!board ? (
        <Card>
          <EmptyState title={tl("noBoards")} hint={can.update ? tl("noBoardsHint") : undefined} />
        </Card>
      ) : (
        <div className="flex items-start gap-4 overflow-x-auto pb-4" data-testid="kanban">
          {view.columns.map((column) => (
            <section
              key={column.id}
              data-testid="lead-column"
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dropTarget !== column.id) setDropTarget(column.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                if (dropTarget === column.id) setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const before = (e.target as HTMLElement).closest<HTMLElement>("[data-lead-id]");
                onDrop(column.id, before?.dataset.leadId ?? null);
              }}
              className={cn(
                "flex w-80 shrink-0 flex-col rounded-lg border bg-muted/40",
                dropTarget === column.id && "ring-2 ring-primary/40",
              )}
            >
              <header className="flex items-center gap-2 px-3 py-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold uppercase">
                  {column.name}{" "}
                  <span className="font-normal text-muted-foreground" data-testid="column-count">
                    {column.total}
                  </span>
                </h2>
                {can.update && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t("common.actionsFor", { name: column.name })}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!can.sms || column.total === 0}
                        onSelect={() => setSmsColumn(column)}
                        data-testid="column-sms"
                      >
                        {tl("columnSms")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setColumnDialog(column)}>
                        <Pencil /> {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDeletingColumn(column)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 /> {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </header>
              <ul className="flex min-h-16 flex-col gap-2 px-3">
                {column.leads.length === 0 && (
                  <li className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    {tl("emptyColumn")}
                  </li>
                )}
                {column.leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    today={view.today}
                    columns={columns}
                    selected={selected.has(lead.id)}
                    onSelect={
                      can.groups || can.update
                        ? (checked) =>
                            setSelected((s) => {
                              const next = new Set(s);
                              if (checked) next.add(lead.id);
                              else next.delete(lead.id);
                              return next;
                            })
                        : null
                    }
                    canUpdate={can.update}
                    canDelete={can.delete}
                    onEdit={() => setLeadDialog({ open: true, lead, columnId: lead.columnId })}
                    onMove={(columnId) => void move(lead.id, columnId)}
                    onArchive={() => void toggleArchived(lead)}
                    onDelete={() => setDeletingLead(lead)}
                    onTrial={lead.studentId || lead.isArchived ? null : () => setTrialLead(lead)}
                    onWaitlist={
                      lead.isArchived
                        ? null
                        : () =>
                            setWaitlistDraft({
                              entry: null,
                              leadId: lead.id,
                              branchId: lead.branchId,
                              fullName: lead.fullName,
                              phone: lead.phones[0] ?? "",
                              days: lead.days,
                              lessonTime: lead.lessonTime,
                            })
                    }
                    onCancelTrial={lead.trial ? () => void cancelTrial(lead) : null}
                    onDragStart={() => setDragging(lead.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    dragging={dragging === lead.id}
                  />
                ))}
              </ul>
              {can.create && !archived && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="m-2 justify-start"
                  onClick={() => setLeadDialog({ open: true, lead: null, columnId: column.id })}
                  data-testid="add-lead"
                >
                  <Plus /> {tl("add")}
                </Button>
              )}
            </section>
          ))}
          {can.update && (
            <div className="w-72 shrink-0">
              {inlineColumn === null ? (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setInlineColumn("")}
                  data-testid="add-column"
                >
                  <Plus /> {tl("addColumn")}
                </Button>
              ) : (
                <form
                  className="space-y-2 rounded-lg border bg-card p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addInlineColumn();
                  }}
                >
                  <Label htmlFor="inline-column">{tl("columnName")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="inline-column"
                      value={inlineColumn}
                      onChange={(e) => setInlineColumn(e.target.value)}
                      autoFocus
                    />
                    <Button type="submit" size="sm">
                      {t("common.add")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.cancel")}
                      onClick={() => {
                        setInlineColumn(null);
                        setInlineError(null);
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                  {inlineError && (
                    <p className="text-sm text-destructive">
                      {t.has(inlineError) ? t(inlineError) : t("errors.internal")}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {board && (
        <LeadDialog
          open={leadDialog.open}
          onOpenChange={(open) => setLeadDialog((d) => ({ ...d, open }))}
          lead={leadDialog.lead}
          boardId={board.id}
          columns={columns}
          defaultColumnId={leadDialog.columnId || (columns[0]?.id ?? "")}
          options={options}
          onSaved={refresh}
        />
      )}

      <NameDialog
        open={boardDialog.open}
        onOpenChange={(open) => setBoardDialog((d) => ({ ...d, open }))}
        title={boardDialog.board ? tl("editBoard") : tl("createBoard")}
        label={tl("boardName")}
        initial={boardDialog.board?.name ?? ""}
        testId="board-dialog"
        onSubmit={async (name) => {
          if (boardDialog.board) {
            await api(`/lead-boards/${boardDialog.board.id}`, { method: "PATCH", body: { name } });
            refresh();
          } else {
            const created = await api<LeadBoardDto>("/lead-boards", {
              method: "POST",
              body: { name, branchId: boardBranchId },
            });
            setParam("board", created.id);
          }
        }}
      >
        {!boardDialog.board && (
          <BranchSelect
            id="board-branch"
            branches={branches}
            value={boardBranchId}
            onChange={setBoardBranchId}
          />
        )}
      </NameDialog>

      <NameDialog
        open={!!columnDialog}
        onOpenChange={(open) => !open && setColumnDialog(null)}
        title={tl("editColumn")}
        label={tl("columnName")}
        initial={columnDialog?.name ?? ""}
        testId="column-dialog"
        onSubmit={async (name) => {
          if (!columnDialog) return;
          await api(`/lead-columns/${columnDialog.id}`, { method: "PATCH", body: { name } });
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!deletingLead}
        onOpenChange={(open) => !open && setDeletingLead(null)}
        title={tl("deleteTitle")}
        description={tl("deleteText", { name: deletingLead?.fullName ?? "" })}
        onConfirm={async () => {
          if (!deletingLead) return;
          await api(`/leads/${deletingLead.id}`, { method: "DELETE" });
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deletingColumn}
        onOpenChange={(open) => !open && setDeletingColumn(null)}
        title={tl("deleteColumnTitle")}
        description={tl("deleteColumnText", { name: deletingColumn?.name ?? "" })}
        onConfirm={async () => {
          if (!deletingColumn) return;
          await api(`/lead-columns/${deletingColumn.id}`, { method: "DELETE" });
          refresh();
        }}
      />
      <ConfirmDialog
        open={deletingBoard}
        onOpenChange={setDeletingBoard}
        title={tl("deleteBoardTitle")}
        description={tl("deleteBoardText", { name: board?.name ?? "" })}
        onConfirm={async () => {
          if (!board) return;
          await api(`/lead-boards/${board.id}`, { method: "DELETE" });
          setParam("board", null);
        }}
      />
      {board && (
        <AddToGroupDialog
          open={addingToGroup}
          onOpenChange={setAddingToGroup}
          leadIds={[...selected]}
          branchId={board.branchId}
          groups={options.groups}
          onDone={(result: LeadsToGroupResult) => {
            setSelected(new Set());
            setNotice(tl("addToGroup.done", { added: result.added, skipped: result.skipped }));
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={bulkConfirm !== null}
        onOpenChange={(open) => !open && setBulkConfirm(null)}
        title={
          bulkConfirm === "restore"
            ? tl("bulk.restoreTitle", { count: selected.size })
            : tl("bulk.archiveTitle", { count: selected.size })
        }
        description={bulkConfirm === "restore" ? tl("bulk.restoreText") : tl("bulk.archiveText")}
        confirmLabel={bulkConfirm === "restore" ? tl("bulk.restore") : tl("bulk.archive")}
        onConfirm={() => bulk({ action: bulkConfirm ?? "archive" })}
      />
      <SendSmsDialog
        open={bulkSms}
        onOpenChange={setBulkSms}
        target={selected.size > 0 ? { kind: "leads", leadIds: [...selected] } : null}
        title={tl("bulk.smsTitle", { count: selected.size })}
        onSent={refresh}
      />
      <WaitlistDialog
        draft={waitlistDraft}
        courses={options.courses}
        branches={allBranchOptions}
        onOpenChange={(open) => {
          if (!open) setWaitlistDraft(null);
        }}
        onSaved={(entry) => {
          setNotice(tl("waitlist.added", { name: entry.fullName, course: entry.courseName }));
          refresh();
        }}
      />
      <TrialDialog
        lead={trialLead}
        groups={options.groups}
        onOpenChange={(open) => {
          if (!open) setTrialLead(null);
        }}
        onSaved={(booking) => {
          setNotice(
            tl("trial.booked", { date: fmt(parseDateOnly(booking.date), { dateStyle: "medium" }) }),
          );
          refresh();
        }}
      />
      <SendSmsDialog
        open={smsColumn !== null}
        onOpenChange={(open) => {
          if (!open) setSmsColumn(null);
        }}
        target={smsColumn ? { kind: "leadColumn", columnId: smsColumn.id } : null}
        title={smsColumn ? t("sms.send.toStudent", { name: smsColumn.name }) : undefined}
      />
    </div>
  );
}
