"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedGroup, SegmentedItem } from "@/components/ui/radio-group";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { useDateFormat } from "@/lib/use-date-format";
import { reviewSignInSchema, type ReviewSignInKind } from "@/lib/validation/settings";
import type { ReviewSignInDto } from "@/server/services/settings/review-sign-ins.service";

import { FormDialog } from "../shared/form-dialog";

type Form = z.input<typeof reviewSignInSchema>;

/**
 * Sign-ins for app store reviewers (A-272): Apple and Google sign in to the app
 * before they publish it, and their reviewers cannot get a Telegram code. The
 * site owner gives one demo teacher and one demo student a password that works
 * by itself, and takes it away again when the review is over.
 */
export function ReviewSignIns({
  initial,
  onChanged,
}: {
  initial: ReviewSignInDto[];
  onChanged: () => void;
}) {
  const t = useTranslations("settings.organizations.review");
  const te = useTranslations();
  const fmt = useDateFormat();
  // The page reads the list again after every change; this card keeps no copy of its own.
  const rows = initial;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const form = useForm<Form>({
    resolver: zodResolver(reviewSignInSchema),
    defaultValues: { kind: "STAFF", phone: "+998", password: "" },
  });
  const errors = form.formState.errors;
  const kind = useWatch({ control: form.control, name: "kind" });

  function openForm() {
    setError(null);
    form.reset({ kind: "STAFF", phone: "+998", password: "" });
    setOpen(true);
  }

  async function onSubmit(values: Form) {
    setError(null);
    try {
      await api<ReviewSignInDto>("/system/review-sign-ins", { method: "POST", body: values });
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  async function remove(row: ReviewSignInDto) {
    const key = `${row.kind}:${row.id}`;
    setRemoving(key);
    setRemoveError(null);
    try {
      await api("/system/review-sign-ins/remove", {
        method: "POST",
        body: { kind: row.kind, id: row.id },
      });
      onChanged();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "errors.internal");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card className="space-y-3 p-4" data-testid="review-sign-ins">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h3 className="font-semibold">{t("title")}</h3>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button variant="outline" onClick={openForm} data-testid="review-sign-in-add">
          <Plus /> {t("add")}
        </Button>
      </div>
      {removeError && (
        <Alert variant="destructive">
          {te.has(removeError) ? te(removeError) : te("errors.internal")}
        </Alert>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li
              key={`${row.kind}:${row.id}`}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
              data-testid="review-sign-in-row"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {row.fullName}
                  <Badge variant="secondary">{t(`kinds.${row.kind}`)}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("phoneSince", {
                    phone: row.phone,
                    date: fmt(new Date(row.since), { dateStyle: "medium" }),
                  })}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={removing === `${row.kind}:${row.id}`}
                onClick={() => remove(row)}
                data-testid="review-sign-in-remove"
              >
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t("add")}
        description={t("addDescription")}
        onSubmit={form.handleSubmit(onSubmit)}
        submitting={form.formState.isSubmitting}
        error={error}
        testId="review-sign-in-dialog"
      >
        <div className="space-y-2">
          <Label>{t("kind")}</Label>
          <SegmentedGroup
            value={kind}
            onValueChange={(value) => form.setValue("kind", value as ReviewSignInKind)}
          >
            <SegmentedItem value="STAFF">{t("kinds.STAFF")}</SegmentedItem>
            <SegmentedItem value="STUDENT">{t("kinds.STUDENT")}</SegmentedItem>
          </SegmentedGroup>
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-phone">{t("phone")}</Label>
          <Input
            id="review-phone"
            inputMode="tel"
            aria-invalid={!!errors.phone}
            {...form.register("phone")}
          />
          <p className="text-sm text-muted-foreground">{t(`phoneHint.${kind}`)}</p>
          <FieldError id="review-phone-error" message={errors.phone?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-password">{t("password")}</Label>
          <Input
            id="review-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          <p className="text-sm text-muted-foreground">{t("passwordHint")}</p>
          <FieldError id="review-password-error" message={errors.password?.message} />
        </div>
      </FormDialog>
    </Card>
  );
}
