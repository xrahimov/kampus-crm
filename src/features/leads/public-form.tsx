"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { publicLeadSchema } from "@/lib/validation/leads";

type Input = z.input<typeof publicLeadSchema>;
type Output = z.output<typeof publicLeadSchema>;

/**
 * The visitor side of a lead form: name, phone, comment (A-69). `inviteCode` is
 * the `?ref=` of a student's link (A-120); it travels along, unseen.
 */
export function PublicLeadForm({
  slug,
  inviteCode,
  defaultComment = null,
}: {
  slug: string;
  inviteCode: string | null;
  /** Pre-filled comment, e.g. the course picked on the centre's page (A-121). */
  defaultComment?: string | null;
}) {
  const t = useTranslations();
  const tp = useTranslations("leads.publicForm");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(publicLeadSchema),
    defaultValues: { fullName: "", phone: "+998", comment: defaultComment ?? "", ref: inviteCode },
  });

  async function onSubmit(values: Output) {
    setError(null);
    try {
      const response = await fetch(`/api/v1/public/lead-forms/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code: string; message: string; fields?: Record<string, string[]> };
        } | null;
        throw new ApiError(
          response.status,
          body?.error ?? { code: "INTERNAL", message: "errors.internal" },
        );
      }
      setDone(true);
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  if (done) {
    return (
      <Alert data-testid="public-form-done">
        <p className="font-medium">{tp("thanksTitle")}</p>
        <p className="text-sm">{tp("thanksText")}</p>
      </Alert>
    );
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && (
        <Alert variant="destructive">{t.has(error) ? t(error) : t("errors.internal")}</Alert>
      )}
      {inviteCode && (
        <p className="text-muted-foreground text-sm" data-testid="public-form-ref">
          {tp("refHint")}
        </p>
      )}
      <input type="hidden" {...form.register("ref")} />
      <div className="space-y-2">
        <Label htmlFor="pf-name">{tp("fullName")}</Label>
        <Input id="pf-name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        <FieldError id="pf-name-error" message={errors.fullName?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pf-phone">{tp("phone")}</Label>
        <Input
          id="pf-phone"
          inputMode="tel"
          aria-invalid={!!errors.phone}
          {...form.register("phone")}
        />
        <FieldError id="pf-phone-error" message={errors.phone?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pf-comment">{tp("comment")}</Label>
        <Textarea id="pf-comment" rows={3} {...form.register("comment")} />
        <FieldError id="pf-comment-error" message={errors.comment?.message} />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("common.saving") : tp("submit")}
      </Button>
    </form>
  );
}
