"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import type { AccountDto, SessionDto } from "@/server/services/account.service";

import { PasswordForm } from "./password-form";

/** "My account" (A-124): password, the Telegram sign-in code and the signed-in devices. */
export function AccountPage({
  account: initial,
  sessions,
}: {
  account: AccountDto;
  sessions: SessionDto[];
}) {
  const t = useTranslations();
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [account, setAccount] = useState(initial);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState<number | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  const others = sessions.filter((s) => !s.current);

  async function toggleCode(on: boolean) {
    setCodeError(null);
    try {
      const next = await api<AccountDto>("/auth/account", {
        method: "PATCH",
        body: { signInCode: on ? "TELEGRAM" : "OFF" },
      });
      setAccount(next);
    } catch (e) {
      const key =
        e instanceof ApiError ? (e.fields?.signInCode?.[0] ?? e.message) : "errors.internal";
      setCodeError(t.has(key) ? t(key) : t("errors.internal"));
    }
  }

  async function signOutOthers() {
    const { revoked } = await api<{ revoked: number }>("/auth/sessions", { method: "DELETE" });
    setSignedOut(revoked);
    refresh();
  }

  async function signOutOne(id: string) {
    await api(`/auth/sessions/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="account-title">
          {t("account.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("account.description")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("account.password.title")}</CardTitle>
            <CardDescription>
              {account.passwordChangedAt
                ? t("account.password.changed", {
                    date: fmt(new Date(account.passwordChangedAt), { dateStyle: "medium" }),
                  })
                : t("account.password.never")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("account.signInCode.title")}</CardTitle>
            <CardDescription>{t("account.signInCode.hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                id="sign-in-code"
                checked={account.signInCode === "TELEGRAM"}
                disabled={!account.telegramLinked}
                onCheckedChange={toggleCode}
                data-testid="sign-in-code"
              />
              <Label htmlFor="sign-in-code">{t("account.signInCode.label")}</Label>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="sign-in-code-state">
              {account.signInCode === "TELEGRAM"
                ? t("account.signInCode.on")
                : t("account.signInCode.off")}
            </p>
            {!account.telegramLinked && <Alert>{t("account.signInCode.needsTelegram")}</Alert>}
            {codeError && <Alert variant="destructive">{codeError}</Alert>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t("account.sessions.title")}</CardTitle>
            <CardDescription>{t("account.sessions.hint")}</CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={signOutOthers}
            disabled={others.length === 0}
            data-testid="sign-out-others"
          >
            {t("account.sessions.signOutOthers")}
          </Button>
        </CardHeader>
        <CardContent>
          {signedOut !== null && (
            <p className="mb-3 text-sm text-muted-foreground" data-testid="signed-out-others">
              {t("account.sessions.signedOutOthers", { count: signedOut })}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("account.sessions.device")}</TableHead>
                <TableHead>{t("account.sessions.address")}</TableHead>
                <TableHead>{t("account.sessions.signedIn")}</TableHead>
                <TableHead>{t("account.sessions.lastSeen")}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id} data-testid="session-row">
                  <TableCell className="font-medium">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {s.device}
                      {s.current && (
                        <Badge variant="success" data-testid="session-current">
                          {t("account.sessions.current")}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{s.ip ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {fmt(new Date(s.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {fmt(new Date(s.lastSeenAt), { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="text-right">
                    {!s.current && (
                      <Button variant="ghost" size="sm" onClick={() => signOutOne(s.id)}>
                        {t("account.sessions.signOut")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
