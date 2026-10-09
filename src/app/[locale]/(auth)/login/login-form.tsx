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
import { loginSchema, verifyCodeSchema, type LoginInput } from "@/lib/validation/auth";

type LoginResponse = { ok: true } | { ok: false; challenge: { id: string; expiresAt: string } };

const codeSchema = verifyCodeSchema.pick({ code: true });
type CodeInput = { code: string };

function useAfterSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  return () => {
    const next = searchParams.get("next");
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    router.replace(target);
    router.refresh();
  };
}

function messageFor(t: ReturnType<typeof useTranslations>, error: unknown): string {
  if (error instanceof ApiError) {
    const seconds = error.meta?.retryAfterSeconds;
    return t.has(error.message)
      ? t(error.message, { seconds: Number(seconds ?? 0) })
      : t("errors.internal");
  }
  return t("errors.internal");
}

export function LoginForm() {
  const t = useTranslations();
  const afterSignIn = useAfterSignIn();
  const [serverError, setServerError] = useState<string | null>(null);
  // Set once the password was right and a Telegram code is expected (A-124).
  const [challengeId, setChallengeId] = useState<string | null>(null);

  // No defaultValues on purpose: the fields take what the browser already holds
  // when the form attaches, so typing that started before hydration survives.
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    try {
      const result = await api<LoginResponse>("/auth/login", { method: "POST", body: values });
      if (!result.ok) {
        setChallengeId(result.challenge.id);
        return;
      }
      afterSignIn();
    } catch (error) {
      setServerError(messageFor(t, error));
    }
  }

  const { errors, isSubmitting } = form.formState;

  if (challengeId) {
    return (
      <CodeStep
        challengeId={challengeId}
        onStartOver={() => {
          setChallengeId(null);
          form.setValue("password", "");
        }}
      />
    );
  }

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
          defaultValue="+998"
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

/** The second step: the six-digit code from the person's Telegram chat. */
function CodeStep({ challengeId, onStartOver }: { challengeId: string; onStartOver: () => void }) {
  const t = useTranslations();
  const afterSignIn = useAfterSignIn();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<CodeInput>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: CodeInput) {
    setServerError(null);
    try {
      await api("/auth/verify-code", {
        method: "POST",
        body: { challengeId, code: values.code },
      });
      afterSignIn();
    } catch (error) {
      setServerError(messageFor(t, error));
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
      data-testid="code-step"
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("auth.codeTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.codeSubtitle")}</p>
      </div>
      {serverError && (
        <Alert variant="destructive" data-testid="code-error">
          {serverError}
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="code">{t("auth.code")}</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          aria-invalid={!!errors.code}
          aria-describedby={errors.code ? "code-error-text" : undefined}
          {...form.register("code")}
        />
        {errors.code && (
          <p id="code-error-text" className="text-sm text-destructive">
            {t(errors.code.message ?? "validation.required")}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("auth.signingIn") : t("auth.confirmCode")}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onStartOver}>
        {t("auth.startOver")}
      </Button>
    </form>
  );
}
