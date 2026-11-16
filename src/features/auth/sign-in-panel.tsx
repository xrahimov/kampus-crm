"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircle, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/components/ui/alert";
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
import { api, ApiError } from "@/lib/api-client";
import { verifyCodeSchema } from "@/lib/validation/auth";
import { passwordSchema } from "@/lib/validation/common";
import { signInPhoneSchema, type SignInDoor } from "@/lib/validation/sign-in";
import type { JoinState } from "@/server/services/sign-in/join-requests.service";

/*
 * The sign-in form of both doors (A-196): the staff page and the student
 * page. Phone and password by default; "Get a code in Telegram" for the first
 * sign-in, a forgotten password, or anyone who prefers it. A phone Kampus does
 * not know ends on the waiting list.
 */

type Side = "staff" | "student";
type PasswordResponse =
  { ok: true; to: Side } | { ok: false; challenge: { id: string; expiresAt: string } };
type CodeTicket = { id: string; expiresAt: string };
type VerifyResponse =
  { ok: true; to: Side; offerPassword: boolean } | { ok: false; join: JoinState };

export interface SignInBot {
  username: string | null;
  url: string | null;
}

const formSchema = z.object({ phone: signInPhoneSchema, password: passwordSchema });
type FormInput = z.infer<typeof formSchema>;
const codeSchema = verifyCodeSchema.pick({ code: true });
type CodeInput = { code: string };

const STUDENT_NEXT = /^\/(?:[a-z]{2}\/)?student(?:\/[A-Za-z0-9_/-]*)?$/;

function messageFor(t: ReturnType<typeof useTranslations>, error: unknown): string {
  if (error instanceof ApiError) {
    const seconds = error.meta?.retryAfterSeconds;
    return t.has(error.message)
      ? t(error.message, { seconds: Number(seconds ?? 0) })
      : t("errors.internal");
  }
  return t("errors.internal");
}

/** Where a finished sign-in leads: the page asked for, else the home of the side that opened. */
function useAfterSignIn() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  return (to: Side, offerPassword = false) => {
    const next = searchParams.get("next");
    let target: string;
    if (to === "student") {
      target = next && STUDENT_NEXT.test(next) ? next : `/${locale}/student`;
      if (offerPassword) {
        target = `/${locale}/student/set-password?next=${encodeURIComponent(target)}`;
      }
    } else {
      const page =
        next && next.startsWith("/") && !next.startsWith("//") && !STUDENT_NEXT.test(next)
          ? next
          : "/dashboard";
      target = offerPassword
        ? `/${locale}/set-password?next=${encodeURIComponent(page)}`
        : page.startsWith(`/${locale}/`)
          ? page
          : `/${locale}${page}`;
    }
    // A full load: the cookies that were just set decide what the next page shows.
    window.location.assign(target);
  };
}

function botName(bot: SignInBot, fallback: string): string {
  return bot.username ? `@${bot.username}` : fallback;
}

export function SignInPanel({
  door,
  code,
  bot,
  widgetUrl = null,
  widgetTestId = "login-telegram",
  returnedError = null,
  returnedErrorTestId = "login-telegram-error",
}: {
  door: SignInDoor;
  /** A bot can send codes on this address. */
  code: boolean;
  bot: SignInBot;
  /** The older sign-in on Telegram's own page, where it is set up. */
  widgetUrl?: string | null;
  widgetTestId?: string;
  /** A message key the server sent the browser back with. */
  returnedError?: string | null;
  returnedErrorTestId?: string;
}) {
  const t = useTranslations();
  const afterSignIn = useAfterSignIn();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // The password was right and a Telegram code is expected after it (A-124).
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{ id: string; phone: string } | null>(null);
  const [join, setJoin] = useState<{ join: JoinState; phone: string } | null>(null);

  // No defaultValues on purpose: the fields take what the browser already holds
  // when the form attaches, so typing that started before hydration survives.
  const form = useForm<FormInput>({ resolver: zodResolver(formSchema) });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: FormInput) {
    setServerError(null);
    try {
      const result = await api<PasswordResponse>("/auth/login", {
        method: "POST",
        body: { ...values, door },
      });
      if (!result.ok) {
        setChallengeId(result.challenge.id);
        return;
      }
      afterSignIn(result.to);
    } catch (error) {
      setServerError(messageFor(t, error));
    }
  }

  async function askForCode() {
    setServerError(null);
    form.clearErrors();
    const parsed = signInPhoneSchema.safeParse(form.getValues("phone") ?? "");
    if (!parsed.success) {
      form.setError("phone", { message: "validation.phone" });
      form.setFocus("phone");
      return;
    }
    setSending(true);
    try {
      const made = await api<CodeTicket>("/auth/code", {
        method: "POST",
        body: { phone: parsed.data, door },
      });
      setTicket({ id: made.id, phone: parsed.data });
    } catch (error) {
      setServerError(messageFor(t, error));
    } finally {
      setSending(false);
    }
  }

  if (join) {
    return (
      <JoinStep
        join={join.join}
        phone={join.phone}
        onChange={(next) => setJoin({ join: next, phone: join.phone })}
        onBack={() => {
          setJoin(null);
          setTicket(null);
        }}
      />
    );
  }

  if (ticket) {
    return (
      <PhoneCodeStep
        ticket={ticket}
        door={door}
        bot={bot}
        onSignedIn={afterSignIn}
        onJoin={(state) => setJoin({ join: state, phone: ticket.phone })}
        onNewTicket={(id) => setTicket({ id, phone: ticket.phone })}
        onStartOver={() => setTicket(null)}
      />
    );
  }

  if (challengeId) {
    return (
      <SecondStep
        challengeId={challengeId}
        onSignedIn={() => afterSignIn("staff")}
        onStartOver={() => {
          setChallengeId(null);
          form.setValue("password", "");
        }}
      />
    );
  }

  const returnedKey =
    returnedError && /^[A-Za-z]+$/.test(returnedError) ? `errors.${returnedError}` : null;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <Alert variant="destructive" data-testid="login-error">
          {serverError}
        </Alert>
      )}
      {!serverError && returnedKey && (
        <Alert variant="destructive" data-testid={returnedErrorTestId}>
          {t.has(returnedKey) ? t(returnedKey) : t("errors.staffTelegramFailed")}
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

      <Button type="submit" className="w-full" disabled={isSubmitting || sending}>
        {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
      </Button>

      {code && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("auth.orTelegram")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isSubmitting || sending}
            onClick={askForCode}
            data-testid="login-get-code"
          >
            <Send /> {sending ? t("auth.gettingCode") : t("auth.getCode")}
          </Button>
          <TelegramHowTo bot={bot} />
        </>
      )}
      {widgetUrl && (
        <p className="text-center text-xs text-muted-foreground">
          <a
            href={widgetUrl}
            className="underline underline-offset-4 hover:text-foreground"
            data-testid={widgetTestId}
          >
            {t("auth.widgetLink")}
          </a>
        </p>
      )}
    </form>
  );
}

/** The steps of a sign-in with Telegram, always on the page: first-timers need them most. */
function TelegramHowTo({ bot }: { bot: SignInBot }) {
  const t = useTranslations("auth");
  const name = botName(bot, t("theBot"));
  return (
    <div
      className="rounded-lg border bg-muted/40 px-4 py-3 text-sm"
      data-testid="login-telegram-how"
    >
      <p className="font-medium">{t("howTitle")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("howWhen")}</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground marker:font-medium marker:text-foreground">
        <li>{t("how1")}</li>
        <li>{t("how2", { bot: name })}</li>
        <li>{t("how3")}</li>
        <li>{t("how4")}</li>
      </ol>
      {bot.url && (
        <a
          href={bot.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          data-testid="login-open-bot"
        >
          <MessageCircle className="size-4" /> {t("openBot", { bot: name })}
        </a>
      )}
    </div>
  );
}

function CodeField({
  form,
  label,
}: {
  form: ReturnType<typeof useForm<CodeInput>>;
  label: string;
}) {
  const t = useTranslations();
  const { errors } = form.formState;
  return (
    <div className="space-y-2">
      <Label htmlFor="code">{label}</Label>
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
  );
}

/** The code the bot sent for this phone: it opens a session, or the waiting list. */
function PhoneCodeStep({
  ticket,
  door,
  bot,
  onSignedIn,
  onJoin,
  onNewTicket,
  onStartOver,
}: {
  ticket: { id: string; phone: string };
  door: SignInDoor;
  bot: SignInBot;
  onSignedIn: (to: Side, offerPassword: boolean) => void;
  onJoin: (join: JoinState) => void;
  onNewTicket: (id: string) => void;
  onStartOver: () => void;
}) {
  const t = useTranslations();
  const [serverError, setServerError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const form = useForm<CodeInput>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const { isSubmitting } = form.formState;
  const name = botName(bot, t("auth.theBot"));

  async function onSubmit(values: CodeInput) {
    setServerError(null);
    try {
      const result = await api<VerifyResponse>("/auth/code/verify", {
        method: "POST",
        body: { id: ticket.id, code: values.code, door },
      });
      if (result.ok) onSignedIn(result.to, result.offerPassword);
      else onJoin(result.join);
    } catch (error) {
      setServerError(messageFor(t, error));
    }
  }

  async function sendAgain() {
    setServerError(null);
    setResent(false);
    try {
      const made = await api<CodeTicket>("/auth/code", {
        method: "POST",
        body: { phone: ticket.phone, door },
      });
      onNewTicket(made.id);
      form.reset({ code: "" });
      setResent(true);
    } catch (error) {
      setServerError(messageFor(t, error));
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
      data-testid="phone-code-step"
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("auth.phoneCodeTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("auth.phoneCodeSubtitle", { phone: ticket.phone, bot: name })}
        </p>
      </div>
      {serverError && (
        <Alert variant="destructive" data-testid="code-error">
          {serverError}
        </Alert>
      )}
      {resent && <Alert data-testid="code-resent">{t("auth.codeResent")}</Alert>}
      <CodeField form={form} label={t("auth.code")} />
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("auth.signingIn") : t("auth.confirmCode")}
      </Button>
      <div
        className="rounded-lg border bg-muted/40 px-4 py-3 text-sm"
        data-testid="code-no-message"
      >
        <p className="font-medium">{t("auth.noMessageTitle")}</p>
        <p className="mt-1 text-muted-foreground">{t("auth.noMessage", { bot: name })}</p>
        {bot.url && (
          <a
            href={bot.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
            data-testid="code-open-bot"
          >
            <MessageCircle className="size-4" /> {t("auth.openBot", { bot: name })}
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={onStartOver}>
          {t("auth.startOver")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={sendAgain}
          data-testid="code-again"
        >
          {t("auth.codeAgain")}
        </Button>
      </div>
    </form>
  );
}

/** The second step after a password, for people who switched it on (A-124). */
function SecondStep({
  challengeId,
  onSignedIn,
  onStartOver,
}: {
  challengeId: string;
  onSignedIn: () => void;
  onStartOver: () => void;
}) {
  const t = useTranslations();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<CodeInput>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const { isSubmitting } = form.formState;

  async function onSubmit(values: CodeInput) {
    setServerError(null);
    try {
      await api("/auth/verify-code", {
        method: "POST",
        body: { challengeId, code: values.code },
      });
      onSignedIn();
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
      <CodeField form={form} label={t("auth.code")} />
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("auth.signingIn") : t("auth.confirmCode")}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onStartOver}>
        {t("auth.startOver")}
      </Button>
    </form>
  );
}

const joinSchema = z.object({
  fullName: z.string().trim().min(2, "validation.required").max(120, "validation.tooLong"),
  organizationId: z.string(),
  branchId: z.string(),
  note: z.string().trim().max(300, "validation.tooLong"),
});
type JoinInput = z.infer<typeof joinSchema>;

/** The waiting list: who the person is and where they belong, then the wait. */
function JoinStep({
  join,
  phone,
  onChange,
  onBack,
}: {
  join: JoinState;
  phone: string;
  onChange: (join: JoinState) => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const [serverError, setServerError] = useState<string | null>(null);
  const centres = join.state === "draft" ? join.centres : [];
  const form = useForm<JoinInput>({
    resolver: zodResolver(joinSchema),
    defaultValues: {
      fullName: join.state === "draft" ? join.fullName : "",
      organizationId: centres.length === 1 ? centres[0]!.id : "",
      branchId:
        centres.length === 1 && centres[0]!.branches.length === 1
          ? centres[0]!.branches[0]!.id
          : "",
      note: "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const organizationId = useWatch({ control: form.control, name: "organizationId" });
  const branchId = useWatch({ control: form.control, name: "branchId" });
  const centre = centres.find((c) => c.id === organizationId) ?? null;

  if (join.state !== "draft") {
    const declined = join.state === "declined";
    return (
      <div className="space-y-4" data-testid={declined ? "join-declined" : "join-sent"}>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t(declined ? "auth.join.declinedTitle" : "auth.join.sentTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(declined ? "auth.join.declined" : "auth.join.sent", {
              centre: join.centre ?? t("app.name"),
              phone,
            })}
          </p>
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={onBack}>
          {t("auth.join.back")}
        </Button>
      </div>
    );
  }

  async function onSubmit(values: JoinInput) {
    setServerError(null);
    if (join.state !== "draft") return;
    if (!values.organizationId) {
      form.setError("organizationId", { message: "validation.required" });
      return;
    }
    const chosen = centres.find((c) => c.id === values.organizationId);
    if (chosen && chosen.branches.length > 1 && !values.branchId) {
      form.setError("branchId", { message: "validation.required" });
      return;
    }
    try {
      const result = await api<{ join: JoinState }>("/auth/join", {
        method: "POST",
        body: {
          token: join.token,
          fullName: values.fullName,
          organizationId: values.organizationId,
          ...(values.branchId ? { branchId: values.branchId } : {}),
          note: values.note,
        },
      });
      onChange(result.join);
    } catch (error) {
      setServerError(messageFor(t, error));
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
      data-testid="join-step"
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("auth.join.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.join.intro", { phone })}</p>
      </div>
      {serverError && (
        <Alert variant="destructive" data-testid="join-error">
          {serverError}
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="join-name">{t("auth.join.name")}</Label>
        <Input
          id="join-name"
          autoComplete="name"
          aria-invalid={!!errors.fullName}
          {...form.register("fullName")}
        />
        {errors.fullName && (
          <p className="text-sm text-destructive">
            {t(errors.fullName.message ?? "validation.required")}
          </p>
        )}
      </div>
      {centres.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="join-centre">{t("auth.join.centre")}</Label>
          <Select
            value={organizationId}
            onValueChange={(value) => {
              form.setValue("organizationId", value, { shouldValidate: true });
              const next = centres.find((c) => c.id === value);
              form.setValue("branchId", next?.branches.length === 1 ? next.branches[0]!.id : "");
            }}
          >
            <SelectTrigger id="join-centre" aria-invalid={!!errors.organizationId}>
              <SelectValue placeholder={t("auth.join.choose")} />
            </SelectTrigger>
            <SelectContent>
              {centres.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.organizationId && (
            <p className="text-sm text-destructive">{t("validation.required")}</p>
          )}
        </div>
      )}
      {centre && centre.branches.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="join-branch">{t("auth.join.branch")}</Label>
          <Select
            value={branchId}
            onValueChange={(value) => form.setValue("branchId", value, { shouldValidate: true })}
          >
            <SelectTrigger id="join-branch" aria-invalid={!!errors.branchId}>
              <SelectValue placeholder={t("auth.join.choose")} />
            </SelectTrigger>
            <SelectContent>
              {centre.branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.branchId && (
            <p className="text-sm text-destructive">{t("validation.required")}</p>
          )}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="join-note">{t("auth.join.note")}</Label>
        <Input
          id="join-note"
          placeholder={t("auth.join.notePlaceholder")}
          {...form.register("note")}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("common.saving") : t("auth.join.send")}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        {t("auth.join.back")}
      </Button>
    </form>
  );
}
