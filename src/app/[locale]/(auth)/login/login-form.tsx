"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "+998", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    try {
      await api("/auth/login", { method: "POST", body: values });
      const next = searchParams.get("next");
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      router.replace(target);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        const seconds = error.meta?.retryAfterSeconds;
        setServerError(
          t.has(error.message)
            ? t(error.message, { seconds: Number(seconds ?? 0) })
            : t("errors.internal"),
        );
      } else {
        setServerError(t("errors.internal"));
      }
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <Alert variant="destructive" data-testid="login-error">
          {serverError}
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="phone">{t("auth.phone")}</Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="username"
          inputMode="tel"
          placeholder={t("auth.phonePlaceholder")}
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? "phone-error" : undefined}
          {...form.register("phone")}
        />
        {errors.phone && (
          <p id="phone-error" className="text-sm text-destructive">
            {t(errors.phone.message ?? "validation.required")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...form.register("password")}
        />
        {errors.password && (
          <p id="password-error" className="text-sm text-destructive">
            {t(errors.password.message ?? "validation.required")}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
