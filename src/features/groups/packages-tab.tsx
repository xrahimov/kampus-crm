"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { FieldError } from "@/components/data/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { todayIso } from "@/features/staff/password";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { MembershipDto } from "@/server/services/groups/memberships.service";
import type {
  GroupPackagesDto,
  LessonPackageDto,
} from "@/server/services/students/packages.service";
import type { PaymentOptionsDto } from "@/server/services/students/payments.service";

/** PAKETLAR tab (A-178): the packages on offer, every member's credits and the sales. */
export function PackagesTab({
  groupId,
  data,
  members,
  paymentOptions,
  canManage,
  canSell,
}: {
  groupId: string;
  data: GroupPackagesDto;
  members: MembershipDto[];
  paymentOptions: PaymentOptionsDto;
  canManage: boolean;
  canSell: boolean;
}) {
  const t = useTranslations();
  const tp = useTranslations("packages");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<LessonPackageDto | "new" | null>(null);
  const [selling, setSelling] = useState<string | "any" | null>(null);
  const [deleting, setDeleting] = useState<LessonPackageDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  const activeOffers = data.packages.filter((p) => p.isActive);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{tp("title")}</h2>
          <div className="flex gap-2">
            {canSell && activeOffers.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelling("any")}
                data-testid="sell-package"
              >
                {tp("sell")}
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={() => setEditing("new")} data-testid="add-package">
                <Plus /> {tp("add")}
              </Button>
            )}
          </div>
        </div>
        {data.packages.length === 0 ? (
          <EmptyState title={tp("empty")} hint={tp("emptyHint")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tp("columns.name")}</TableHead>
                <TableHead className="text-right">{tp("columns.lessons")}</TableHead>
                <TableHead className="text-right">{tp("columns.price")}</TableHead>
                <TableHead className="text-right">{tp("columns.perLesson")}</TableHead>
                <TableHead className="text-right">{tp("columns.sold")}</TableHead>
                <TableHead>{tp("columns.status")}</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.packages.map((p) => (
                <TableRow key={p.id} data-testid="package-row">
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.lessons}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {money(p.price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {money(Math.round(p.price / p.lessons))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.sold}</TableCell>
                  <TableCell>
                    <Badge variant={p.isActive ? "success" : "muted"}>
                      {p.isActive ? tp("active") : tp("inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {canManage && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                          {t("common.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleting(p)}
                        >
                          {p.sold > 0 ? tp("deactivate") : t("common.delete")}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{tp("credits.title")}</h2>
        {data.credits.length === 0 ? (
          <EmptyState title={tp("credits.empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tp("credits.student")}</TableHead>
                <TableHead className="text-right">{tp("credits.purchased")}</TableHead>
                <TableHead className="text-right">{tp("credits.used")}</TableHead>
                <TableHead className="text-right">{tp("credits.left")}</TableHead>
                <TableHead>{tp("credits.lastPurchase")}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.credits.map((c) => (
                <TableRow key={c.membershipId} data-testid="credits-row">
                  <TableCell className="font-medium">{c.studentName}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.purchased}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.used}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={c.left <= 0 ? "destructive" : c.left <= 2 ? "secondary" : "success"}
                      className="tabular-nums"
                      data-testid="credits-left"
                    >
                      {c.left}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.lastPurchaseAt ? date(c.lastPurchaseAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {canSell &&
                      activeOffers.length > 0 &&
                      !["ARCHIVED", "GRADUATED"].includes(c.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelling(c.membershipId)}
                        >
                          {tp("sell")}
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {data.purchases.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{tp("purchases.title")}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tp("purchases.date")}</TableHead>
                <TableHead>{tp("purchases.student")}</TableHead>
                <TableHead>{tp("purchases.package")}</TableHead>
                <TableHead className="text-right">{tp("purchases.used")}</TableHead>
                <TableHead className="text-right">{tp("purchases.price")}</TableHead>
                <TableHead>{tp("purchases.note")}</TableHead>
                <TableHead>{tp("purchases.by")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.purchases.map((p) => (
                <TableRow key={p.id} data-testid="purchase-row">
                  <TableCell className="whitespace-nowrap">{date(p.purchasedAt)}</TableCell>
                  <TableCell className="font-medium">{p.studentName}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.used} / {p.lessons}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {money(p.price)}
                  </TableCell>
                  <TableCell className="max-w-48 truncate" title={p.note ?? undefined}>
                    {p.note ?? "—"}
                  </TableCell>
                  <TableCell>{p.createdByName ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <PackageDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        groupId={groupId}
        pkg={editing === "new" ? null : editing}
        onSaved={refresh}
      />
      <SellPackageDialog
        open={selling !== null}
        onOpenChange={(open) => !open && setSelling(null)}
        groupId={groupId}
        packages={activeOffers}
        members={members}
        initialMembershipId={selling && selling !== "any" ? selling : ""}
        methods={paymentOptions.methods}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting && deleting.sold > 0 ? tp("deactivateTitle") : tp("deleteTitle")}
        description={
          deleting && deleting.sold > 0
            ? tp("deactivateText", { name: deleting.name })
            : tp("deleteText", { name: deleting?.name ?? "" })
        }
        confirmLabel={deleting && deleting.sold > 0 ? tp("deactivate") : t("common.delete")}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/groups/${groupId}/packages/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}

function PackageDialog({
  open,
  onOpenChange,
  groupId,
  pkg,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  pkg: LessonPackageDto | null;
  onSaved: () => void;
}) {
  const tp = useTranslations("packages");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setActive(pkg?.isActive ?? true);
      setError(null);
      setFields({});
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const body = {
        name: String(data.get("name") ?? ""),
        lessons: data.get("lessons"),
        price: data.get("price"),
        isActive: active,
      };
      if (pkg) {
        await api(`/groups/${groupId}/packages/${pkg.id}`, { method: "PATCH", body });
      } else {
        await api(`/groups/${groupId}/packages`, { method: "POST", body });
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && !e.fields ? e.message : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={pkg ? tp("edit") : tp("add")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="package-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="package-name">{tp("form.name")}</Label>
        <Input
          id="package-name"
          name="name"
          defaultValue={pkg?.name ?? ""}
          required
          maxLength={120}
          aria-invalid={!!fields.name}
        />
        <FieldError id="package-name-error" message={fields.name?.[0]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="package-lessons">{tp("form.lessons")}</Label>
          <Input
            id="package-lessons"
            name="lessons"
            type="number"
            min={1}
            max={500}
            defaultValue={pkg?.lessons ?? 8}
            required
            aria-invalid={!!fields.lessons}
          />
          <FieldError id="package-lessons-error" message={fields.lessons?.[0]} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="package-price">{tp("form.price")}</Label>
          <Input
            id="package-price"
            name="price"
            type="number"
            min={0}
            step="1000"
            defaultValue={pkg?.price ?? ""}
            required
            aria-invalid={!!fields.price}
          />
          <FieldError id="package-price-error" message={fields.price?.[0]} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="package-active">{tp("form.active")}</Label>
        <Switch id="package-active" checked={active} onCheckedChange={setActive} />
      </div>
    </FormDialog>
  );
}

function SellPackageDialog({
  open,
  onOpenChange,
  groupId,
  packages,
  members,
  initialMembershipId,
  methods,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  packages: LessonPackageDto[];
  members: MembershipDto[];
  initialMembershipId: string;
  methods: PaymentOptionsDto["methods"];
  onSaved: () => void;
}) {
  const tp = useTranslations("packages");
  const money = useMoneyFormat();
  const [membershipId, setMembershipId] = useState(initialMembershipId);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const eligible = members.filter((m) => !["ARCHIVED", "GRADUATED"].includes(m.status));
  const chosen = packages.find((p) => p.id === packageId);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMembershipId(initialMembershipId);
      setPackageId(packages[0]?.id ?? "");
      setMethodId(methods[0]?.id ?? "");
      setError(null);
      setFields({});
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membershipId) {
      setFields({ membershipId: ["validation.studentRequired"] });
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/groups/${groupId}/packages/sell`, {
        method: "POST",
        body: {
          membershipId,
          packageId,
          paymentMethodId: methodId,
          paidAt: data.get("paidAt"),
          comment: String(data.get("comment") ?? "").trim() || null,
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && !e.fields ? e.message : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tp("sell")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="sell-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="sell-student">{tp("sellForm.student")}</Label>
        <Select value={membershipId} onValueChange={setMembershipId}>
          <SelectTrigger id="sell-student" aria-invalid={!!fields.membershipId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {eligible.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="sell-student-error" message={fields.membershipId?.[0]} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sell-package">{tp("sellForm.package")}</Label>
        <Select value={packageId} onValueChange={setPackageId}>
          <SelectTrigger id="sell-package" aria-invalid={!!fields.packageId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {packages.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {tp("sellForm.packageOption", {
                  name: p.name,
                  lessons: p.lessons,
                  price: money(p.price),
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {chosen && (
          <p className="text-xs text-muted-foreground">
            {tp("sellForm.summary", { lessons: chosen.lessons, price: money(chosen.price) })}
          </p>
        )}
        <FieldError id="sell-package-error" message={fields.packageId?.[0]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sell-method">{tp("sellForm.method")}</Label>
          <Select value={methodId} onValueChange={setMethodId}>
            <SelectTrigger id="sell-method" aria-invalid={!!fields.paymentMethodId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {methods.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="sell-method-error" message={fields.paymentMethodId?.[0]} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sell-date">{tp("sellForm.paidAt")}</Label>
          <Input
            id="sell-date"
            name="paidAt"
            type="date"
            defaultValue={todayIso()}
            required
            aria-invalid={!!fields.paidAt}
          />
          <FieldError id="sell-date-error" message={fields.paidAt?.[0]} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sell-comment">{tp("sellForm.comment")}</Label>
        <Textarea id="sell-comment" name="comment" rows={2} />
      </div>
    </FormDialog>
  );
}
