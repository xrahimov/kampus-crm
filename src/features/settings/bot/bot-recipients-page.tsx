"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { botRecipientSchema } from "@/lib/validation/integrations";
import type { BotRecipientDto } from "@/server/services/integrations/bot-recipients.service";

import { FormDialog } from "../shared/form-dialog";
import { RowActions } from "../shared/row-actions";

type Input = z.input<typeof botRecipientSchema>;
type Output = z.output<typeof botRecipientSchema>;

/** Settings → "Bot xabarnoma" (EXP §8): Xodim, Mahsus ID, Filiallar, Amallar. */
export function BotRecipientsPage({
  recipients,
  staff,
  branches,
}: {
  recipients: BotRecipientDto[];
  staff: Array<{ id: string; fullName: string; phone: string }>;
  branches: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("bot");
  const tc = useTranslations("common");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<BotRecipientDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(botRecipientSchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: { userId: "", chatId: "", branchIds: [] },
  });
  const taken = new Set(recipients.map((r) => r.userId));
  const candidates = staff.filter((s) => !taken.has(s.id));

  useEffect(() => {
    if (open) form.reset({ userId: candidates[0]?.id ?? "", chatId: "", branchIds: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      await api("/bot-recipients", { method: "POST", body: values });
      setOpen(false);
      refresh();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          disabled={candidates.length === 0}
          data-testid="add-recipient"
        >
          <Plus /> {t("add")}
        </Button>
      </CardHeader>
      <CardContent>
        {recipients.length === 0 ? (
          <EmptyState title={t("empty")} hint={t("emptyHint")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.staff")}</TableHead>
                <TableHead>{t("columns.chatId")}</TableHead>
                <TableHead>{t("columns.branches")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => (
                <TableRow key={r.id} data-testid="recipient-row">
                  <TableCell>
                    <div className="font-medium">{r.fullName}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">{r.phone}</div>
                  </TableCell>
                  <TableCell className="tabular-nums">{r.chatId}</TableCell>
                  <TableCell>
                    {r.branchNames.length === 0 ? t("allBranches") : r.branchNames.join(", ")}
                  </TableCell>
                  <TableCell>
                    <RowActions name={r.fullName} onDelete={() => setDeleting(r)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <FormDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setError(null);
          setOpen(next);
        }}
        title={t("add")}
        description={t("chatIdHint")}
        onSubmit={form.handleSubmit(onSubmit)}
        submitting={isSubmitting}
        error={error}
        testId="recipient-dialog"
      >
        <div className="space-y-2">
          <Label htmlFor="recipient-user">{t("columns.staff")}</Label>
          <Controller
            control={form.control}
            name="userId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="recipient-user" aria-invalid={!!errors.userId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName} · {s.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id="recipient-user-error" message={errors.userId?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recipient-chat">{t("columns.chatId")}</Label>
          <Input
            id="recipient-chat"
            inputMode="numeric"
            aria-invalid={!!errors.chatId}
            {...form.register("chatId")}
          />
          <FieldError id="recipient-chat-error" message={errors.chatId?.message} />
        </div>
        <div className="space-y-2">
          <Label>{t("columns.branches")}</Label>
          <p className="text-xs text-muted-foreground">{t("branchesHint")}</p>
          <Controller
            control={form.control}
            name="branchIds"
            render={({ field }) => (
              <div className="flex flex-wrap gap-3">
                {branches.map((b) => {
                  const selected = (field.value ?? []).includes(b.id);
                  return (
                    <label key={b.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(v) =>
                          field.onChange(
                            v
                              ? [...(field.value ?? []), b.id]
                              : (field.value ?? []).filter((x) => x !== b.id),
                          )
                        }
                      />
                      {b.name}
                    </label>
                  );
                })}
              </div>
            )}
          />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title={t("remove")}
        description={deleting?.fullName ?? ""}
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (deleting) await api(`/bot-recipients/${deleting.id}`, { method: "DELETE" });
          setDeleting(null);
          refresh();
        }}
      />
    </Card>
  );
}
