"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { ChatThread } from "@/features/shared/chat-thread";
import { api } from "@/lib/api-client";
import type { ChatMessageDto, GroupChatDto } from "@/server/services/chat/group-chat.service";

/** The group's chat with its students (A-170) on the group page. */
export function GroupChatTab({
  groupId,
  initial,
  canWrite,
}: {
  groupId: string;
  initial: GroupChatDto;
  canWrite: boolean;
}) {
  const t = useTranslations("groups.chat");
  const load = useCallback(
    (after: string | null) =>
      api<GroupChatDto>(`/groups/${groupId}/chat${after ? `?after=${after}` : ""}`),
    [groupId],
  );
  const send = useCallback(
    (text: string) =>
      api<ChatMessageDto>(`/groups/${groupId}/chat`, { method: "POST", body: { text } }),
    [groupId],
  );
  const markRead = useCallback(
    () => api(`/groups/${groupId}/chat/read`, { method: "POST" }).then(() => undefined),
    [groupId],
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <ChatThread
        initial={initial}
        load={load}
        send={send}
        markRead={markRead}
        canWrite={canWrite}
        readOnlyHint={t("archived")}
        emptyText={t("empty")}
        placeholder={t("placeholder")}
        sendLabel={t("send")}
        sendingLabel={t("sending")}
        viaTelegramLabel={t("viaTelegram")}
        youLabel={t("you")}
        testId="group-chat"
      />
    </div>
  );
}
