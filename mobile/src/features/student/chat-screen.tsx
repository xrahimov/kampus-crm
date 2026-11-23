import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";

import { usePortal } from "@/api/hooks";
import {
  fetchChat,
  fetchChatAfter,
  markChatRead,
  portalKeys,
  sendChatMessage,
  usePortalChat,
} from "@/api/portal";
import type { ChatMessage, PortalChat } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { EmptyState, Loading, Screen } from "@/components/surface";
import { ChatThread } from "@/features/shared/chat-thread";
import { errorText, useTranslations } from "@/lib/i18n";

/**
 * The group chat on the student's side, in the app (A-213): the same thread
 * the teacher sees on the group's page and students see on their personal
 * page or in Telegram. Opening it reads it.
 */
export function ChatScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const client = useQueryClient();
  const portal = usePortal(token);
  const query = usePortalChat(token);

  const load = useCallback(
    (after: string | null) => (after ? fetchChatAfter(token, after) : fetchChat(token)),
    [token],
  );
  const send = useCallback((text: string) => sendChatMessage(token, text), [token]);
  // Reading the chat clears the count on the group's page too.
  const markRead = useCallback(() => {
    void markChatRead(token)
      .then(() =>
        client.setQueryData<PortalChat>(portalKeys.chat(token), (old) =>
          old ? { ...old, unread: 0 } : old,
        ),
      )
      .catch(() => undefined);
  }, [client, token]);
  // What was written here is there when the chat is opened again.
  const keep = useCallback(
    (messages: ChatMessage[]) => {
      client.setQueryData<PortalChat>(portalKeys.chat(token), (old) =>
        old ? { ...old, messages } : old,
      );
    },
    [client, token],
  );

  const header = (
    <Header back title={t("portal.tabs.chat")} subtitle={portal.data?.portal.group.name} />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      </Screen>
    );
  }
  const { teachers } = query.data;
  return (
    <ChatThread
      header={header}
      initial={query.data.messages}
      note={
        teachers.length > 0 ? t("portal.chat.teachers", { names: teachers.join(", ") }) : undefined
      }
      emptyText={t("portal.chat.empty")}
      load={load}
      send={send}
      markRead={markRead}
      onMessages={keep}
    />
  );
}
