import { useLocalSearchParams } from "expo-router";
import { RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAssistantInfo } from "@/api/office-assistant";
import { Header } from "@/components/header";
import { Press } from "@/components/motion";
import { Notice, Screen, Segmented, type ScreenScroll } from "@/components/surface";
import { Text } from "@/components/text";
import { useOpenPath } from "@/features/office/site-paths";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { useAssistantChat } from "./assistant-store";
import { BriefingPanel } from "./briefing";
import { Conversation, QuestionBar } from "./conversation";
import { markSummarySeen } from "./summary-seen";

type Tab = "summary" | "chat";

/** A reading width for a conversation and for the summary's rows on a tablet. */
const COLUMN = { width: "100%", maxWidth: 720, alignSelf: "center" } as const;

/**
 * The assistant (A-253): the site's Assistant page and its floating assistant
 * in one screen with two tabs. Summary is the person's figures of a period
 * with a conclusion (the site's A-190); Ask is the conversation (A-185). The
 * server decides what each role is shown and told; a teacher's assistant reads
 * only the groups they teach.
 */
export function AssistantScreen() {
  const ta = useTranslations("assistant");
  const { colors } = useTheme();
  const me = useMe();
  const userId = me.user.id;
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "summary" ? "summary" : "chat");
  const info = useAssistantInfo();
  const chat = useAssistantChat(userId);
  const { open, error: siteError } = useOpenPath();
  const scroll = useRef<ScreenScroll>(null);

  // A new line of the conversation is at the end of the page: the page follows it. "Thinking…"
  // giving way to the answer is a new line too, though the count of lines stays the same.
  const lines = `${chat.turns.length}:${chat.busy}:${chat.error ? 1 : 0}`;
  useEffect(() => {
    if (tab !== "chat" || lines === "0:false:0") return;
    const timer = setTimeout(() => scroll.current?.end(), 60);
    return () => clearTimeout(timer);
  }, [tab, lines]);

  const shown = useCallback(() => void markSummarySeen(userId), [userId]);

  const header = (
    <Header
      back
      title={ta("title")}
      right={
        tab === "chat" && chat.turns.length > 0 ? (
          <Press
            onPress={chat.clear}
            accessibilityRole="button"
            accessibilityLabel={ta("clear")}
            hitSlop={8}
            sink={0.88}
            style={styles.clear}
            testID="assistant-clear"
          >
            <RotateCcw size={20} color={colors.foreground} />
          </Press>
        ) : undefined
      }
    />
  );
  if (!info.data) return <PendingScreen header={header} query={info} />;

  // A conversation that was answered tells how it was answered; before that, the centre's setting.
  const mode = chat.mode ?? info.data.mode;
  return (
    <Screen
      header={header}
      scrollRef={scroll}
      footer={
        tab === "chat" ? (
          <View style={COLUMN}>
            <QuestionBar userId={userId} />
          </View>
        ) : undefined
      }
      footerField={tab === "chat"}
    >
      <View style={[COLUMN, styles.page]} testID="assistant">
        <Segmented
          options={[
            { value: "summary" as const, label: ta("launcher.summary") },
            { value: "chat" as const, label: ta("launcher.chat") },
          ]}
          value={tab}
          onChange={setTab}
          testID="assistant-tab"
        />
        {siteError ? <Notice tone="destructive">{siteError}</Notice> : null}
        {tab === "summary" ? (
          <BriefingPanel onShown={shown} />
        ) : (
          <View style={styles.page}>
            {chat.turns.length === 0 ? (
              <Text variant="small" tone="mutedForeground" testID="assistant-hint">
                {ta(info.data.audience === "teacher" ? "hintTeacher" : "hint")}
              </Text>
            ) : null}
            {mode === "fake" ? (
              <View style={styles.tight}>
                <Notice tone="warning" testID="assistant-mode-test">
                  {ta("testMode")}
                </Notice>
                {info.data.canConfigure ? (
                  <Press
                    onPress={() => open("/settings/integrations")}
                    accessibilityRole="link"
                    sink={0.99}
                    style={styles.link}
                    testID="assistant-settings"
                  >
                    <Text variant="smallStrong" tone="primary">
                      {ta("settings")}
                    </Text>
                  </Press>
                ) : null}
              </View>
            ) : (
              <Text variant="small" tone="mutedForeground" testID="assistant-mode-live">
                {ta("liveMode", { model: info.data.model })}
              </Text>
            )}
            <Conversation userId={userId} audience={info.data.audience} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: space[4] },
  tight: { gap: space[1] },
  // A link under its note, with room for a thumb.
  link: { alignSelf: "flex-start", paddingVertical: space[2], paddingHorizontal: space[1] },
  clear: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
});
