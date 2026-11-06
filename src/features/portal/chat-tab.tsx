"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { ChatThread } from "@/features/shared/chat-thread";
import { ApiError, type ApiErrorBody } from "@/lib/api-client";
import type {
  ChatMessageDto,
  GroupChatDto,
  PortalChatDto,
} from "@/server/services/chat/group-chat.service";

async function portalFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/public/class/${encodeURIComponent(token)}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error ?? { code: "INTERNAL", message: "errors.internal" },
    );
  }
  return (await response.json()) as T;
}

/** The student's side of the group chat (A-170), with the teachers named above it. */
export function PortalChatTab({
  token,
  initial,
  telegramLinked,
}: {
  token: string;
  initial: PortalChatDto;
  telegramLinked: boolean;
}) {
  const t = useTranslations("portal.chat");
  const load = useCallback(
    (after: string | null) =>
      portalFetch<GroupChatDto>(token, `/chat${after ? `?after=${after}` : ""}`),
    [token],
  );
  const send = useCallback(
    (text: string) =>
      portalFetch<ChatMessageDto>(token, "/chat", {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    [token],
  );
  const markRead = useCallback(
    () => portalFetch(token, "/chat/read", { method: "POST" }).then(() => undefined),
    [token],
  );
  return (
    <div className="space-y-3">
      {initial.teachers.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="portal-chat-teachers">
          {t("teachers", { names: initial.teachers.join(", ") })}
        </p>
      )}
      <ChatThread
        initial={initial}
        load={load}
        send={send}
        markRead={markRead}
        canWrite
        emptyText={t("empty")}
        placeholder={t("placeholder")}
        sendLabel={t("send")}
        sendingLabel={t("sending")}
        viaTelegramLabel={t("viaTelegram")}
        youLabel={t("you")}
        testId="portal-chat"
      />
      {!telegramLinked && <p className="text-xs text-muted-foreground">{t("telegramHint")}</p>}
    </div>
  );
}
