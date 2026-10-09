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
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { MembershipDto } from "@/server/services/groups/memberships.service";
import type { DiscountDto } from "@/server/services/students/discounts.service";

/** EXP §5 CHEGIRMALAR tab (A-10): a lower monthly price for the next N months. */
export function DiscountsTab({
  groupId,
  discounts,
  members,
  coursePrice,
  canGive,
}: {
  groupId: string;
  discounts: DiscountDto[];
  members: MembershipDto[];
  coursePrice: number;
  canGive: boolean;
}) {
  const t = useTranslations();
  const td = useTranslations("discounts");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [giving, setGiving] = useState(false);
  const [deleting, setDeleting] = useState<DiscountDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{td("title")}</h2>
        {canGive && (
          <Button size="sm" onClick={() => setGiving(true)} data-testid="give-discount">
            <Plus /> {td("give")}
          </Button>
        )}
      </div>
      {discounts.length === 0 ? (
        <EmptyState title={td("empty")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{td("columns.student")}</TableHead>
              <TableHead className="text-right">{td("columns.price")}</TableHead>
              <TableHead className="text-right">{td("columns.amount")}</TableHead>
              <TableHead className="text-right">{td("columns.months")}</TableHead>
              <TableHead className="text-right">{td("columns.remaining")}</TableHead>
              <TableHead>{td("columns.givenAt")}</TableHead>
              <TableHead>{td("columns.comment")}</TableHead>
              <TableHead>{td("columns.givenBy")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {discounts.map((d) => (
              <TableRow key={d.id} data-testid="discount-row">
                <TableCell className="font-medium">
                  {d.studentName}
                  {d.familyId && (
                    <Badge variant="outline" className="ml-1">
                      {td("family")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {money(d.discountedPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {money(d.amount)} ({d.percent}%)
                </TableCell>
                <TableCell className="text-right tabular-nums">{d.months}</TableCell>
                <TableCell className="text-right tabular-nums">{d.remainingMonths}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {fmt(parseDateOnly(d.givenAt), { dateStyle: "medium" })}
                </TableCell>
                <TableCell className="max-w-48 truncate" title={d.comment ?? undefined}>
                  {d.comment ?? "—"}
                </TableCell>
                <TableCell>{d.createdByName ?? "—"}</TableCell>
                <TableCell>
                  {canGive && d.remainingMonths > 0 && !d.familyId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleting(d)}
                    >
                      {t("common.delete")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <GiveDiscountDialog
        open={giving}
        onOpenChange={setGiving}
        groupId={groupId}
        members={members}
        coursePrice={coursePrice}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={td("deleteTitle")}
        description={td("deleteText", { name: deleting?.studentName ?? "" })}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/discounts/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}

function GiveDiscountDialog({
  open,
  onOpenChange,
  groupId,
  members,
  coursePrice,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  members: MembershipDto[];
  coursePrice: number;
  onSaved: () => void;
}) {
  const td = useTranslations("discounts");
  const money = useMoneyFormat();
  const [membershipId, setMembershipId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const eligible = members.filter((m) => !["ARCHIVED", "GRADUATED"].includes(m.status));
  const chosen = eligible.find((m) => m.id === membershipId);
  const base = chosen?.customPrice ?? coursePrice;

  // Reset the form each time the dialog opens (state adjusted during render, as React advises).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMembershipId("");
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
      await api(`/groups/${groupId}/discounts`, {
        method: "POST",
        body: {
          membershipId,
          discountedPrice: data.get("discountedPrice"),
          months: data.get("months"),
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
      title={td("give")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="discount-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="discount-student">{td("form.student")}</Label>
        <Select value={membershipId} onValueChange={setMembershipId}>
          <SelectTrigger id="discount-student" aria-invalid={!!fields.membershipId}>
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
        <FieldError id="discount-student-error" message={fields.membershipId?.[0]} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="discount-price">{td("form.price")}</Label>
        <Input
          id="discount-price"
          name="discountedPrice"
          type="number"
          min={0}
          step="1000"
          required
          aria-invalid={!!fields.discountedPrice}
        />
        <p className="text-xs text-muted-foreground">
          {td("form.basePrice", { price: money(base) })}
        </p>
        <FieldError id="discount-price-error" message={fields.discountedPrice?.[0]} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="discount-months">{td("form.months")}</Label>
        <Input
          id="discount-months"
          name="months"
          type="number"
          min={1}
          max={36}
          defaultValue={1}
          required
          aria-invalid={!!fields.months}
        />
        <FieldError id="discount-months-error" message={fields.months?.[0]} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="discount-comment">{td("form.comment")}</Label>
        <Textarea id="discount-comment" name="comment" rows={2} />
      </div>
    </FormDialog>
  );
}
