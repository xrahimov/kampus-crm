"use client";

import { Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PortalTelegramDto } from "@/server/services/telegram/student-telegram.service";

const POLL_MS = 4000;

/**
 * "Connect Telegram" on the student's page. The link opens the centre's bot
 * with the student's code; this card polls so the new chat shows up while the
 * student is still looking at the page.
 */
export function TelegramCard({ token, initial }: { token: string; initial: PortalTelegramDto }) {
  const t = useTranslations("portal.telegram");
  const [state, setState] = useState(initial);
  const [polling, setPolling] = useState(false);

  const reload = useCallback(async () => {
    const response = await fetch(`/api/v1/public/class/${encodeURIComponent(token)}/telegram`, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) setState((await response.json()) as PortalTelegramDto);
  }, [token]);

  // After the student taps the link, watch for the chat to appear for a while.
  useEffect(() => {
    if (!polling) return;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      void reload();
      if (ticks > 45) setPolling(false);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, reload]);

  async function disconnect(chatId: string) {
    await fetch(
      `/api/v1/public/class/${encodeURIComponent(token)}/telegram/${encodeURIComponent(chatId)}`,
      { method: "DELETE" },
    );
    await reload();
  }

  if (!state.link && state.chats.length === 0) return null;
  return (
    <Card data-testid="portal-telegram">
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.chats.length > 0 && (
          <ul className="divide-y text-sm">
            {state.chats.map((c) => (
              <li key={c.chatId} className="flex items-center justify-between gap-2 py-1.5">
                <span>{t("connected", { name: c.name ?? c.chatId })}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnect(c.chatId)}
                  aria-label={t("disconnect")}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {state.link ? (
          <Button asChild size="sm" variant={state.chats.length ? "outline" : "default"}>
            <a
              href={state.link}
              target="_blank"
              rel="noreferrer"
              onClick={() => setPolling(true)}
              data-testid="telegram-connect"
            >
              <Send /> {state.chats.length ? t("connectMore") : t("connect")}
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("notReady")}</p>
        )}
      </CardContent>
    </Card>
  );
}
