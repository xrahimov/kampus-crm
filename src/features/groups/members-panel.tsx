"use client";

import { MoreHorizontal, Plus, Search, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { FieldError } from "@/components/data/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { PaymentDialog } from "@/features/payments/payment-dialog";
import { todayIso } from "@/features/staff/password";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MembershipStatus } from "@/lib/validation/groups";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { MembershipDto } from "@/server/services/groups/memberships.service";
import type { PaymentOptionsDto } from "@/server/services/students/payments.service";

import { TransferDialog } from "./transfer-dialog";

const STATUS_VARIANT: Record<
  MembershipStatus,
  "success" | "secondary" | "muted" | "outline" | "default"
> = {
  NEW: "outline",
  TRIAL: "secondary",
  ACTIVE: "success",
  FROZEN: "default",
  ARCHIVED: "muted",
  GRADUATED: "muted",
};
/** Moves a user may make from the status chip (A-08). */
const NEXT: Record<MembershipStatus, MembershipStatus[]> = {
  NEW: ["TRIAL", "ACTIVE"],
  TRIAL: ["ACTIVE"],
  ACTIVE: ["FROZEN", "GRADUATED"],
  FROZEN: ["ACTIVE"],
  ARCHIVED: [],
  GRADUATED: [],
};

/** EXP §5 left panel: the group's students with status chips and the row menu. */
export function MembersPanel({
  groupId,
  groupArchived,
  members,
  showArchived,
  onToggleArchived,
  canEdit,
  canCreateStudent,
  canPay,
  paymentOptions,
}: {
  groupId: string;
  groupArchived: boolean;
  members: MembershipDto[];
  showArchived: boolean;
  onToggleArchived: (value: boolean) => void;
  canEdit: boolean;
  canCreateStudent: boolean;
  canPay: boolean;
  paymentOptions: PaymentOptionsDto;
}) {
  const t = useTranslations();
  const tm = useTranslations("groups.members");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [showJoined, setShowJoined] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MembershipDto | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [paying, setPaying] = useState<MembershipDto | null>(null);
  const [transferring, setTransferring] = useState<MembershipDto | null>(null);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  const canActivate =
    canEdit && !groupArchived && members.some((m) => m.status === "NEW" || m.status === "TRIAL");

  const visible = members.filter((m) => {
    const q = query.trim().toLowerCase();
    return !q || m.fullName.toLowerCase().includes(q) || (m.phone ?? "").includes(q);
  });

  async function setStatus(m: MembershipDto, status: MembershipStatus) {
    setError(null);
    try {
      await api(`/memberships/${m.id}`, { method: "PATCH", body: { status } });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {tm("title")} <span className="text-muted-foreground">({members.length})</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {canActivate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActivating(true)}
              data-testid="activate-members"
            >
              <UserCheck /> {tm("activateAll")}
            </Button>
          )}
          {canEdit && !groupArchived && (
            <Button size="sm" onClick={() => setAdding(true)} data-testid="add-member">
              <Plus /> {tm("add")}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            aria-label={t("common.search")}
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={showJoined} onCheckedChange={setShowJoined} />
          {tm("showJoined")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={showBalance} onCheckedChange={setShowBalance} />
          {tm("showBalance")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={showArchived}
            onCheckedChange={onToggleArchived}
            data-testid="members-archived"
          />
          {tm("showArchived")}
        </label>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {(["TRIAL", "ACTIVE", "ARCHIVED", "FROZEN"] as MembershipStatus[]).map((s) => (
          <Badge key={s} variant={STATUS_VARIANT[s]}>
            {t(`groups.memberStatuses.${s}`)}
          </Badge>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t.has(error) ? t(error) : t("errors.internal")}
        </p>
      )}
      {visible.length === 0 ? (
        <EmptyState title={tm("empty")} />
      ) : (
        <ul className="divide-y rounded-md border">
          {visible.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2" data-testid="member-row">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/students/${m.studentId}`}
                  className="block truncate font-medium hover:underline"
                >
                  {m.fullName}
                </Link>
                <p className="truncate text-xs text-muted-foreground tabular-nums">
                  {m.phone ?? "—"}
                  {showJoined &&
                    ` · ${tm("joined")} ${fmt(parseDateOnly(m.joinedAt), { dateStyle: "medium" })}`}
                </p>
              </div>
              {showBalance && m.balance !== null && (
                <Badge
                  variant={m.balance < 0 ? "destructive" : m.balance > 0 ? "success" : "outline"}
                  className="tabular-nums"
                  title={tm("balance")}
                  data-testid="member-balance"
                >
                  {money(m.balance)}
                </Badge>
              )}
              {canEdit && NEXT[m.status].length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "rounded-md focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden",
                      )}
                    >
                      <Badge variant={STATUS_VARIANT[m.status]}>
                        {t(`groups.memberStatuses.${m.status}`)} ▾
                      </Badge>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{tm("changeStatus")}</DropdownMenuLabel>
                    {NEXT[m.status].map((s) => (
                      <DropdownMenuItem key={s} onSelect={() => setStatus(m, s)}>
                        {t(`groups.memberStatuses.${s}`)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Badge variant={STATUS_VARIANT[m.status]}>
                  {t(`groups.memberStatuses.${m.status}`)}
                </Badge>
              )}
              {canEdit && m.status !== "ARCHIVED" && m.status !== "GRADUATED" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.actionsFor", { name: m.fullName })}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {m.status === "ACTIVE" && (
                      <DropdownMenuItem onSelect={() => setStatus(m, "GRADUATED")}>
                        {tm("graduate")}
                      </DropdownMenuItem>
                    )}
                    {canPay && (
                      <DropdownMenuItem onSelect={() => setPaying(m)}>
                        {tm("payment")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setTransferring(m)}>
                      {tm("transfer")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setRemoving(m)}
                      className="text-destructive focus:text-destructive"
                    >
                      {tm("remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddMemberDialog
        groupId={groupId}
        open={adding}
        onOpenChange={setAdding}
        canCreateStudent={canCreateStudent}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setRemoveReason("");
          }
        }}
        title={tm("removeTitle")}
        description={tm("removeText", { name: removing?.fullName ?? "" })}
        confirmLabel={tm("remove")}
        onConfirm={async () => {
          if (!removing) return;
          await api(`/memberships/${removing.id}/remove`, {
            method: "POST",
            body: { reason: removeReason.trim() || null },
          });
          refresh();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="remove-reason">{t("students.remove.reason")}</Label>
          <Input
            id="remove-reason"
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={activating}
        onOpenChange={setActivating}
        title={tm("activateTitle")}
        description={tm("activateText")}
        confirmLabel={tm("activateAll")}
        onConfirm={async () => {
          await api(`/groups/${groupId}/activate-members`, { method: "POST" });
          refresh();
        }}
      />
      {paying && (
        <PaymentDialog
          open={!!paying}
          onOpenChange={(open) => !open && setPaying(null)}
          studentName={paying.fullName}
          memberships={[{ membershipId: paying.id, groupName: "", status: paying.status }]}
          defaultMembershipId={paying.id}
          options={paymentOptions}
          onSaved={refresh}
        />
      )}
      <TransferDialog
        open={!!transferring}
        onOpenChange={(open) => !open && setTransferring(null)}
        membershipId={transferring?.id ?? null}
        currentGroupId={groupId}
        studentName={transferring?.fullName ?? ""}
        onSaved={refresh}
      />
    </div>
  );
}

type Candidate = { id: string; fullName: string; phone: string | null };

/** "Guruhga o'quvchi qo'shish", manual mode: pick an existing student or type a new one. */
function AddMemberDialog({
  groupId,
  open,
  onOpenChange,
  canCreateStudent,
  onSaved,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCreateStudent: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tm = useTranslations("groups.members");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [customPrice, setCustomPrice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!open || createNew || search.trim().length < 2) return;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      api<Candidate[]>(`/students/search?q=${encodeURIComponent(search.trim())}`, {
        signal: controller.signal,
      })
        .then(setResults)
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [search, open, createNew]);

  function reset() {
    setSearch("");
    setResults([]);
    setPicked(null);
    setCreateNew(false);
    setCustomPrice(false);
    setError(null);
    setFields({});
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createNew && !picked) {
      setFields({ studentId: ["validation.studentRequired"] });
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/groups/${groupId}/members`, {
        method: "POST",
        body: {
          ...(createNew
            ? {
                newStudent: {
                  fullName: data.get("fullName"),
                  phone: String(data.get("phone") ?? "").trim() || null,
                },
              }
            : { studentId: picked?.id }),
          joinedAt: data.get("joinedAt"),
          customPrice: customPrice ? data.get("customPrice") : null,
          note: String(data.get("note") ?? "").trim() || null,
        },
      });
      onOpenChange(false);
      reset();
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && !e.fields ? e.message : null);
      if (e instanceof ApiError && e.fields?.studentId?.[0] === "validation.duplicate")
        setError("groups.members.alreadyIn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={tm("add")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      side="right"
      testId="add-member-dialog"
    >
      {canCreateStudent && (
        <div className="flex items-center gap-2">
          <Switch
            id="member-new"
            checked={createNew}
            onCheckedChange={(v) => {
              setCreateNew(v);
              setPicked(null);
            }}
          />
          <Label htmlFor="member-new">{tm("newStudent")}</Label>
        </div>
      )}
      {createNew ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="member-fullName">{t("staff.form.fullName")}</Label>
            <Input
              id="member-fullName"
              name="fullName"
              required
              aria-invalid={!!fields["newStudent.fullName"]}
            />
            <FieldError id="member-fullName-error" message={fields["newStudent.fullName"]?.[0]} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-phone">{t("staff.form.phone")}</Label>
            <Input id="member-phone" name="phone" type="tel" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="member-search">{tm("searchStudent")}</Label>
          <Input
            id="member-search"
            type="search"
            value={
              picked ? `${picked.fullName}${picked.phone ? ` · ${picked.phone}` : ""}` : search
            }
            onChange={(e) => {
              setPicked(null);
              setSearch(e.target.value);
            }}
            placeholder={tm("searchHint")}
            autoComplete="off"
          />
          {!picked && results.length > 0 && (
            <ul className="max-h-48 overflow-auto rounded-md border text-sm" role="listbox">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-secondary"
                    onClick={() => setPicked(r)}
                  >
                    <span>{r.fullName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.phone ?? ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <FieldError id="member-student-error" message={fields.studentId?.[0]} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="member-joined">{tm("joinDate")}</Label>
        <Input id="member-joined" name="joinedAt" type="date" defaultValue={todayIso()} required />
        <FieldError id="member-joined-error" message={fields.joinedAt?.[0]} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch id="member-custom" checked={customPrice} onCheckedChange={setCustomPrice} />
          <Label htmlFor="member-custom">{tm("customPriceToggle")}</Label>
        </div>
        {customPrice && (
          <>
            <Label htmlFor="member-price" className="sr-only">
              {tm("customPrice")}
            </Label>
            <Input
              id="member-price"
              name="customPrice"
              type="number"
              min={0}
              step="1000"
              placeholder={tm("customPrice")}
            />
            <FieldError id="member-price-error" message={fields.customPrice?.[0]} />
          </>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="member-note">{tm("note")}</Label>
        <Textarea id="member-note" name="note" rows={2} />
      </div>
    </FormDialog>
  );
}
