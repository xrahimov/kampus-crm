import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";

import {
  fetchGroupChat,
  groupPageKeys,
  markGroupChatRead,
  sendGroupMessage,
  useGroupChat,
} from "@/api/group-pages";
import { useGroup } from "@/api/hooks";
import type { ChatMessage, GroupChat } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { EmptyState, Loading, Screen } from "@/components/surface";
import { ChatThread } from "@/features/shared/chat-thread";
import { errorText, useTranslations } from "@/lib/i18n";

/**
 * A group's chat on the teacher's side, in the app (A-214): the thread the
 * students read on their page and in Telegram. Opening it reads it.
 */
export function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const client = useQueryClient();
  const group = useGroup(id);
  const query = useGroupChat(id);

  const load = useCallback((after: string | null) => fetchGroupChat(id, after), [id]);
  const send = useCallback((text: string) => sendGroupMessage(id, text), [id]);
  // Reading the chat clears the count on the group's screen too.
  const markRead = useCallback(() => {
    void markGroupChatRead(id)
      .then(() =>
        client.setQueryData<GroupChat>(groupPageKeys.chat(id), (old) =>
          old ? { ...old, unread: 0 } : old,
        ),
      )
      .catch(() => undefined);
  }, [client, id]);
  const keep = useCallback(
    (messages: ChatMessage[]) => {
      client.setQueryData<GroupChat>(groupPageKeys.chat(id), (old) =>
        old ? { ...old, messages } : old,
      );
    },
    [client, id],
  );

  const header = <Header back title={t("groups.detail.tabs.chat")} subtitle={group.data?.name} />;
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
  return (
    <ChatThread
      header={header}
      initial={query.data.messages}
      note={t("groups.chat.hint")}
      emptyText={t("groups.chat.empty")}
      placeholder={t("groups.chat.placeholder")}
      load={load}
      send={send}
      markRead={markRead}
      onMessages={keep}
    />
  );
}
