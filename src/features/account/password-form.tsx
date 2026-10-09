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
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { changePasswordSchema } from "@/lib/validation/auth";

const formSchema = changePasswordSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, {
    message: "validation.passwordMatch",
    path: ["confirm"],
  });
type FormInput = z.infer<typeof formSchema>;

/**
 * Current password, new password twice (A-124). On the forced page the person
 * goes on to the app afterwards; on My account the form just says it is done.
 */
export function PasswordForm({ forced = false }: { forced?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: FormInput) {
    setError(null);
    setSaved(false);
    try {
      await api("/auth/password", {
        method: "POST",
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      });
      form.reset();
      if (forced) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
      data-testid="password-form"
    >
      {error && (
        <Alert variant="destructive" data-testid="password-error">
          {t.has(error) ? t(error) : t("errors.internal")}
        </Alert>
      )}
      {saved && <Alert data-testid="password-saved">{t("auth.passwordSaved")}</Alert>}
      <div className="space-y-2">
        <Label htmlFor="current-password">{t("auth.currentPassword")}</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          {...form.register("currentPassword")}
        />
        <FieldError id="current-password-error" message={errors.currentPassword?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          aria-describedby="new-password-hint"
          {...form.register("newPassword")}
        />
        <p id="new-password-hint" className="text-xs text-muted-foreground">
          {t("auth.passwordHint")}
        </p>
        <FieldError id="new-password-error" message={errors.newPassword?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
          {...form.register("confirm")}
        />
        <FieldError id="confirm-password-error" message={errors.confirm?.message} />
      </div>
      <Button type="submit" className={forced ? "w-full" : undefined} disabled={isSubmitting}>
        {isSubmitting ? t("common.saving") : t("auth.savePassword")}
      </Button>
    </form>
  );
}
