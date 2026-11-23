import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  leadKeys,
  useCloseConversation,
  useConversation,
  type ConversationDetail,
  type ConversationMessage,
  type Lead,
} from "@/api/leads";
import type { ChatMessage, GroupChat } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { ChatThread } from "@/features/shared/chat-thread";
import { PendingScreen } from "@/features/shared/pending-screen";
import { api } from "@/lib/api";
import { centreToday } from "@/lib/days";
import { errorText, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { LeadFlow } from "./lead-flow";

/** A chat's message as the shared thread draws it: the centre's answers are "mine". */
function asBubble(message: ConversationMessage, who: string): ChatMessage {
  const out = message.direction === "OUT";
  return {
    id: message.id,
    text: message.text,
    at: message.createdAt,
    source: "TELEGRAM",
    author: { kind: out ? "STAFF" : "STUDENT", name: out ? (message.sentByName ?? "") : who },
    mine: out,
  };
}

/**
 * One chat of the inbox (A-232): what the person wrote and what the centre
 * answered, with a box to answer in; the answer goes out through the centre's
 * bot. **Actions** opens the lead the chat belongs to, and closes or reopens
 * the chat. Opening the chat reads it.
 */
export function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const ti = useTranslations("leads.inbox");
  const me = useMe();
  const client = useQueryClient();
  const query = useConversation(id);
  const close = useCloseConversation(id);
  const [acting, setActing] = useState(false);
  const [lead, setLead] = useState<Lead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const who = query.data?.conversation.displayName ?? "";

  const load = useCallback(
    async (_after: string | null): Promise<GroupChat> => {
      const detail = await api<ConversationDetail>(`/leads/inbox/${id}`);
      client.setQueryData(leadKeys.conversation(id), detail);
      const name = detail.conversation.displayName;
      return { messages: detail.messages.map((m) => asBubble(m, name)), unread: 0 };
    },
    [client, id],
  );
  const send = useCallback(
    async (text: string): Promise<ChatMessage> => {
      const sent = await api<ConversationMessage>(`/leads/inbox/${id}/messages`, {
        method: "POST",
        body: { text },
      });
      void client.invalidateQueries({ queryKey: ["leads", "inbox"] });
      return asBubble(sent, who);
    },
    [client, id, who],
  );
  // Asking for the chat is what reads it; the list's count follows.
  const markRead = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["leads", "inbox"] });
    void client.invalidateQueries({ queryKey: leadKeys.options });
  }, [client]);

  if (!query.data) {
    return <PendingScreen header={<Header title={ti("title")} back />} query={query} />;
  }
  const { conversation, messages } = query.data;
  const mayChange = can(me, "leads.update");

  const openLead = () => {
    if (!conversation.lead) return;
    setProblem(null);
    api<Lead>(`/leads/${conversation.lead.id}`)
      .then((found) => {
        setActing(false);
        setLead(found);
      })
      .catch((e: unknown) => setProblem(errorText(t, e)));
  };

  return (
    <>
      <ChatThread
        header={
          <Header
            back
            title={conversation.displayName}
            subtitle={
              conversation.isClosed
                ? ti("closed")
                : (conversation.lead?.columnName ?? conversation.username ?? undefined)
            }
            right={
              <Button
                variant="outline"
                compact
                label={t("common.actions")}
                onPress={() => setActing(true)}
                testID="conversation-actions"
              />
            }
          />
        }
        initial={messages.map((m) => asBubble(m, conversation.displayName))}
        emptyText={ti("noMessages")}
        placeholder={t("mobile.office.replyPlaceholder")}
        load={load}
        send={send}
        markRead={markRead}
      />
      <Sheet
        open={acting}
        onClose={() => setActing(false)}
        title={conversation.displayName}
        testID="conversation-sheet"
      >
        <View style={styles.column}>
          {conversation.lead ? (
            <>
              <Text tone="mutedForeground">
                {conversation.lead.fullName} · {conversation.lead.columnName}
              </Text>
              <Button
                variant="outline"
                label={ti("openLead")}
                onPress={openLead}
                testID="conversation-lead"
              />
            </>
          ) : null}
          {mayChange ? (
            <Button
              variant="outline"
              label={conversation.isClosed ? ti("reopen") : ti("close")}
              loading={close.isPending}
              onPress={() =>
                close.mutate(!conversation.isClosed, { onSuccess: () => setActing(false) })
              }
              testID="conversation-close"
            />
          ) : null}
          {problem ? <Notice tone="destructive">{problem}</Notice> : null}
          {close.error ? <Notice tone="destructive">{errorText(t, close.error)}</Notice> : null}
        </View>
      </Sheet>
      <LeadFlow lead={lead} onClose={() => setLead(null)} today={centreToday()} />
    </>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[3] },
});
