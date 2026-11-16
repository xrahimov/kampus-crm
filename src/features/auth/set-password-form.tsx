"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { passwordSchema } from "@/lib/validation/common";

const schema = z
  .object({
    currentPassword: z.string().max(128),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "validation.passwordMatch",
    path: ["confirm"],
  });
type FormInput = z.infer<typeof schema>;

/**
 * A password of one's own (A-196), for staff and for students and parents.
 * After a sign-in with a Telegram code nothing else is asked; the current
 * password is asked for only where the caller says so. With `next` the form is
 * the page offered right after the first sign-in: saving, or "Not now", goes on.
 */
export function SetPasswordForm({
  endpoint,
  next = null,
  askCurrent = false,
  hadPassword = false,
}: {
  /** "/auth/set-password" for staff, "/student-auth/password" for students and parents. */
  endpoint: string;
  next?: string | null;
  askCurrent?: boolean;
  /** The person already has a password: the wording says "change", not "choose". */
  hadPassword?: boolean;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: FormInput) {
    setError(null);
    setSaved(false);
    if (askCurrent && !values.currentPassword) {
      form.setError("currentPassword", { message: "validation.required" });
      return;
    }
    try {
      await api(endpoint, {
        method: "POST",
        body: {
          newPassword: values.newPassword,
          ...(askCurrent ? { currentPassword: values.currentPassword } : {}),
        },
      });
      form.reset();
      if (next) {
        window.location.assign(next);
        return;
      }
      setSaved(true);
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
      data-testid="set-password-form"
    >
      {error && (
        <Alert variant="destructive" data-testid="set-password-error">
          {t.has(error) ? t(error) : t("errors.internal")}
        </Alert>
      )}
      {saved && (
        <Alert data-testid="set-password-saved">
          {t(hadPassword ? "auth.passwordSaved" : "auth.passwordChosen")}
        </Alert>
      )}
      {askCurrent && (
        <div className="space-y-2">
          <Label htmlFor="set-current-password">{t("auth.currentPassword")}</Label>
          <Input
            id="set-current-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            {...form.register("currentPassword")}
          />
          <FieldError id="set-current-password-error" message={errors.currentPassword?.message} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="set-new-password">{t("auth.newPassword")}</Label>
        <Input
          id="set-new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          aria-describedby="set-new-password-hint"
          {...form.register("newPassword")}
        />
        <p id="set-new-password-hint" className="text-xs text-muted-foreground">
          {t("auth.passwordHint")}
        </p>
        <FieldError id="set-new-password-error" message={errors.newPassword?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="set-confirm-password">{t("auth.confirmPassword")}</Label>
        <Input
          id="set-confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
          {...form.register("confirm")}
        />
        <FieldError id="set-confirm-password-error" message={errors.confirm?.message} />
      </div>
      <Button type="submit" className={next ? "w-full" : undefined} disabled={isSubmitting}>
        {isSubmitting ? t("common.saving") : t("auth.savePassword")}
      </Button>
      {next && (
        <Button asChild variant="ghost" className="w-full">
          <a href={next} data-testid="set-password-later">
            {t("auth.setPasswordLater")}
          </a>
        </Button>
      )}
    </form>
  );
}
